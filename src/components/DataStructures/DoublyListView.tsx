import { useState, useEffect, useMemo } from 'react';
import type { DoublyState, MemoryNode } from '../../types';
import type { NodeHighlight } from '../Visualizer';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    data: DoublyState;
    highlight?: NodeHighlight | null;
}

/**
 * Re-derive which pointer fields are "forward" (next-like) vs "back" (prev-like)
 * by stripping bidirectional pairs — same heuristic as the classifier.
 *
 * For a typical doubly linked list with fields `next` and `prev`:
 *   - every prev edge has a matching next edge (back-edge candidate)
 *   - the next field's edges form an acyclic chain → forward
 */
function classifyFields(nodes: MemoryNode[]): { forward: Set<string>; back: Set<string> } {
    // Build per-field edge sets and the full out-edge set.
    const fieldEdges = new Map<string, Map<string, string>>();
    const fullOut = new Map<string, Set<string>>();

    for (const n of nodes) {
        fullOut.set(n.id, new Set());
        for (const [field, target] of Object.entries(n.pointers)) {
            if (!target) continue;
            if (!fieldEdges.has(field)) fieldEdges.set(field, new Map());
            fieldEdges.get(field)!.set(n.id, target);
            fullOut.get(n.id)!.add(target);
        }
    }

    const back = new Set<string>();
    const forward = new Set<string>();

    // A field is "back" if every edge it contributes has a reverse counterpart
    // in the full graph. Otherwise it's "forward".
    for (const [field, edges] of fieldEdges) {
        let total = 0;
        let bidir = 0;
        for (const [src, tgt] of edges) {
            total++;
            if (fullOut.get(tgt)?.has(src)) bidir++;
        }
        if (total > 0 && total === bidir) back.add(field);
        else forward.add(field);
    }

    // If we couldn't identify any back-edge field (e.g. classification flagged
    // the structure as 'doubly' based on something we can't reproduce here),
    // fall back to name-based heuristics so we still render something useful.
    if (back.size === 0 && forward.size >= 2) {
        for (const field of forward) {
            if (/^(prev|previous|back|parent)$/i.test(field)) {
                back.add(field);
                forward.delete(field);
                break;
            }
        }
    }

    return { forward, back };
}

/**
 * Lay out nodes left-to-right by following the forward field(s) starting from
 * the in-degree-0 node in the forward subgraph.
 */
function orderChain(nodes: MemoryNode[], forward: Set<string>): MemoryNode[] {
    if (nodes.length === 0) return [];
    const byId = new Map(nodes.map(n => [n.id, n]));
    const indeg = new Map<string, number>();
    for (const n of nodes) indeg.set(n.id, 0);
    for (const n of nodes) {
        for (const [field, tgt] of Object.entries(n.pointers)) {
            if (!tgt || !forward.has(field) || !indeg.has(tgt)) continue;
            indeg.set(tgt, (indeg.get(tgt) ?? 0) + 1);
        }
    }

    // Pick a head: prefer in-degree 0 in forward graph; otherwise first node.
    const head = nodes.find(n => indeg.get(n.id) === 0) ?? nodes[0];

    const ordered: MemoryNode[] = [];
    const visited = new Set<string>();
    let cur: MemoryNode | undefined = head;
    while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        ordered.push(cur);
        let nextId: string | undefined;
        for (const [field, tgt] of Object.entries(cur.pointers)) {
            if (forward.has(field) && tgt && !visited.has(tgt)) {
                nextId = tgt;
                break;
            }
        }
        cur = nextId ? byId.get(nextId) : undefined;
    }
    // Append disconnected nodes (defensive — doubly-linked-list shouldn't have any)
    for (const n of nodes) if (!visited.has(n.id)) ordered.push(n);
    return ordered;
}

