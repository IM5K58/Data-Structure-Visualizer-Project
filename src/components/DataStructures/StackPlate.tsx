import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StackState } from '../../types';

interface Props {
    data: StackState;
}

export default function StackPlate({ data }: Props) {
    const prevCountRef = useRef(data.items.length);
    const [lastAction, setLastAction] = useState<'push' | 'pop' | null>(null);

    useEffect(() => {
        const prevCount = prevCountRef.current;
        const currCount = data.items.length;
        if (currCount > prevCount) {
            setLastAction('push');
        } else if (currCount < prevCount) {
            setLastAction('pop');
        }
        prevCountRef.current = currCount;

        if (currCount !== prevCount) {
            const timer = setTimeout(() => setLastAction(null), 800);
            return () => clearTimeout(timer);
        }
    }, [data.items.length]);

    return (
        <div className="flex flex-col items-center w-full h-full justify-center gap-3 px-4">
            {/* Title */}
            <h3 className="text-xs font-bold text-accent-purple tracking-widest uppercase">
                Stack: <span className="font-mono">{data.name}</span>
            </h3>

            {/* Push indicator */}
            <div className="h-5 flex items-center justify-center">
                <AnimatePresence>
                    {lastAction && (
                        <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.8 }}
                            transition={{ duration: 0.25 }}
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider
                                ${lastAction === 'push'
                                    ? 'bg-accent-purple/15 text-accent-purple border border-accent-purple/30'
                                    : 'bg-accent-red/15 text-accent-red border border-accent-red/30'
                                }`}
                        >
                            {lastAction === 'push' ? '+ push' : '− pop'}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Stack container with bucket walls */}
            <div className="relative flex flex-col items-center">
                {/* Bucket walls */}
                <div className="absolute inset-x-[-12px] top-0 bottom-[-8px] pointer-events-none z-0">
                    {/* Left wall */}
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-accent-purple/10 via-accent-purple/40 to-accent-purple/60 rounded-full" />
                    {/* Right wall */}
                    <div className="absolute right-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-accent-purple/10 via-accent-purple/40 to-accent-purple/60 rounded-full" />
                    {/* Bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-purple/60 rounded-full" />
                    {/* Bottom corners */}
                    <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-accent-purple/60 rounded-bl-md" />
                    <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-accent-purple/60 rounded-br-md" />
                </div>

                {/* Items (bottom to top, reversed render) */}
                <div className="relative flex flex-col-reverse items-center gap-1 min-h-[56px] z-10">
                    <AnimatePresence mode="popLayout">
                        {data.items.map((item, index) => {
                            const isTop = index === data.items.length - 1;
                            const displayVal = String(item.value);

                            return (
                                <motion.div
                                    key={item.id}
                                    layout
                                    initial={{ opacity: 0, scale: 0.4, y: -40 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.5, y: -50 }}
                                    transition={{
                                        layout: { type: 'spring', stiffness: 350, damping: 30 },
                                        opacity: { duration: 0.3 },
                                        scale: { type: 'spring', stiffness: 300, damping: 20 },
                                        y: { type: 'spring', stiffness: 180, damping: 18 },
                                    }}
                                    className="relative"
                                >
                                    {/* TOP badge */}
                                    {isTop && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="absolute -right-14 top-1/2 -translate-y-1/2 flex items-center gap-1"
                                        >
                                            <span className="text-[10px] text-accent-purple font-mono font-bold opacity-80">← TOP</span>
                                        </motion.div>
                                    )}

                                    {/* Glow effect for top element */}
                                    {isTop && (
                                        <motion.div
                                            animate={{ opacity: [0.15, 0.35, 0.15] }}
                                            transition={{ duration: 2, repeat: Infinity }}
                                            className="absolute inset-[-6px] bg-accent-purple/20 blur-[12px] rounded-xl z-[-1]"
                                        />
                                    )}

                                    {/* Plate block */}
                                    <div
                                        className={`
                                            w-[88px] h-[44px] rounded-lg flex items-center justify-center
                                            font-mono font-semibold text-sm
                                            border transition-all duration-300
                                            ${isTop
                                                ? 'bg-accent-purple/25 border-accent-purple/50 text-white shadow-[0_0_20px_rgba(124,58,237,0.2)]'
                                                : 'bg-accent-purple/10 border-accent-purple/20 text-white/70'
                                            }
                                        `}
                                    >
                                        <span className="truncate max-w-[72px]">{displayVal}</span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>

                    {/* Empty state */}
                    {data.items.length === 0 && (
                        <div className="w-[88px] h-[44px] rounded-lg border border-dashed border-white/10 flex items-center justify-center">
                            <span className="text-text-muted/40 text-xs font-mono italic">empty</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer info */}
            <div className="flex items-center gap-4 text-[10px] font-mono text-text-muted/60 mt-1">
                <span>size: <span className="text-accent-purple/80 font-bold">{data.items.length}</span></span>
                {data.items.length > 0 && (
                    <span>top: <span className="text-accent-purple/80">{String(data.items[data.items.length - 1].value)}</span></span>
                )}
            </div>
        </div>
    );
}
