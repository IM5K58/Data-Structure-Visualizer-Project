import { useMemo } from 'react';
import type { UnionFindState } from '../../types';
import type { NodeHighlight } from '../Visualizer';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    data: UnionFindState;
    highlight?: NodeHighlight | null;
}

interface UFNode {
    id: string;
    children: string[];
    depth: number;
}

/**
 * Build a forest from the parent map. Roots are nodes whose parent === self.
 * Layout: each tree placed left-to-right, nodes in BFS order with depth × y.
 */
function buildForest(parent: Record<string, string>): { roots: string[]; tree: Map<string, UFNode> } {
    const tree = new Map<string, UFNode>();
    for (const k of Object.keys(parent)) {
        tree.set(k, { id: k, children: [], depth: 0 });
    }
    const roots: string[] = [];
    for (const [k, p] of Object.entries(parent)) {
        if (k === p) {
            roots.push(k);
        } else if (tree.has(p)) {
            tree.get(p)!.children.push(k);
        }
    }
    // Compute depths via BFS from each root.
    for (const r of roots) {
        const q: { id: string; d: number }[] = [{ id: r, d: 0 }];
        while (q.length) {
            const { id, d } = q.shift()!;
            const node = tree.get(id);
            if (!node) continue;
            node.depth = d;
            for (const c of node.children) q.push({ id: c, d: d + 1 });
        }
    }
    return { roots, tree };
}

export default function UnionFindView({ data, highlight: _highlight }: Props) {
    const { roots, tree } = useMemo(() => buildForest(data.parent), [data.parent]);
    const elementCount = Object.keys(data.parent).length;

    return (
        <div className="flex flex-col items-center w-full h-full justify-center gap-3 px-4 overflow-auto">
            <h3 className="text-xs font-bold text-emerald-400 tracking-widest uppercase">
                Union-Find: <span className="font-mono">{data.name}</span>
            </h3>

            {/* Forest */}
            <div className="flex items-start gap-8 flex-wrap justify-center min-h-[120px] py-2">
                <AnimatePresence>
                    {roots.length === 0 ? (
                        <span className="text-text-muted/50 italic text-xs font-mono">no operations yet</span>
                    ) : (
                        roots.map(r => <UFTree key={r} rootId={r} tree={tree} />)
                    )}
                </AnimatePresence>
            </div>

            {/* Op log */}
            {data.ops.length > 0 && (
                <div className="w-full max-w-md mt-2">
                    <div className="text-[10px] font-mono text-text-muted mb-1 uppercase tracking-widest">recent ops</div>
                    <div className="bg-black/20 rounded border border-emerald-500/20 p-2 max-h-24 overflow-y-auto">
                        <AnimatePresence initial={false}>
                            {data.ops.slice(0, 8).map(op => (
                                <motion.div
                                    key={op.id}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="text-[11px] font-mono text-emerald-200"
                                >
                                    {op.op === 'union'
                                        ? <>union(<span className="text-emerald-300">{op.a}</span>, <span className="text-emerald-300">{op.b}</span>)</>
                                        : op.op === 'find'
                                            ? <>find(<span className="text-emerald-300">{op.a}</span>)</>
                                            : <>makeSet(<span className="text-emerald-300">{op.a}</span>)</>}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            )}

            <div className="text-[10px] font-mono text-text-muted/60">
                elements: <span className="text-emerald-400 font-bold">{elementCount}</span>
                <span className="mx-2">·</span>
                sets: <span className="text-emerald-300 font-bold">{roots.length}</span>
            </div>
        </div>
    );
}

function UFTree({ rootId, tree }: { rootId: string; tree: Map<string, UFNode> }) {
    const node = tree.get(rootId);
    if (!node) return null;
    return (
        <div className="flex flex-col items-center">
            <motion.div
                layout
                className="px-3 py-1.5 rounded-full bg-emerald-500/30 border border-emerald-400/60 text-emerald-50 font-mono text-xs font-bold shadow-[0_0_12px_rgba(16,185,129,0.3)]"
            >
                {rootId}
            </motion.div>
            {node.children.length > 0 && (
                <>
                    <div className="w-[2px] h-3 bg-emerald-500/40" />
                    <div className="flex items-start gap-3">
                        {node.children.map(c => <UFSubtree key={c} id={c} tree={tree} />)}
                    </div>
                </>
            )}
        </div>
    );
}

function UFSubtree({ id, tree }: { id: string; tree: Map<string, UFNode> }) {
    const node = tree.get(id);
    if (!node) return null;
    return (
        <div className="flex flex-col items-center">
            <motion.div
                layout
                className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 font-mono text-[11px]"
            >
                {id}
            </motion.div>
            {node.children.length > 0 && (
                <>
                    <div className="w-[2px] h-2.5 bg-emerald-500/30" />
                    <div className="flex items-start gap-2">
                        {node.children.map(c => <UFSubtree key={c} id={c} tree={tree} />)}
                    </div>
                </>
            )}
        </div>
    );
}