export default function DoublyListView({ data, highlight }: Props) {
    const { forward, back } = useMemo(() => classifyFields(data.nodes), [data.nodes]);
    const ordered = useMemo(() => orderChain(data.nodes, forward), [data.nodes, forward]);

    const [pulse, setPulse] = useState<{ nodeId: string | null; property: string | null } | null>(null);
    useEffect(() => {
        if (!highlight || !highlight.nodeId) return;
        setPulse({ nodeId: highlight.nodeId, property: highlight.property });
        const t = setTimeout(() => setPulse(null), 700);
        return () => clearTimeout(t);
    }, [highlight]);

    return (
        <div className="flex flex-col items-center w-full h-full justify-center gap-4 px-4 overflow-auto">
            <h3 className="text-xs font-bold text-accent-cyan tracking-widest uppercase">
                Doubly Linked List: <span className="font-mono">{data.name}</span>
            </h3>

            <div className="flex items-center gap-3 flex-wrap justify-center py-6">
                <AnimatePresence mode="popLayout">
                    {ordered.map((node, idx) => {
                        const isPulsed = pulse?.nodeId === node.id;
                        const isHead = idx === 0;
                        return (
                            <motion.div
                                key={node.id}
                                layout
                                initial={{ opacity: 0, scale: 0.5, y: 30 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.5, y: -30 }}
                                transition={{
                                    layout: { type: 'spring', stiffness: 250, damping: 30 },
                                    opacity: { duration: 0.3 },
                                }}
                                className="flex items-center"
                            >
                                {idx > 0 && (
                                    // Inter-node arrows: ← prev (dashed amber) and → next (solid cyan)
                                    <div className="flex flex-col items-center mx-1 gap-1">
                                        <div className="flex items-center text-accent-cyan text-xs font-mono">
                                            <span className="w-6 border-t-2 border-accent-cyan" />
                                            <span className="-ml-1">▶</span>
                                            <span className="ml-1 text-[9px] opacity-60 tracking-widest">next</span>
                                        </div>
                                        <div className="flex items-center text-amber-400 text-xs font-mono">
                                            <span className="-mr-1">◀</span>
                                            <span className="w-6 border-t-2 border-dashed border-amber-400" />
                                            <span className="ml-1 text-[9px] opacity-60 tracking-widest">prev</span>
                                        </div>
                                    </div>
                                )}

                                <div
                                    className={`flex flex-col items-center transition-shadow duration-500 relative ${
                                        isPulsed
                                            ? 'ring-2 ring-accent-cyan rounded-lg shadow-[0_0_30px_rgba(0,229,255,0.5)]'
                                            : isHead ? 'shadow-[0_0_30px_rgba(0,229,255,0.25)]' : ''
                                    }`}
                                >
                                    {isHead && (
                                        <div className="absolute -top-7 px-2 py-0.5 rounded bg-accent-cyan/80 text-[9px] font-bold text-black tracking-widest">
                                            HEAD
                                        </div>
                                    )}
                                    <div className="bg-bg-tertiary px-3 py-1 rounded-t-lg border border-border text-[10px] font-bold text-text-secondary w-32 text-center tracking-wider z-10">
                                        {node.type}
                                    </div>
                                    <div className="bg-bg-panel border border-t-0 border-border rounded-b-lg shadow-xl shadow-bg-secondary/20 overflow-hidden w-32">
                                        {Object.entries(node.fields).map(([fname, val]) => {
                                            const fpulse = isPulsed && pulse?.property === fname;
                                            return (
                                                <div key={fname} className={`flex border-b border-border/40 text-xs text-center transition-colors duration-500 ${fpulse ? 'bg-accent-cyan/20' : ''}`}>
                                                    <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted bg-black/10 text-[11px] font-mono tracking-tighter truncate">{fname}</div>
                                                    <div className="w-[55%] p-1.5 text-accent-cyan font-bold truncate">{val !== undefined ? String(val) : '?'}</div>
                                                </div>
                                            );
                                        })}
                                        {Object.entries(node.pointers).map(([pname, targetId]) => {
                                            const ppulse = isPulsed && pulse?.property === pname;
                                            const isBack = back.has(pname);
                                            const color = isBack ? 'text-amber-400' : 'text-accent-cyan';
                                            const bg = ppulse
                                                ? 'bg-accent-cyan/25'
                                                : (isBack ? 'bg-amber-500/5' : 'bg-accent-cyan/5');
                                            return (
                                                <div key={pname} className={`flex border-b border-border/40 text-xs transition-colors duration-500 ${bg}`}>
                                                    <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted text-center bg-black/20 text-[11px] font-mono tracking-tighter truncate">
                                                        {pname}
                                                        {isBack && <span className="ml-1 text-amber-400 opacity-60">↩</span>}
                                                    </div>
                                                    <div className={`w-[55%] p-1.5 ${color} text-center tracking-tighter truncate font-bold`}>
                                                        {targetId ? `*${(targetId as string).slice(-4)}` : 'null'}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {node.labels.length > 0 && (
                                        <div className="mt-1 flex gap-1 flex-wrap justify-center">
                                            {node.labels.map(lbl => (
                                                <span key={lbl} className="px-1.5 py-0.5 rounded bg-accent-cyan/20 text-[9px] text-accent-cyan font-mono font-bold">
                                                    {lbl}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            <div className="text-[10px] font-mono text-text-muted/60">
                size: <span className="text-accent-cyan/80 font-bold">{data.nodes.length}</span>
                {forward.size > 0 && back.size > 0 && (
                    <span className="ml-3 opacity-70">
                        forward=<span className="text-accent-cyan">{[...forward].join(',')}</span>
                        <span className="mx-1">·</span>
                        back=<span className="text-amber-400">{[...back].join(',')}</span>
                    </span>
                )}
            </div>
        </div>
    );
}
