import { memo, useMemo } from 'react';
import type { HeapState } from '../../types';
import type { NodeHighlight } from '../Visualizer';
import { motion, AnimatePresence } from 'framer-motion';
import { useNewIds, usePulse } from '../../hooks/usePulse';

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

// ─── Layout constants ──────────────────────────────────────────────────────
const NODE_RADIUS = 24;          // circle radius in px (w-12 h-12 = 48 → r=24)
const NODE_SIZE = NODE_RADIUS * 2;
const LEVEL_HEIGHT = 80;          // vertical spacing between heap depths
const TOP_PAD = 36;               // top padding above the root
// Deepest-level nodes render an index label below the circle, so the bottom pad
// must clear the radius plus that label.
const BOT_PAD = 44;
const MIN_W = 480;                // tree-area minimum width
const SLOT_MIN = 56;              // minimum horizontal spacing per slot at deepest level

/**
 * Lay out heap nodes by their array index. For a complete binary tree with
 * N nodes, depth d holds 2^d slots; child of slot i at depth d sits at
 * slots 2i and 2i+1 of depth d+1, so each child is centered under its
 * parent's vertical line. Width scales with the number of slots at the
 * deepest level so circles don't overlap on tall heaps.
 */
function heapLayout(items: HeapState['items']): { nodes: NodeLayout[]; W: number; H: number } {
    const N = items.length;
    if (N === 0) return { nodes: [], W: MIN_W, H: TOP_PAD + BOT_PAD };

    const maxDepth = Math.floor(Math.log2(N));         // 0-based deepest depth in use
    const slotsAtMax = Math.pow(2, maxDepth);          // slots at the deepest level
    const W = Math.max(MIN_W, slotsAtMax * SLOT_MIN);
    const H = TOP_PAD + maxDepth * LEVEL_HEIGHT + BOT_PAD;

    const nodes = items.map((item, i) => {
        const depth = Math.floor(Math.log2(i + 1));     // 0-based depth
        const offsetInLevel = (i + 1) - Math.pow(2, depth);
        const slotsAtDepth = Math.pow(2, depth);
        const cx = ((offsetInLevel + 0.5) / slotsAtDepth) * W;
        const cy = TOP_PAD + depth * LEVEL_HEIGHT;
        return { id: item.id, value: item.value, cx, cy, arrayIndex: i };
    });

    return { nodes, W, H };
}

