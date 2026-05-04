import { useMemo, useState, useEffect } from 'react';
import type { HeapState } from '../../types';
import type { NodeHighlight } from '../Visualizer';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    data: HeapState;
    highlight?: NodeHighlight | null;
}

interface NodeLayout {
    id: string;
    value: number | string | boolean;
    cx: number;
    cy: number;
    arrayIndex: number;
}

/**
 * Lay out nodes as a binary tree by 1-based heap index:
 *   parent(i) = floor(i/2)
 *   children(i) = 2i, 2i+1
 *
 * Depth d holds 2^d nodes (max). Y is depth-driven, X spreads evenly within depth.
 */
function heapLayout(items: HeapState['items'], width: number): NodeLayout[] {
    const N = items.length;
    if (N === 0) return [];
    const maxDepth = Math.floor(Math.log2(N)) + 1;
    const levelHeight = 64;

    return items.map((item, i) => {
        const depth = Math.floor(Math.log2(i + 1));     // 0-based depth
        const offsetInLevel = (i + 1) - Math.pow(2, depth);
        const slotsAtDepth = Math.pow(2, depth);
        const x = ((offsetInLevel + 0.5) / slotsAtDepth) * width;
        const y = 30 + depth * levelHeight;
        return { id: item.id, value: item.value, cx: x, cy: y, arrayIndex: i };
    });

    // unreachable but keeps maxDepth referenced for ESLint
    void maxDepth;
}

export default function HeapView({ data, highlight }: Props) {
    const W = 520;

    const [pulse, setPulse] = useState<{ index: number | null } | null>(null);
    useEffect(() => {
        if (!highlight) return;
        // For heap PUSH/POP we just pulse the latest item (root for pop, tail for push).
        if (highlight.kind === 'PUSH') {
            setPulse({ index: data.items.length - 1 });
            const t = setTimeout(() => setPulse(null), 700);
            return () => clearTimeout(t);
        }
        if (highlight.kind === 'POP') {
            setPulse({ index: 0 });
            const t = setTimeout(() => setPulse(null), 400);
            return () => clearTimeout(t);
        }
    }, [highlight, data.items.length]);

    const layout = useMemo(() => heapLayout(data.items, W), [data.items]);
    const H = layout.length === 0 ? 80 : Math.max(...layout.map(l => l.cy)) + 40;

    return (
        <div className="flex flex-col items-center w-full h-full justify-center gap-3 px-4 overflow-auto">
            <h3 className="text-xs font-bold text-orange-400 tracking-widest uppercase">
                Heap / PriorityQueue: <span className="font-mono">{data.name}</span>
            </h3>

            {/* Tree view (heap by index) */}
            <div className="relative" style={{ width: W, height: H }}>
                <svg
                    width={W} height={H}
                    className="absolute inset-0 pointer-events-none"
                    style={{ overflow: 'visible' }}
                >
                    {layout.map(n => {
                        const parentIdx = Math.floor((n.arrayIndex - 1) / 2);
                        if (n.arrayIndex === 0 || parentIdx < 0) return null;
                        const parent = layout[parentIdx];
                        if (!parent) return null;
                        return (
                            <line
                                key={`edge-${n.arrayIndex}`}
                                x1={parent.cx} y1={parent.cy + 16}
                                x2={n.cx} y2={n.cy - 16}
                                stroke="rgba(251, 146, 60, 0.5)" strokeWidth={1.5}
                            />
                        );
                    })}
                </svg>

                <AnimatePresence>
                    {layout.map(n => {
                        const isRoot = n.arrayIndex === 0;
                        const isPulsed = pulse?.index === n.arrayIndex;
                        return (
                            <motion.div
                                key={n.id}
                                layout
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ layout: { type: 'spring', stiffness: 280, damping: 30 } }}
                                style={{ position: 'absolute', left: n.cx, top: n.cy, transform: 'translate(-50%, -50%)' }}
                                className={`flex flex-col items-center transition-shadow duration-500 ${
                                    isPulsed
                                        ? 'shadow-[0_0_25px_rgba(0,229,255,0.6)] ring-2 ring-accent-cyan rounded-full'
                                        : isRoot ? 'shadow-[0_0_20px_rgba(251,146,60,0.4)]' : ''
                                }`}
                            >
                                <div
                                    className={`w-12 h-12 rounded-full border flex items-center justify-center font-mono text-sm font-bold ${
                                        isRoot
                                            ? 'bg-orange-500/30 border-orange-400/60 text-white'
                                            : 'bg-orange-500/10 border-orange-500/30 text-orange-200'
                                    }`}
                                >
                                    {String(n.value)}
                                </div>
                                <div className="text-[9px] font-mono text-text-muted/70 mt-0.5">[{n.arrayIndex}]</div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Array view */}
            <div className="flex items-center gap-1 mt-2">
                <span className="text-[10px] text-text-muted font-mono mr-2">array:</span>
                <AnimatePresence mode="popLayout">
                    {data.items.map((item, idx) => {
                        const isPulsed = pulse?.index === idx;
                        return (
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ layout: { type: 'spring', stiffness: 280, damping: 28 } }}
                                className={`relative w-9 h-9 flex items-center justify-center text-xs font-mono font-bold border rounded transition-colors duration-300 ${
                                    isPulsed
                                        ? 'bg-accent-cyan/25 border-accent-cyan text-white'
                                        : idx === 0
                                            ? 'bg-orange-500/25 border-orange-400/60 text-white'
                                            : 'bg-orange-500/10 border-orange-500/30 text-orange-200'
                                }`}
                            >
                                {String(item.value)}
                                <span className="absolute -bottom-3.5 text-[8px] text-text-muted/60 font-mono">{idx}</span>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                {data.items.length === 0 && (
                    <span className="text-text-muted/50 italic text-xs font-mono">empty</span>
                )}
            </div>

            <div className="text-[10px] font-mono text-text-muted/60 mt-3">
                size: <span className="text-orange-400 font-bold">{data.items.length}</span>
                {data.items.length > 0 && (
                    <span className="ml-3">top: <span className="text-orange-300">{String(data.items[0].value)}</span></span>
                )}
            </div>
        </div>
    );
}
