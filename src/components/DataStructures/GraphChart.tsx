import { memo, useMemo } from 'react';
import type { GraphState, NodeHighlight } from '../../types';
import ZoomToolbar from './ZoomToolbar';
import { accentFor, PULSE_RING } from './accents';

/** A pulsed edge uses the app-wide highlight colour, not the panel accent. */
const PULSE_STROKE = 'rgb(0, 229, 255)';
import { motion, AnimatePresence } from 'framer-motion';
import { usePulse } from '../../hooks/usePulse';
import { usePanZoom } from './usePanZoom';
import { NodeCardBody } from './NodeCard';
import { NODE_CARD_W, buildEdges, computeRingLayout, nodeCardHeight, trimToBox } from './layout';
import type { EdgeRender } from './layout';

interface Props {
    data: GraphState;
    highlight?: NodeHighlight | null;
}

function GraphChart({ data, highlight }: Props) {
    const accent = accentFor('graph');
    // Marker ids are document-global: two panels of the same type would
    // otherwise emit the same id and the browser would use only the first.
    const markerId = `graph-arrow-${data.name}`;
    // Zoom range kept as it was for this view; the canvas is centred, so
    // there is nothing to fit.
    const { containerProps, transformStyle, scale, zoomIn, zoomOut, reset } = usePanZoom({
        transformOrigin: 'center center',
        minScale: 0.4,
        maxScale: 2,
    });

    const pulse = usePulse(
        highlight?.nodeId ? { nodeId: highlight.nodeId, property: highlight.property } : null,
        highlight
    );

    // The ring and its canvas both scale with the cards they carry. A fixed
    // 720x520 with a constant radius overlapped cards from seven nodes on.
    const { nodes: layout, W, H } = useMemo(
        () => computeRingLayout(data.nodes),
        [data.nodes],
    );
    const edges = useMemo(() => buildEdges(data.nodes), [data.nodes]);

    // Indexed lookup: drawing E edges each needing two endpoint lookups was
    // O(V·E) with a linear `find` per call.
    const posById = useMemo(
        () => new Map(layout.map(p => [p.node.id, p])),
        [layout],
    );
    const posOf = (id: string) => posById.get(id);

    // ── Edge path (SVG) ────────────────────────────────────────────────────
    function drawEdge(e: EdgeRender): { path: string; labelX: number; labelY: number } | null {
        const s = posOf(e.sourceId);
        const t = posOf(e.targetId);
        if (!s || !t) return null;

        if (e.sourceId === e.targetId) {
            // self-loop: small arc above node
            const r = 28;
            const x = s.cx, y = s.cy - 28;
            return {
                path: `M ${x - r * 0.3} ${y} A ${r} ${r} 0 1 1 ${x + r * 0.3} ${y}`,
                labelX: x,
                labelY: y - r - 4,
            };
        }

        // Curve away from the straight line so a→b and b→a don't overlap.
        // Use a perpendicular offset proportional to whether it's a bidir pair.
        const dx = t.cx - s.cx;
        const dy = t.cy - s.cy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        // Perpendicular unit (rotate 90° CCW). For bidir pair, source<target
        // takes positive offset, source>target takes negative — split visually.
        const sign = e.isBidir ? (e.sourceId < e.targetId ? 1 : -1) : 0;
        const px = -uy * sign * 24;
        const py =  ux * sign * 24;

        // Trim each endpoint against its OWN card box: a 3-row node can point at
        // a 5-row one, and the old constant (NODE_CARD_W * 0.32 = 46, against a
        // real half-width of 72) buried arrowheads inside the card.
        const sTrim = trimToBox(ux, uy, NODE_CARD_W / 2, nodeCardHeight(s.node) / 2);
        const tTrim = trimToBox(ux, uy, NODE_CARD_W / 2, nodeCardHeight(t.node) / 2);
        const x1 = s.cx + ux * sTrim;
        const y1 = s.cy + uy * sTrim;
        const x2 = t.cx - ux * tTrim;
        const y2 = t.cy - uy * tTrim;

        const cx = (x1 + x2) / 2 + px;
        const cy = (y1 + y2) / 2 + py;

        return {
            path: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
            labelX: cx,
            labelY: cy,
        };
    }

    return (
        <div
            {...containerProps}
            className="flex flex-col items-center w-full h-full relative font-mono overflow-hidden select-none bg-black/5 rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan/40"
        >
            <h3 className={`text-xs font-bold ${accent.heading} mb-4 uppercase tracking-widest absolute top-0 left-4 z-20 pointer-events-none p-4`}>
                General Graph: <span className="text-rose-300">{data.name}</span>
            </h3>

            <ZoomToolbar
                scale={scale}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                onReset={reset}
                tone={accent.heading}
                label="graph"
            />

            <div
                className="relative flex-1 w-full h-full"
                style={transformStyle}
            >
                <svg
                    width={W} height={H}
                    viewBox={`0 0 ${W} ${H}`}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ overflow: 'visible' }}
                >
                    <defs>
                        <marker id={markerId} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill={accent.edgeArrow} />
                        </marker>
                    </defs>
                    {edges.map(e => {
                        const drawn = drawEdge(e);
                        if (!drawn) return null;
                        const isPulsed = pulse?.nodeId === e.sourceId && pulse?.property === e.field;
                        return (
                            <g key={e.id}>
                                <path
                                    d={drawn.path}
                                    fill="none"
                                    stroke={isPulsed ? PULSE_STROKE : accent.edgeStroke}
                                    strokeWidth={(isPulsed ? 3 : 1.8) / scale}
                                    markerEnd={`url(#${markerId})`}
                                    className={accent.edgeGlow}
                                />
                                <text
                                    x={drawn.labelX}
                                    y={drawn.labelY}
                                    textAnchor="middle"
                                    className="pointer-events-none"
                                    style={{
                                        fill: isPulsed ? 'rgb(0,229,255)' : 'rgb(252,165,165)',
                                        fontSize: 9,
                                        fontFamily: 'monospace',
                                        fontWeight: 700,
                                        opacity: 0.85,
                                    }}
                                >
                                    {e.field}
                                </text>
                            </g>
                        );
                    })}
                </svg>

                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ width: W, height: H }}>
                    <AnimatePresence mode="popLayout">
                        {layout.map(({ node, cx, cy }) => {
                            const isPulsed = pulse?.nodeId === node.id;
                            return (
                                <motion.div
                                    key={node.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.6 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.6 }}
                                    transition={{ layout: { type: 'spring', stiffness: 220, damping: 28 }, opacity: { duration: 0.3 } }}
                                    style={{ position: 'absolute', left: cx, top: cy, transform: 'translate(-50%, -50%)' }}
                                    className={`flex flex-col items-center transition-shadow duration-500 ${
                                        isPulsed
                                            ? PULSE_RING
                                            : ''
                                    }`}
                                >
                                    <NodeCardBody
                                        node={node}
                                        pulse={pulse}
                                        width={NODE_CARD_W}
                                        bodyShadowClass="shadow-xl"
                                        tone={{
                                            fieldValue: 'text-rose-300',
                                            pointerRow: 'bg-rose-500/5',
                                            pointerValue: 'text-rose-400',
                                        }}
                                    />
                                    {node.labels.length > 0 && (
                                        <div className="mt-1 flex gap-1 flex-wrap justify-center">
                                            {node.labels.map(lbl => (
                                                <span key={lbl} className="px-1.5 py-0.5 rounded bg-rose-500/20 text-[9px] text-rose-300 font-mono font-bold">
                                                    {lbl}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            </div>

            <div className="absolute bottom-2 right-4 text-[10px] font-mono text-text-muted/60 z-20 pointer-events-none">
                {data.nodes.length} nodes · {edges.length} edges
            </div>
        </div>
    );
}

export default memo(GraphChart);
