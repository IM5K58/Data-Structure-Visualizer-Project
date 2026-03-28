import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { CircularState, MemoryNode } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    data: CircularState;
}

interface LayoutNode {
    node: MemoryNode;
    x: number;
    y: number;
    cx: number; // node center x
    cy: number; // node center y
}

interface CircularEdge {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isCycleBack: boolean;
    isNew: boolean;
}

const NODE_W = 144;
const NODE_H_BASE = 36;
const FIELD_H = 28;

function nodeHeight(node: MemoryNode): number {
    return NODE_H_BASE + Object.keys(node.fields).length * FIELD_H +
        Object.keys(node.pointers).length * FIELD_H;
}

/**
 * Follow pointer chain from headId to determine circular order.
 * Returns node IDs in traversal order.
 */
function getCircularOrder(nodes: MemoryNode[], headId: string | null): string[] {
    if (!headId || nodes.length === 0) return nodes.map(n => n.id);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const order: string[] = [];
    const visited = new Set<string>();
    let current: string | null = headId;
    while (current && !visited.has(current) && nodeMap.has(current)) {
        visited.add(current);
        order.push(current);
        const node: MemoryNode = nodeMap.get(current)!;
        const nextPtr: string | null = (Object.values(node.pointers) as (string | null)[]).find((p): p is string => !!p && !visited.has(p)) ?? null;
        current = nextPtr ?? null;
    }
    // Append any unreachable nodes
    nodes.forEach(n => { if (!visited.has(n.id)) order.push(n.id); });
    return order;
}

function computeCircularLayout(nodes: MemoryNode[], headId: string | null): LayoutNode[] {
    if (nodes.length === 0) return [];
    const order = getCircularOrder(nodes, headId);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const N = order.length;
    const R = Math.max(150, N * 50);
    const padding = NODE_W;
    const svgCx = R + padding;
    const svgCy = R + padding;

    return order.map((id, i) => {
        const node = nodeMap.get(id)!;
        const angle = (2 * Math.PI * i) / N - Math.PI / 2; // start at top
        const cx = svgCx + R * Math.cos(angle);
        const cy = svgCy + R * Math.sin(angle);
        return {
            node,
            x: cx - NODE_W / 2,
            y: cy - nodeHeight(node) / 2,
            cx,
            cy,
        };
    });
}

