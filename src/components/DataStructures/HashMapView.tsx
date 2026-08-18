import { memo, useMemo } from 'react';
import type { HashMapState } from '../../types';
import type { NodeHighlight } from '../Visualizer';
import { motion, AnimatePresence } from 'framer-motion';
import { usePulse } from '../../hooks/usePulse';

interface Props {
    data: HashMapState;
    highlight?: NodeHighlight | null;
}

/**
 * Best-effort bucket grouping. Without access to the actual hash function we
 * use a simple djb2 hash on the stringified key just to make collisions
 * visually consistent across renders. This is a *display* aid, not a claim
 * about how the underlying container hashes.
 */
function bucketOf(key: string, numBuckets: number): number {
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
    return Math.abs(h) % Math.max(1, numBuckets);
}

/**
 * Bucket count grows in powers of two at a 0.75 load factor. A capacity that
 * changed on every insert (e.g. `ceil(N * 1.3)`) would move every existing entry
 * to a different bucket each time, re-animating the whole map on a single set.
 */
function bucketCountFor(entryCount: number): number {
    let capacity = 4;
    while (entryCount > capacity * 0.75) capacity *= 2;
    return capacity;
}

function HashMapView({ data, highlight }: Props) {
    // The reducer stored the key in command.property; Visualizer's NodeHighlight
    // forwards it as `property`.
    const pulseTarget = highlight
        && (highlight.kind === 'MAP_SET' || highlight.kind === 'MAP_REMOVE')
        ? highlight.property
        : null;
    const pulseKey = usePulse(pulseTarget, highlight);

    const { buckets, numBuckets } = useMemo(() => {
        const count = bucketCountFor(data.entries.length);
        const grouped: { idx: number; entries: HashMapState['entries'] }[] = [];
        for (let i = 0; i < count; i++) grouped.push({ idx: i, entries: [] });
        for (const e of data.entries) {
            grouped[bucketOf(e.key, count)].entries.push(e);
        }
        return { buckets: grouped, numBuckets: count };
    }, [data.entries]);

    return (
        <div className="flex flex-col items-center w-full h-full justify-center gap-3 px-4 overflow-auto">
            <h3 className="text-xs font-bold text-pink-400 tracking-widest uppercase">
                HashMap: <span className="font-mono">{data.name}</span>
            </h3>

            <div className="grid grid-cols-1 gap-1.5 w-full max-w-md">
                {buckets.map(b => (
                    <div key={b.idx} className="flex items-center gap-2">
                        <div className="w-8 text-[10px] font-mono text-text-muted text-right">[{b.idx}]</div>
                        <div className="flex-1 min-h-[28px] bg-black/20 rounded border border-pink-500/15 p-1 flex items-center gap-1 flex-wrap">
                            <AnimatePresence mode="popLayout">
                                {b.entries.length === 0 ? (
                                    <span className="text-[10px] text-text-muted/40 italic font-mono ml-2">empty</span>
                                ) : (
                                    b.entries.map(e => {
                                        const isPulsed = pulseKey === e.key;
                                        return (
                                            <motion.div
                                                key={e.id}
                                                layout
                                                initial={{ opacity: 0, scale: 0.5 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.5 }}
                                                transition={{ layout: { type: 'spring', stiffness: 300, damping: 28 } }}
                                                className={`flex items-center text-[11px] font-mono px-2 py-0.5 rounded border transition-colors duration-300 ${
                                                    isPulsed
                                                        ? 'bg-accent-cyan/25 border-accent-cyan text-white'
                                                        : 'bg-pink-500/15 border-pink-500/30 text-pink-200'
                                                }`}
                                            >
                                                <span className="text-pink-300 truncate max-w-[60px]">{e.key}</span>
                                                <span className="mx-1 text-text-muted/60">→</span>
                                                <span className="text-white truncate max-w-[60px]">{e.value}</span>
                                            </motion.div>
                                        );
                                    })
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                ))}
            </div>

            <div className="text-[10px] font-mono text-text-muted/60 mt-1">
                size: <span className="text-pink-400 font-bold">{data.entries.length}</span>
                <span className="mx-2">·</span>
                buckets: <span className="text-pink-300">{numBuckets}</span>
                <span className="mx-2">·</span>
                load: <span className="text-pink-300">{(data.entries.length / numBuckets).toFixed(2)}</span>
            </div>
        </div>
    );
}

export default memo(HashMapView);
