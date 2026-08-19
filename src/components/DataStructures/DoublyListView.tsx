import { memo, useMemo } from 'react';
import type { DoublyState, NodeHighlight } from '../../types';
import { accentFor } from './accents';
import { motion, AnimatePresence } from 'framer-motion';
import { usePulse } from '../../hooks/usePulse';
import { classifyFields, orderChain } from './layout';
import { NodeCard, NodeLabels } from './NodeCard';

interface Props {
    data: DoublyState;
    highlight?: NodeHighlight | null;
}

function DoublyListView({ data, highlight }: Props) {
    const accent = accentFor('doubly');
    const { forward, back } = useMemo(() => classifyFields(data.nodes), [data.nodes]);
    const ordered = useMemo(() => orderChain(data.nodes, forward), [data.nodes, forward]);

    const pulse = usePulse(
        highlight?.nodeId ? { nodeId: highlight.nodeId, property: highlight.property } : null,
        highlight
    );

    return (
        <div className="flex flex-col items-center w-full h-full justify-center gap-4 px-4 overflow-auto">
            <h3 className={`text-xs font-bold ${accent.heading} tracking-widest uppercase`}>
                Doubly Linked List: <span className="font-mono">{data.name}</span>
            </h3>

            <div className="flex items-center gap-3 flex-wrap justify-center py-6">
                <AnimatePresence mode="popLayout">
                    {ordered.map((node, idx) => {
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

                                <NodeCard
                                    node={node}
                                    pulse={pulse}
                                    width={128}
                                    boxClassName="relative"
                                    restClassName={isHead ? 'shadow-[0_0_30px_rgba(0,229,255,0.25)]' : ''}
                                    tone={{
                                        fieldValue: 'text-accent-cyan',
                                        pointerRow: 'bg-accent-cyan/5',
                                        pointerValue: 'text-accent-cyan',
                                    }}
                                    pointerStyle={(pname) => back.has(pname) ? {
                                        rowClass: 'bg-amber-500/5',
                                        valueClass: 'text-amber-400',
                                        nameSuffix: <span className="ml-1 text-amber-400 opacity-60">↩</span>,
                                    } : null}
                                >
                                    {isHead && (
                                        <div className="absolute -top-7 px-2 py-0.5 rounded bg-accent-cyan/80 text-[9px] font-bold text-black tracking-widest">
                                            HEAD
                                        </div>
                                    )}
                                    <NodeLabels
                                        labels={node.labels}
                                        chipClassName="px-1.5 py-0.5 rounded bg-accent-cyan/20 text-[9px] text-accent-cyan font-mono font-bold"
                                    />
                                </NodeCard>
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

export default memo(DoublyListView);
