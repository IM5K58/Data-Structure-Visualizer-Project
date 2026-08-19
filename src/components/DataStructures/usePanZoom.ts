import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
    CSSProperties,
    KeyboardEvent as ReactKeyboardEvent,
    PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * One pan/zoom state machine for every view that has a viewport.
 *
 * Four hand-written copies had drifted into two incompatible designs wearing
 * similar clothes, and each carried bugs the others did not:
 *
 *  - `reset()` set offset to {0,0}, which is the identity view only for the two
 *    views that never auto-centre. For the other two it moved content off
 *    screen permanently: their re-centre effect depended on [layout, scale], so
 *    resetting at scale 1 made `setScale(1)` a no-op and the effect never ran.
 *  - Auto-centring was latched by a ref that was set on the first non-empty
 *    render and never cleared, so a tree growing from 1 to 15 nodes kept the
 *    one-node framing forever.
 *  - The wheel listener was registered in a `[]`-deps effect against a ref that
 *    is null when a view mounts with zero nodes — reachable, because the
 *    reducer creates empty tree/circular structures — which killed ctrl+wheel
 *    zoom for that panel's whole lifetime.
 *  - Drag used window listeners registered per gesture (leaked on unmount) or
 *    React handlers that ran on every idle mousemove and aborted the gesture as
 *    soon as the pointer left the box.
 *  - No view re-fitted on panel resize: all four are memoised and Visualizer
 *    passes reference-stable props, so a resize does not re-render them at all.
 *    Any props-driven re-fit design is stillborn; the observer has to live here.
 */

export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export interface Padding { top?: number; right?: number; bottom?: number; left?: number }

interface PanZoomBase {
    /** Per view. Deliberately not a shared constant — a tree wants to zoom out
     *  further than a three-node graph. */
    minScale: number;
    maxScale: number;
    buttonStep?: number;
    wheelRate?: number;
    keyPanStep?: number;
}

/**
 * transformOrigin and fitting are coupled, so the illegal combinations are made
 * unrepresentable: the `- minX * scale` term in the fit is only correct at
 * '0 0', and a canvas centred with `left-1/2 -translate-x-1/2` only works at
 * 'center center'.
 */
export type PanZoomOptions =
    | (PanZoomBase & {
        transformOrigin: 'center center';
        getContentBounds?: never;
        fitPadding?: never;
        refitKey?: never;
    })
    | (PanZoomBase & {
        transformOrigin: '0 0';
        /** Content extent in the transformed layer's own coordinates. The hook
         *  keeps this in a ref, so an inline arrow retriggers nothing. */
        getContentBounds: () => Bounds | null;
        fitPadding?: Padding;
        /** Re-fit when this changes — but only while the user has not taken over. */
        refitKey: unknown;
    });

export interface PanZoom {
    containerProps: {
        ref: (el: HTMLDivElement | null) => void;
        onPointerDown: (e: ReactPointerEvent) => void;
        onKeyDown: (e: ReactKeyboardEvent) => void;
        tabIndex: 0;
        style: CSSProperties;
    };
    /**
     * Spread onto the transformed layer.
     *
     * Do NOT put this (or `scale`) in a DOM-measurement effect's dependency
     * array: offsetTop/offsetLeft are unaffected by ancestor transforms, so
     * doing that restarts a forced-layout burst on every frame of a pan.
     */
    transformStyle: CSSProperties;
    scale: number;
    zoomIn: () => void;
    zoomOut: () => void;
    /** Restore this view's identity view, computed synchronously here. */
    reset: () => void;
}

