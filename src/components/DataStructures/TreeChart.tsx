import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { TreeState, MemoryNode } from '../../types';
import type { NodeHighlight } from '../Visualizer';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    data: TreeState;
    highlight?: NodeHighlight | null;
}

interface LayoutNode {
    node: MemoryNode;
    x: number;
    y: number;
}

interface TreeEdge {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isNew: boolean;
}

const NODE_W = 144;
const NODE_H_BASE = 36;
const FIELD_H = 28;
const H_GAP = 32;
const LEVEL_HEIGHT = 120;

/**
 * Returns all child pointer IDs for a node (supports N-ary trees).
 */
function getChildIds(node: MemoryNode, allNodeIds: Set<string>): string[] {
    return Object.values(node.pointers).filter(
        (id): id is string => id !== null && id !== undefined && allNodeIds.has(id)
    );
}

function nodeHeight(node: MemoryNode): number {
    return NODE_H_BASE + Object.keys(node.fields).length * FIELD_H +
        Object.keys(node.pointers).length * FIELD_H;
}

/**
 * Computes N-ary tree layout using a two-pass bucket algorithm.
 * Pass 1 (bottom-up): compute subtree width for each node.
 * Pass 2 (top-down): assign X positions by distributing children proportionally.
 * All nodes at the same depth share the same Y coordinate.
 */
function computeLayout(nodes: MemoryNode[], rootId: string | null): LayoutNode[] {
    if (nodes.length === 0 || !rootId) return [];

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const allIds = new Set(nodes.map(n => n.id));
    const positioned = new Map<string, LayoutNode>();
    let orphanX = 0;

    // Pass 1: compute subtree widths bottom-up
    const subtreeWidths = new Map<string, number>();
    function computeWidth(nodeId: string, visited: Set<string>): number {
        if (visited.has(nodeId)) return NODE_W + H_GAP;
        visited.add(nodeId);
        const node = nodeMap.get(nodeId);
        if (!node) return NODE_W + H_GAP;
        const children = getChildIds(node, allIds);
        if (children.length === 0) {
            subtreeWidths.set(nodeId, NODE_W + H_GAP);
            return NODE_W + H_GAP;
        }
        const total = children.reduce((sum, cid) => sum + computeWidth(cid, visited), 0);
        subtreeWidths.set(nodeId, total);
        return total;
    }
    computeWidth(rootId, new Set());

    // Pass 2: place nodes top-down
    const visitedPlace = new Set<string>();
    function placeNode(nodeId: string, depth: number, centerX: number): void {
        if (visitedPlace.has(nodeId)) return;
        visitedPlace.add(nodeId);
        const node = nodeMap.get(nodeId);
        if (!node) return;

        positioned.set(nodeId, { node, x: centerX - NODE_W / 2, y: depth * LEVEL_HEIGHT });

        const children = getChildIds(node, allIds);
        if (children.length === 0) return;

        const totalW = children.reduce((sum, cid) => sum + (subtreeWidths.get(cid) ?? NODE_W + H_GAP), 0);
        let currentX = centerX - totalW / 2;
        for (const cid of children) {
            const cw = subtreeWidths.get(cid) ?? NODE_W + H_GAP;
            placeNode(cid, depth + 1, currentX + cw / 2);
            currentX += cw;
        }
    }
    placeNode(rootId, 0, 0);

    // Place any orphan nodes not reachable from root
    nodes.forEach(n => {
        if (!visitedPlace.has(n.id)) {
            positioned.set(n.id, { node: n, x: orphanX, y: 0 });
            orphanX += NODE_W + H_GAP;
        }
    });

    return Array.from(positioned.values());
}