function HeapView({ data, highlight }: Props) {
    const { nodes, W, H } = useMemo(() => heapLayout(data.items), [data.items]);

    // Highlight by item id, not array index: a sift-up/sift-down moves items
    // between indices, so an index latched 700ms ago points at a different value
    // by the time the pulse clears.
    const itemIds = useMemo(() => data.items.map(i => i.id), [data.items]);
    const insertedIds = useNewIds(itemIds, 700);
    // A pop removes the old root, so there is no surviving item to flash —
    // briefly mark the *new* root instead.
    const pulseRoot = usePulse(highlight?.kind === 'POP' ? true : null, highlight, 400);

    return (
        <div className="flex flex-col items-center w-full h-full justify-center gap-3 px-4 overflow-auto">
            <h3 className="text-xs font-bold text-orange-400 tracking-widest uppercase">
                Heap / PriorityQueue: <span className="font-mono">{data.name}</span>
            </h3>

            {/* Tree view. The scroll container centres with `mx-auto` rather than
                flex centering, which would make the left edge unreachable once a
                deep heap grows wider than the panel. */}
            <div className="w-full max-w-full overflow-x-auto shrink-0">
            <div className="relative mx-auto" style={{ width: W, height: H }}>
                <svg
                    width={W} height={H}
                    className="absolute inset-0 pointer-events-none"
                    style={{ overflow: 'visible' }}
                >
                    {nodes.map(n => {
                        if (n.arrayIndex === 0) return null;
                        const parentIdx = Math.floor((n.arrayIndex - 1) / 2);
                        const parent = nodes[parentIdx];
                        if (!parent) return null;
                        // Connect circle edge to circle edge (with a tiny gap for breathing room).
                        // Parent center → child center, but offset endpoints along the line by
                        // NODE_RADIUS so the line ends exactly at each circle's perimeter.
                        const dx = n.cx - parent.cx;
                        const dy = n.cy - parent.cy;
                        const len = Math.hypot(dx, dy) || 1;
                        const ux = dx / len, uy = dy / len;
                        const x1 = parent.cx + ux * NODE_RADIUS;
                        const y1 = parent.cy + uy * NODE_RADIUS;
                        const x2 = n.cx - ux * NODE_RADIUS;
                        const y2 = n.cy - uy * NODE_RADIUS;
                        return (
                            <line
                                key={`edge-${n.arrayIndex}`}
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke="rgba(251, 146, 60, 0.55)" strokeWidth={1.5}
                            />
                        );
                    })}
                </svg>

                <AnimatePresence>
                    {nodes.map(n => {
                        const isRoot = n.arrayIndex === 0;
                        const isPulsed = insertedIds.has(n.id) || (pulseRoot === true && isRoot);
                        return (
                            <motion.div
                                key={n.id}
                                layout
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ layout: { type: 'spring', stiffness: 280, damping: 30 } }}
                                // Offset by the radius instead of `transform: translate(-50%,-50%)`:
                                // framer-motion writes its own `transform` for `scale` and for the
                                // `layout` projection, which would overwrite a hardcoded one and
                                // leave the node anchored at its top-left, off the SVG edges.
                                style={{
                                    position: 'absolute',
                                    left: n.cx - NODE_RADIUS,
                                    top: n.cy - NODE_RADIUS,
                                    width: NODE_SIZE,
                                    height: NODE_SIZE,
                                }}
                                className="flex items-center justify-center"
                            >
                                {/* Index label, absolutely positioned BELOW the circle so it
                                    doesn't shift the motion.div's center off the heap-y line. */}
                                <span className="absolute top-full mt-1 text-[9px] font-mono text-text-muted/70 whitespace-nowrap">
                                    [{n.arrayIndex}]
                                </span>

                                <div
                                    className={`w-full h-full rounded-full border flex items-center justify-center font-mono text-sm font-bold transition-shadow duration-500 ${
                                        isPulsed
                                            ? 'bg-accent-cyan/30 border-accent-cyan text-white ring-2 ring-accent-cyan shadow-[0_0_24px_rgba(0,229,255,0.6)]'
                                            : isRoot
                                                ? 'bg-orange-500/30 border-orange-400/60 text-white shadow-[0_0_20px_rgba(251,146,60,0.4)]'
                                                : 'bg-orange-500/10 border-orange-500/30 text-orange-200'
                                    }`}
                                >
                                    {String(n.value)}
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
            </div>

            {/* Array view */}
            <div className="flex items-end gap-1 mt-4 flex-wrap justify-center">
                <span className="text-[10px] text-text-muted font-mono mr-2 self-center">array:</span>
                <AnimatePresence mode="popLayout">
                    {data.items.map((item, idx) => {
                        const isPulsed = insertedIds.has(item.id) || (pulseRoot === true && idx === 0);
                        return (
                            // The keyed child of AnimatePresence must itself be a motion
                            // component — a plain wrapper div would make `exit` and
                            // `popLayout` no-ops.
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{ layout: { type: 'spring', stiffness: 280, damping: 28 } }}
                                className="flex flex-col items-center"
                            >
                                <div
                                    className={`w-9 h-9 flex items-center justify-center text-xs font-mono font-bold border rounded transition-colors duration-300 ${
                                        isPulsed
                                            ? 'bg-accent-cyan/25 border-accent-cyan text-white ring-1 ring-accent-cyan'
                                            : idx === 0
                                                ? 'bg-orange-500/25 border-orange-400/60 text-white'
                                                : 'bg-orange-500/10 border-orange-500/30 text-orange-200'
                                    }`}
                                >
                                    {String(item.value)}
                                </div>
                                <span className="text-[8px] text-text-muted/60 font-mono mt-0.5">{idx}</span>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
                {data.items.length === 0 && (
                    <span className="text-text-muted/50 italic text-xs font-mono self-center">empty</span>
                )}
            </div>

            <div className="text-[10px] font-mono text-text-muted/60 mt-2">
                size: <span className="text-orange-400 font-bold">{data.items.length}</span>
                {data.items.length > 0 && (
                    <span className="ml-3">top: <span className="text-orange-300">{String(data.items[0].value)}</span></span>
                )}
            </div>
        </div>
    );
}

export default memo(HeapView);