/** The only clamp. Wheel, buttons and programmatic sets all pass through it. */
export function clampScale(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

/** The only fit. One formula, symmetric in both axes; padding shrinks the viewport. */
export function fitOffset(
    b: Bounds,
    viewport: { w: number; h: number },
    scale: number,
    pad: Padding = {},
): { x: number; y: number } {
    const pl = pad.left ?? 0, pr = pad.right ?? 0;
    const pt = pad.top ?? 0, pb = pad.bottom ?? 0;
    return {
        x: pl + (viewport.w - pl - pr - (b.maxX - b.minX) * scale) / 2 - b.minX * scale,
        y: pt + (viewport.h - pt - pb - (b.maxY - b.minY) * scale) / 2 - b.minY * scale,
    };
}

export function usePanZoom(o: PanZoomOptions): PanZoom {
    const {
        minScale, maxScale,
        buttonStep = 0.1,
        wheelRate = 0.001,
        keyPanStep = 40,
        transformOrigin,
    } = o;

    // A callback ref stored in state, so effects re-run when the element
    // *appears* rather than only when the component mounts.
    const [el, setEl] = useState<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setPanning] = useState(false);

    const dragOrigin = useRef({ x: 0, y: 0 });
    /** Set by a real drag movement or any zoom; only reset() clears it. */
    const userAdjusted = useRef(false);

    const boundsRef = useRef(o.getContentBounds);
    boundsRef.current = o.getContentBounds;
    const padRef = useRef(o.fitPadding);
    padRef.current = o.fitPadding;

    const canFit = transformOrigin === '0 0';

    /** Compute the fitted offset for a given scale, or null if not fittable. */
    const computeFit = useCallback((target: HTMLDivElement | null, atScale: number) => {
        if (!canFit || !target) return null;
        const b = boundsRef.current?.();
        if (!b) return null;
        const w = target.clientWidth, h = target.clientHeight;
        if (w === 0 || h === 0) return null;
        return fitOffset(b, { w, h }, atScale, padRef.current);
    }, [canFit]);

    // ── Zoom ────────────────────────────────────────────────────────────────
    // At '0 0' the zoom is anchored so content stays under the cursor; at
    // 'center center' the browser already anchors it, so only scale changes.
    const applyZoom = useCallback((next: number, anchor?: { x: number; y: number }) => {
        userAdjusted.current = true;
        setScale(prev => {
            const s = clampScale(next, minScale, maxScale);
            if (canFit && anchor) {
                setOffset(off => ({
                    x: anchor.x - ((anchor.x - off.x) / prev) * s,
                    y: anchor.y - ((anchor.y - off.y) / prev) * s,
                }));
            }
            return s;
        });
    }, [canFit, minScale, maxScale]);

    const zoomIn = useCallback(() => {
        const c = el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : undefined;
        setScale(prev => {
            applyZoom(prev + buttonStep, c);
            return prev;
        });
    }, [applyZoom, buttonStep, el]);

    const zoomOut = useCallback(() => {
        const c = el ? { x: el.clientWidth / 2, y: el.clientHeight / 2 } : undefined;
        setScale(prev => {
            applyZoom(prev - buttonStep, c);
            return prev;
        });
    }, [applyZoom, buttonStep, el]);

    // ── Wheel ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;   // metaKey: macOS Cmd
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            applyZoom(scale - e.deltaY * wheelRate, {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [el, applyZoom, scale, wheelRate]);

    // ── Drag ────────────────────────────────────────────────────────────────
    const onPointerDown = useCallback((e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('button')) return;
        dragOrigin.current = { x: e.clientX, y: e.clientY };
        setPanning(true);
        // Best effort only — behaviour must not depend on it (jsdom has none).
        try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    }, []);

    // Move/end listeners exist only while panning: no idle listeners, the
    // gesture survives leaving the box, and unmount always tears them down.
    useEffect(() => {
        if (!isPanning) return;
        const ac = new AbortController();
        const { signal } = ac;

        window.addEventListener('pointermove', (ev: PointerEvent) => {
            const dx = ev.clientX - dragOrigin.current.x;
            const dy = ev.clientY - dragOrigin.current.y;
            if (dx === 0 && dy === 0) return;
            userAdjusted.current = true;
            dragOrigin.current = { x: ev.clientX, y: ev.clientY };
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        }, { signal });

        const end = () => setPanning(false);
        window.addEventListener('pointerup', end, { signal });
        window.addEventListener('pointercancel', end, { signal });

        return () => ac.abort();
    }, [isPanning]);

    // ── Fit ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!canFit || !el || userAdjusted.current) return;
        const next = computeFit(el, scale);
        if (next) setOffset(next);
        // `scale` is intentionally absent: re-fitting on zoom would fight the user.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [el, o.refitKey, canFit, computeFit]);

    // The views are memoised and receive reference-stable props, so a panel
    // resize never re-renders them. The observer has to live here.
    useEffect(() => {
        if (!canFit || !el) return;
        const ro = new ResizeObserver(() => {
            if (userAdjusted.current) return;
            const next = computeFit(el, scale);
            if (next) setOffset(next);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [el, canFit, computeFit, scale]);

    const reset = useCallback(() => {
        userAdjusted.current = false;
        const fitted = computeFit(el, 1);
        setScale(1);
        setOffset(fitted ?? { x: 0, y: 0 });
    }, [computeFit, el]);

    // ── Keyboard ────────────────────────────────────────────────────────────
    const onKeyDown = useCallback((e: ReactKeyboardEvent) => {
        const pan = (dx: number, dy: number) => {
            userAdjusted.current = true;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        };
        switch (e.key) {
            case 'ArrowLeft':  pan(keyPanStep, 0); break;
            case 'ArrowRight': pan(-keyPanStep, 0); break;
            case 'ArrowUp':    pan(0, keyPanStep); break;
            case 'ArrowDown':  pan(0, -keyPanStep); break;
            case '+': case '=': zoomIn(); break;
            case '-': case '_': zoomOut(); break;
            case '0': reset(); break;
            default: return;
        }
        e.preventDefault();
    }, [keyPanStep, zoomIn, zoomOut, reset]);

    const containerProps = useMemo(() => ({
        ref: setEl,
        onPointerDown,
        onKeyDown,
        tabIndex: 0 as const,
        style: {
            touchAction: 'none' as const,
            cursor: isPanning ? ('grabbing' as const) : ('grab' as const),
        },
    }), [onPointerDown, onKeyDown, isPanning]);

    const transformStyle = useMemo<CSSProperties>(() => ({
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        transformOrigin,
        willChange: 'transform',
    }), [offset.x, offset.y, scale, transformOrigin]);

    return { containerProps, transformStyle, scale, zoomIn, zoomOut, reset };
}