export default function TreeChart({ data, highlight }: Props) {
    const mainRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });
    const prevNodeIds = useRef<Set<string>>(new Set());
    const [newNodeIds, setNewNodeIds] = useState<Set<string>>(new Set());
    const hasAutocentered = useRef(false);

    // Pulse the most recently changed node + field for ~700ms after a step.
    const [pulse, setPulse] = useState<{ nodeId: string | null; property: string | null } | null>(null);
    useEffect(() => {
        if (!highlight || !highlight.nodeId) return;
        setPulse({ nodeId: highlight.nodeId, property: highlight.property });
        const t = setTimeout(() => setPulse(null), 700);
        return () => clearTimeout(t);
    }, [highlight]);

    // Track new nodes for entry animation
    useEffect(() => {
        const currentIds = new Set(data.nodes.map(n => n.id));
        const newlyAdded = new Set([...currentIds].filter(id => !prevNodeIds.current.has(id)));
        if (newlyAdded.size > 0) {
            setNewNodeIds(newlyAdded);
            setTimeout(() => setNewNodeIds(new Set()), 1000);
        }
        prevNodeIds.current = currentIds;
    }, [data.nodes]);

    // Ctrl+Wheel zoom
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

    // Drag-pan: use window listeners so absolutely-positioned nodes don't block
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

    const layoutNodes = useMemo(() => computeLayout(data.nodes, data.rootId), [data.nodes, data.rootId]);
    const allIds = useMemo(() => new Set(data.nodes.map(n => n.id)), [data.nodes]);

    // Auto-center tree in container on first render or when nodes change
    useEffect(() => {
        if (layoutNodes.length === 0 || !mainRef.current) return;
        if (hasAutocentered.current) return;

        const container = mainRef.current;
        const containerW = container.clientWidth;
        const containerH = container.clientHeight;

        const minX = Math.min(...layoutNodes.map(ln => ln.x));
        const maxX = Math.max(...layoutNodes.map(ln => ln.x)) + NODE_W;
        const maxY = Math.max(...layoutNodes.map(ln => ln.y + nodeHeight(ln.node)));

        const treeW = maxX - minX;
        const treeH = maxY;

        const offsetX = (containerW - treeW * scale) / 2 - minX * scale;
        const offsetY = Math.max(50, (containerH - treeH * scale) / 2 - 20);

        setOffset({ x: offsetX, y: offsetY });
        hasAutocentered.current = true;
    }, [layoutNodes, scale]);

    // Edges computed from layout positions
    const edges = useMemo<TreeEdge[]>(() => {
        const posMap = new Map(layoutNodes.map(ln => [ln.node.id, ln]));
        const result: TreeEdge[] = [];

        layoutNodes.forEach(ln => {
            const childPtrEntries = Object.entries(ln.node.pointers).filter(
                ([, id]) => id && allIds.has(id!)
            );
            childPtrEntries.forEach(([, targetId], i) => {
                if (!targetId) return;
                const target = posMap.get(targetId);
                if (!target) return;

                const srcH = nodeHeight(ln.node);
                const n = childPtrEntries.length;
                const spread = Math.min(NODE_W * 0.6, 20 * n);
                const xShift = n > 1 ? ((i / (n - 1)) - 0.5) * spread : 0;

                result.push({
                    id: `${ln.node.id}-${i}-${targetId}`,
                    x1: ln.x + NODE_W / 2 + xShift,
                    y1: ln.y + srcH,
                    x2: target.x + NODE_W / 2,
                    y2: target.y,
                    isNew: newNodeIds.has(targetId),
                });
            });
        });
        return result;
    }, [layoutNodes, newNodeIds, allIds]);

    if (!data.nodes || data.nodes.length === 0) {
        return <div className="p-4 text-text-muted text-xs font-mono">/* Tree Empty */</div>;
    }

    return (
        <div
            ref={mainRef}
            className="flex flex-col items-center w-full min-h-[400px] h-full relative font-mono overflow-hidden select-none bg-black/5 rounded-lg cursor-grab"
            onMouseDown={handleMouseDown}
        >
            <h3 className="text-xs font-bold text-green-400 mb-4 uppercase tracking-widest absolute top-0 left-4 z-20 pointer-events-none p-4">
                Tree Visualization
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
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
                    <defs>
                        <marker id="tree-arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="rgba(74, 222, 128, 0.8)" />
                        </marker>
                    </defs>
                    {edges.map(e => {
                        const cy1 = e.y1 + 30;
                        const cy2 = e.y2 - 30;
                        const path = `M ${e.x1} ${e.y1} C ${e.x1} ${cy1}, ${e.x2} ${cy2}, ${e.x2} ${e.y2}`;
                        return (
                            <motion.path
                                key={e.id}
                                initial={e.isNew ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
                                animate={{ pathLength: 1, opacity: 0.7 }}
                                transition={{ duration: 0.6, ease: 'easeInOut', delay: e.isNew ? 0.2 : 0 }}
                                d={path}
                                fill="none"
                                stroke="rgba(74, 222, 128, 0.8)"
                                strokeWidth={2 / scale}
                                markerEnd="url(#tree-arrow)"
                                className="drop-shadow-[0_0_8px_rgba(74,222,128,0.3)]"
                            />
                        );
                    })}
                </svg>

                <AnimatePresence>
                    {layoutNodes.map(ln => {
                        const { node, x, y } = ln;
                        const isNew = newNodeIds.has(node.id);
                        const isRoot = node.id === data.rootId;

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
                                    transition: 'left 0.3s ease, top 0.3s ease',
                                }}
                                className="z-20"
                            >
                                {isRoot && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-[0_0_15px_rgba(74,222,128,0.6)] z-30 whitespace-nowrap"
                                    >
                                        ROOT
                                    </motion.div>
                                )}

                                {(isNew || isRoot) && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: [0, 0.4, 0], scale: [0.9, 1.2, 0.9] }}
                                        transition={{ duration: 1.5, repeat: Infinity }}
                                        className="absolute inset-[-20px] bg-green-500/15 blur-[25px] rounded-full z-[-1]"
                                    />
                                )}

                                <div
                                    className={`flex flex-col items-center transition-shadow duration-500 ${
                                        pulse?.nodeId === node.id
                                            ? 'ring-2 ring-accent-cyan rounded-lg shadow-[0_0_30px_rgba(0,229,255,0.5)]'
                                            : isNew || isRoot ? 'shadow-[0_0_40px_rgba(74,222,128,0.3)]' : ''
                                    }`}
                                >
                                    <div className="bg-bg-tertiary px-3 py-1 rounded-t-lg border border-border text-[10px] font-bold text-text-secondary w-full text-center tracking-wider z-10">
                                        {node.type}
                                    </div>
                                    <div className="bg-bg-panel border border-t-0 border-border rounded-b-lg shadow-xl shadow-bg-secondary/20 overflow-hidden w-full">
                                        {Object.entries(node.fields).map(([fname, val]) => {
                                            const fieldPulse = pulse?.nodeId === node.id && pulse?.property === fname;
                                            return (
                                            <div key={fname} className={`flex border-b border-border/40 text-xs text-center transition-colors duration-500 ${fieldPulse ? 'bg-accent-cyan/20' : ''}`}>
                                                <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted bg-black/10 text-[11px] font-mono tracking-tighter truncate">{fname}</div>
                                                <div className="w-[55%] p-1.5 text-accent-cyan font-bold truncate">{val !== undefined ? String(val) : '?'}</div>
                                            </div>
                                            );
                                        })}
                                        {Object.entries(node.pointers).map(([pname, targetId]) => {
                                            const ptrPulse = pulse?.nodeId === node.id && pulse?.property === pname;
                                            return (
                                            <div key={pname} className={`flex border-b border-border/40 text-xs transition-colors duration-500 ${ptrPulse ? 'bg-accent-cyan/25' : 'bg-green-500/5'}`}>
                                                <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted text-center bg-black/20 text-[11px] font-mono tracking-tighter truncate">{pname}</div>
                                                <div className="w-[55%] p-1.5 text-green-400 text-center tracking-tighter truncate opacity-80 font-bold bg-green-500/5">
                                                    {targetId ? `*${(targetId as string).slice(-4)}` : 'null'}
                                                </div>
                                            </div>
                                            );
                                        })}
                                        {Object.keys(node.fields).length === 0 && Object.keys(node.pointers).length === 0 && (
                                            <div className="p-4 text-center text-[10px] text-text-muted italic opacity-50 font-mono">Uninitialized</div>
                                        )}
                                    </div>
                                </div>

                                {node.labels.length > 0 && (
                                    <div className="mt-1 flex gap-1 flex-wrap justify-center">
                                        {node.labels.map(lbl => (
                                            <span key={lbl} className="px-1.5 py-0.5 rounded bg-green-500/20 text-[9px] text-green-300 font-mono font-bold">
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
