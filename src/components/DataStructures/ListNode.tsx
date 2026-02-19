import { motion, AnimatePresence } from 'framer-motion';
import type { LinkedListState } from '../../types';

interface Props {
    data: LinkedListState;
}

export default function ListNode({ data }: Props) {
    return (
        <div className="flex flex-col items-center gap-2">
            <h3 className="text-sm font-semibold text-accent-orange tracking-wider uppercase mb-2">
                Linked List: <span className="font-mono">{data.name}</span>
            </h3>

            <div className="flex items-center gap-0 min-h-[50px]">
                {/* HEAD label */}
                {data.nodes.length > 0 && (
                    <span className="text-[10px] text-accent-orange font-mono opacity-70 mr-2">
                        HEAD →
                    </span>
                )}

                <AnimatePresence mode="popLayout">
                    {data.nodes.map((node, index) => (
                        <motion.div
                            key={node.id}
                            layout
                            initial={{ opacity: 0, scale: 0.5 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            className="flex items-center"
                        >
                            {/* Node box */}
                            <div className="flex border border-accent-orange/40 rounded-lg overflow-hidden">
                                <div className="w-[48px] h-[40px] flex items-center justify-center bg-accent-orange/15 text-white font-mono font-semibold text-sm">
                                    {node.value}
                                </div>
                                <div className="w-[24px] h-[40px] flex items-center justify-center border-l border-accent-orange/30 bg-accent-orange/5">
                                    <div className="w-2 h-2 rounded-full bg-accent-orange/60" />
                                </div>
                            </div>

                            {/* Arrow to next node */}
                            {index < data.nodes.length - 1 && (
                                <svg width="28" height="20" viewBox="0 0 28 20" className="flex-shrink-0">
                                    <line
                                        x1="2"
                                        y1="10"
                                        x2="20"
                                        y2="10"
                                        stroke="rgba(245,158,11,0.5)"
                                        strokeWidth="2"
                                    />
                                    <polygon
                                        points="20,5 28,10 20,15"
                                        fill="rgba(245,158,11,0.5)"
                                    />
                                </svg>
                            )}

                            {/* NULL at end */}
                            {index === data.nodes.length - 1 && (
                                <div className="ml-1 flex items-center gap-1">
                                    <svg width="16" height="20" viewBox="0 0 16 20" className="flex-shrink-0">
                                        <line
                                            x1="0"
                                            y1="10"
                                            x2="10"
                                            y2="10"
                                            stroke="rgba(245,158,11,0.3)"
                                            strokeWidth="2"
                                        />
                                    </svg>
                                    <span className="text-[10px] text-accent-orange/50 font-mono">NULL</span>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {data.nodes.length === 0 && (
                    <div className="px-4 py-2 rounded-lg border border-dashed border-white/10 text-text-muted text-xs">
                        empty list
                    </div>
                )}
            </div>

            <span className="text-[10px] text-text-muted font-mono mt-1">
                nodes: {data.nodes.length}
            </span>
        </div>
    );
}
