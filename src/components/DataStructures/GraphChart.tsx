import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { GraphState, MemoryNode } from '../../types';
import type { NodeHighlight } from '../Visualizer';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    data: GraphState;
    highlight?: NodeHighlight | null;
}

const NODE_W = 144;

interface LayoutPoint {
    node: MemoryNode;
    cx: number; // center x
    cy: number; // center y
}

interface EdgeRender {
    id: string;
    sourceId: string;
    targetId: string;
    field: string;
    isBidir: boolean;
}

/**
 * Deterministic radial layout: place N nodes evenly on a circle. Stable
 * across renders because the order is taken from data.nodes (which the
 * reducer preserves in allocation order).
 */
function radialLayout(nodes: MemoryNode[], cx: number, cy: number, radius: number): LayoutPoint[] {
    if (nodes.length === 0) return [];
    if (nodes.length === 1) return [{ node: nodes[0], cx, cy }];
    return nodes.map((node, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2; // start at top
        return {
            node,
            cx: cx + radius * Math.cos(angle),
            cy: cy + radius * Math.sin(angle),
        };
    });
}

/** Build the edge list and mark bidirectional pairs. */
function buildEdges(nodes: MemoryNode[]): EdgeRender[] {
    const ids = new Set(nodes.map(n => n.id));
    const fullOut = new Map<string, Set<string>>();
    for (const n of nodes) {
        fullOut.set(n.id, new Set());
        for (const t of Object.values(n.pointers)) {
            if (t && ids.has(t)) fullOut.get(n.id)!.add(t);
        }
    }
    const edges: EdgeRender[] = [];
    for (const n of nodes) {
        for (const [field, target] of Object.entries(n.pointers)) {
            if (!target || !ids.has(target)) continue;
            const isBidir = fullOut.get(target)?.has(n.id) ?? false;
            edges.push({
                id: `${n.id}-${field}-${target}`,
                sourceId: n.id,
                targetId: target,
                field,
                isBidir,
            });
        }
    }
    return edges;
}

export default function GraphChart({ data, highlight }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    const [pulse, setPulse] = useState<{ nodeId: string | null; property: string | null } | null>(null);
    useEffect(() => {
        if (!highlight || !highlight.nodeId) return;
        setPulse({ nodeId: highlight.nodeId, property: highlight.property });
        const t = setTimeout(() => setPulse(null), 700);
        return () => clearTimeout(t);
    }, [highlight]);

    // Layout dimensions — picked to comfortably fit up to ~12 nodes; the user
    // can pan/zoom for larger graphs.
    const W = 720, H = 520;
    const layout = useMemo(
        () => radialLayout(data.nodes, W / 2, H / 2, Math.min(W, H) * 0.35),
        [data.nodes],
    );
    const edges = useMemo(() => buildEdges(data.nodes), [data.nodes]);

    const posOf = (id: string) => layout.find(p => p.node.id === id);

    // ── Pan / Zoom ─────────────────────────────────────────────────────────
    const onMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('button')) return;
        isDragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
        if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
    };
    const onMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging.current) return;
        setOffset(prev => ({
            x: prev.x + (e.clientX - lastPos.current.x),
            y: prev.y + (e.clientY - lastPos.current.y),
        }));
        lastPos.current = { x: e.clientX, y: e.clientY };
    }, []);
    const onMouseUp = useCallback(() => {
        isDragging.current = false;
        if (containerRef.current) containerRef.current.style.cursor = 'default';
    }, []);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            setScale(s => Math.min(2, Math.max(0.4, s + (-e.deltaY * 0.001))));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);

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

        // Trim endpoints so arrows don't disappear into node boxes.
        const trim = NODE_W * 0.32; // approx half-width
        const x1 = s.cx + ux * trim;
        const y1 = s.cy + uy * trim;
        const x2 = t.cx - ux * trim;
        const y2 = t.cy - uy * trim;

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
            ref={containerRef}
            className="flex flex-col items-center w-full h-full relative font-mono overflow-hidden select-none bg-black/5 rounded-lg"
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
        >
            <h3 className="text-xs font-bold text-rose-400 mb-4 uppercase tracking-widest absolute top-0 left-4 z-20 pointer-events-none p-4">
                General Graph: <span className="text-rose-300">{data.name}</span>
            </h3>

            <div className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-bg-panel/80 backdrop-blur-md border border-border p-1.5 rounded-lg shadow-xl">
                <button onClick={() => setScale(s => Math.max(0.4, s - 0.1))} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-text-secondary transition-colors" title="Zoom Out">−</button>
                <div onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} className="px-2 text-[10px] font-bold text-rose-400 min-w-[45px] text-center cursor-pointer hover:text-white" title="Reset">
                    {Math.round(scale * 100)}%
                </div>
                <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-text-secondary transition-colors" title="Zoom In">+</button>
            </div>

            <div
                className="relative flex-1 w-full h-full"
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center' }}
            >
                <svg
                    width={W} height={H}
                    viewBox={`0 0 ${W} ${H}`}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ overflow: 'visible' }}
                >
                    <defs>
                        <marker id="graph-arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="rgba(244, 63, 94, 0.85)" />
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
                                    stroke={isPulsed ? 'rgb(0, 229, 255)' : 'rgba(244, 63, 94, 0.85)'}
                                    strokeWidth={isPulsed ? 3 : 1.8}
                                    markerEnd="url(#graph-arrowhead)"
                                    className="drop-shadow-[0_0_4px_rgba(244,63,94,0.4)]"
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
                                            ? 'ring-2 ring-accent-cyan rounded-lg shadow-[0_0_30px_rgba(0,229,255,0.5)]'
                                            : ''
                                    }`}
                                >
                                    <div className="bg-bg-tertiary px-3 py-1 rounded-t-lg border border-border text-[10px] font-bold text-text-secondary text-center tracking-wider z-10" style={{ width: NODE_W }}>
                                        {node.type}
                                    </div>
                                    <div className="bg-bg-panel border border-t-0 border-border rounded-b-lg shadow-xl overflow-hidden" style={{ width: NODE_W }}>
                                        {Object.entries(node.fields).map(([fname, val]) => {
                                            const fp = isPulsed && pulse?.property === fname;
                                            return (
                                                <div key={fname} className={`flex border-b border-border/40 text-xs text-center transition-colors duration-500 ${fp ? 'bg-accent-cyan/20' : ''}`}>
                                                    <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted bg-black/10 text-[11px] font-mono tracking-tighter truncate">{fname}</div>
                                                    <div className="w-[55%] p-1.5 text-rose-300 font-bold truncate">{val !== undefined ? String(val) : '?'}</div>
                                                </div>
                                            );
                                        })}
                                        {Object.entries(node.pointers).map(([pname, targetId]) => {
                                            const pp = isPulsed && pulse?.property === pname;
                                            return (
                                                <div key={pname} className={`flex border-b border-border/40 text-xs transition-colors duration-500 ${pp ? 'bg-accent-cyan/25' : 'bg-rose-500/5'}`}>
                                                    <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted text-center bg-black/20 text-[11px] font-mono tracking-tighter truncate">{pname}</div>
                                                    <div className="w-[55%] p-1.5 text-rose-300 text-center tracking-tighter truncate font-bold">
                                                        {targetId ? `*${(targetId as string).slice(-4)}` : 'null'}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
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
