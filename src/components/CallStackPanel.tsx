import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    /** Outermost → innermost. The last entry is the currently-executing function. */
    frames: string[];
}

export default function CallStackPanel({ frames }: Props) {
    if (frames.length === 0) {
        return (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Call Stack
                </h3>
                <p className="text-xs text-gray-600 italic">No active frames</p>
            </div>
        );
    }

    // Render innermost on top (matches how IDE call-stack panels look).
    const innermostFirst = [...frames].reverse();

    return (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Call Stack
                </h3>
                <span className="text-[10px] text-gray-600 font-mono">
                    depth: <span className="text-accent-cyan font-bold">{frames.length}</span>
                </span>
            </div>
            <ol className="space-y-1">
                <AnimatePresence initial={false}>
                    {innermostFirst.map((fn, idx) => {
                        const isCurrent = idx === 0;
                        return (
                            <motion.li
                                key={`${fn}-${frames.length - idx}`}
                                layout
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 8 }}
                                transition={{ duration: 0.15 }}
                                className={`flex items-center gap-2 text-xs font-mono px-2 py-1 rounded ${
                                    isCurrent
                                        ? 'bg-accent-cyan/15 border border-accent-cyan/30 text-accent-cyan font-bold'
                                        : 'text-gray-400'
                                }`}
                            >
                                <span className="text-[10px] text-gray-500 tabular-nums w-5 text-right">
                                    #{frames.length - 1 - idx}
                                </span>
                                <span className="truncate">{fn}</span>
                                {isCurrent && (
                                    <span className="ml-auto text-[9px] uppercase tracking-widest opacity-70">
                                        ← here
                                    </span>
                                )}
                            </motion.li>
                        );
                    })}
                </AnimatePresence>
            </ol>
        </div>
    );
}