export default function CircularListView({ data }: Props) {
    const mainRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const prevNodeIds = useRef<Set<string>>(new Set());
    const [newNodeIds, setNewNodeIds] = useState<Set<string>>(new Set());
    const hasAutocentered = useRef(false);

    useEffect(() => {
        const currentIds = new Set(data.nodes.map(n => n.id));
        const newlyAdded = new Set([...currentIds].filter(id => !prevNodeIds.current.has(id)));
        if (newlyAdded.size > 0) {
            setNewNodeIds(newlyAdded);
            setTimeout(() => setNewNodeIds(new Set()), 1000);
        }
        prevNodeIds.current = currentIds;
    }, [data.nodes]);

    useEffect(() => {
        const container = mainRef.current;
        if (!container) return;
        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                setScale(prev => Math.min(Math.max(0.3, prev - e.deltaY * 0.001), 2.5));
            }
        };
        container.addEventListener('wheel', onWheel, { passive: false });
        return () => container.removeEventListener('wheel', onWheel);
    }, []);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('button')) return;
        isDragging.current = true;
        lastPos.current = { x: e.clientX, y: e.clientY };
        if (mainRef.current) mainRef.current.style.cursor = 'grabbing';

        const onMouseMove = (ev: MouseEvent) => {
            if (!isDragging.current) return;
            const dx = ev.clientX - lastPos.current.x;
            const dy = ev.clientY - lastPos.current.y;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastPos.current = { x: ev.clientX, y: ev.clientY };
        };

        const onMouseUp = () => {
            isDragging.current = false;
            if (mainRef.current) mainRef.current.style.cursor = 'grab';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, []);

    const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); hasAutocentered.current = false; };

    const layoutNodes = useMemo(
        () => computeCircularLayout(data.nodes, data.headId),
        [data.nodes, data.headId]
    );
    const posMap = useMemo(
        () => new Map(layoutNodes.map(ln => [ln.node.id, ln])),
        [layoutNodes]
    );
    const allIds = useMemo(() => new Set(data.nodes.map(n => n.id)), [data.nodes]);
    const order = useMemo(() => getCircularOrder(data.nodes, data.headId), [data.nodes, data.headId]);

    // Auto-center on first render
    useEffect(() => {
        if (layoutNodes.length === 0 || !mainRef.current) return;
        if (hasAutocentered.current) return;
        const container = mainRef.current;
        const containerW = container.clientWidth;
        const containerH = container.clientHeight;

        const minX = Math.min(...layoutNodes.map(ln => ln.x));
        const maxX = Math.max(...layoutNodes.map(ln => ln.x)) + NODE_W;
        const minY = Math.min(...layoutNodes.map(ln => ln.y));
        const maxY = Math.max(...layoutNodes.map(ln => ln.y + nodeHeight(ln.node)));

        const treeW = maxX - minX;
        const treeH = maxY - minY;

        const offsetX = (containerW - treeW * scale) / 2 - minX * scale;
        const offsetY = (containerH - treeH * scale) / 2 - minY * scale;

        setOffset({ x: offsetX, y: offsetY });
        hasAutocentered.current = true;
    }, [layoutNodes, scale]);

    // Build edges following pointer chain
    const edges = useMemo<CircularEdge[]>(() => {
        const result: CircularEdge[] = [];
        const nodeMap = new Map(data.nodes.map(n => [n.id, n]));
        const orderSet = new Set(order);

        for (let i = 0; i < order.length; i++) {
            const fromId = order[i];
            const node = nodeMap.get(fromId);
            if (!node) continue;
            const from = posMap.get(fromId);
            if (!from) continue;

            for (const [, targetId] of Object.entries(node.pointers)) {
                if (!targetId || !allIds.has(targetId)) continue;
                const to = posMap.get(targetId);
                if (!to) continue;

                // cycle-back edge: last node → first node (or back to already-visited)
                const isCycleBack = orderSet.has(targetId) &&
                    order.indexOf(targetId) < order.indexOf(fromId);

                result.push({
                    id: `${fromId}-${targetId}`,
                    x1: from.cx,
                    y1: from.cy,
                    x2: to.cx,
                    y2: to.cy,
                    isCycleBack,
                    isNew: newNodeIds.has(targetId),
                });
            }
        }
        return result;
    }, [layoutNodes, newNodeIds, allIds, order, posMap, data.nodes]);

    if (!data.nodes || data.nodes.length === 0) {
        return <div className="p-4 text-text-muted text-xs font-mono">/* Circular List Empty */</div>;
    }

    // SVG canvas size
    const N = layoutNodes.length;
    const R = Math.max(150, N * 50);
    const padding = NODE_W;
    const svgSize = (R + padding) * 2;

    return (
        <div
            ref={mainRef}
            className="flex flex-col items-center w-full min-h-[400px] h-full relative font-mono overflow-hidden select-none bg-black/5 rounded-lg cursor-grab"
            onMouseDown={handleMouseDown}
        >
            <h3 className="text-xs font-bold text-amber-400 mb-4 uppercase tracking-widest absolute top-0 left-4 z-20 pointer-events-none p-4">
                Circular List
            </h3>

            <div className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-bg-panel/80 backdrop-blur-md border border-border p-1.5 rounded-lg shadow-xl pointer-events-auto">
                <button onClick={() => setScale(prev => Math.max(0.3, prev - 0.1))} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-text-secondary transition-colors">−</button>
                <div className="px-2 text-[10px] font-bold text-accent-cyan min-w-[45px] text-center cursor-pointer hover:text-white" onClick={resetView}>{Math.round(scale * 100)}%</div>
                <button onClick={() => setScale(prev => Math.min(2.5, prev + 0.1))} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-text-secondary transition-colors">+</button>
            </div>

            <div
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0' }}
                className="absolute inset-0"
            >
                {/* SVG Edges */}
                <svg
                    style={{ width: svgSize, height: svgSize }}
                    className="absolute pointer-events-none z-10 overflow-visible"
                >
                    <defs>
                        <marker id="circ-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="rgba(74, 222, 128, 0.8)" />
                        </marker>
                        <marker id="circ-arrow-back" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="rgba(251, 191, 36, 0.9)" />
                        </marker>
                    </defs>
                    <AnimatePresence>
                        {edges.map(e => {
                            const dx = e.x2 - e.x1;
                            const dy = e.y2 - e.y1;
                            const mx = (e.x1 + e.x2) / 2;
                            const my = (e.y1 + e.y2) / 2;
                            // Curve outward from center for cycle-back, inward for normal
                            const curvature = e.isCycleBack ? 1.4 : 0.3;
                            const cx1 = mx - dy * curvature;
                            const cy1 = my + dx * curvature;
                            const path = `M ${e.x1} ${e.y1} Q ${cx1} ${cy1} ${e.x2} ${e.y2}`;

                            return (
                                <motion.path
                                    key={e.id}
                                    initial={e.isNew ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
                                    animate={{ pathLength: 1, opacity: e.isCycleBack ? 0.85 : 0.7 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.6, ease: 'easeInOut', delay: e.isNew ? 0.2 : 0 }}
                                    d={path}
                                    fill="none"
                                    stroke={e.isCycleBack ? 'rgba(251, 191, 36, 0.9)' : 'rgba(74, 222, 128, 0.8)'}
                                    strokeWidth={2 / scale}
                                    strokeDasharray={e.isCycleBack ? `${6 / scale} ${3 / scale}` : undefined}
                                    markerEnd={e.isCycleBack ? 'url(#circ-arrow-back)' : 'url(#circ-arrow)'}
                                    className={e.isCycleBack ? 'drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]' : 'drop-shadow-[0_0_6px_rgba(74,222,128,0.3)]'}
                                />
                            );
                        })}
                    </AnimatePresence>
                </svg>

                {/* Nodes */}
                <AnimatePresence>
                    {layoutNodes.map(ln => {
                        const { node, x, y } = ln;
                        const isNew = newNodeIds.has(node.id);
                        const isHead = node.id === data.headId;

                        return (
                            <motion.div
                                key={node.id}
                                initial={isNew ? { opacity: 0, scale: 0.3 } : false}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{
                                    opacity: { duration: 0.4 },
                                    scale: { type: 'spring', stiffness: 200, damping: 15 },
                                }}
                                style={{
                                    position: 'absolute',
                                    left: x,
                                    top: y,
                                    width: NODE_W,
                                    transition: 'left 0.4s ease, top 0.4s ease',
                                }}
                                className="z-20"
                            >
                                {isHead && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="absolute -top-8 left-1/2 -translate-x-1/2 bg-amber-500 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-[0_0_15px_rgba(251,191,36,0.6)] z-30 whitespace-nowrap"
                                    >
                                        HEAD
                                    </motion.div>
                                )}

                                {(isNew || isHead) && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: [0, 0.35, 0], scale: [0.9, 1.2, 0.9] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                        className="absolute inset-[-20px] bg-amber-500/15 blur-[25px] rounded-full z-[-1]"
                                    />
                                )}

                                <div className={`flex flex-col items-center transition-shadow duration-500 ${isNew || isHead ? 'shadow-[0_0_40px_rgba(251,191,36,0.3)]' : ''}`}>
                                    <div className="bg-bg-tertiary px-3 py-1 rounded-t-lg border border-border text-[10px] font-bold text-text-secondary w-full text-center tracking-wider z-10">
                                        {node.type}
                                    </div>
                                    <div className="bg-bg-panel border border-t-0 border-border rounded-b-lg shadow-xl shadow-bg-secondary/20 overflow-hidden w-full">
                                        {Object.entries(node.fields).map(([fname, val]) => (
                                            <div key={fname} className="flex border-b border-border/40 text-xs text-center">
                                                <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted bg-black/10 text-[11px] font-mono tracking-tighter truncate">{fname}</div>
                                                <div className="w-[55%] p-1.5 text-accent-cyan font-bold truncate">{val !== undefined ? String(val) : '?'}</div>
                                            </div>
                                        ))}
                                        {Object.entries(node.pointers).map(([pname, targetId]) => (
                                            <div key={pname} className="flex border-b border-border/40 text-xs bg-amber-500/5">
                                                <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted text-center bg-black/20 text-[11px] font-mono tracking-tighter truncate">{pname}</div>
                                                <div className="w-[55%] p-1.5 text-amber-400 text-center tracking-tighter truncate opacity-80 font-bold bg-amber-500/5">
                                                    {targetId ? `*${(targetId as string).slice(-4)}` : 'null'}
                                                </div>
                                            </div>
                                        ))}
                                        {Object.keys(node.fields).length === 0 && Object.keys(node.pointers).length === 0 && (
                                            <div className="p-4 text-center text-[10px] text-text-muted italic opacity-50 font-mono">Uninitialized</div>
                                        )}
                                    </div>
                                </div>

                                {node.labels.length > 0 && (
                                    <div className="mt-1 flex gap-1 flex-wrap justify-center">
                                        {node.labels.map(lbl => (
                                            <span key={lbl} className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[9px] text-amber-300 font-mono font-bold">
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
    );
}
