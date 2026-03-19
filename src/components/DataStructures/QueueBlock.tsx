import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { QueueState } from '../../types';

interface Props {
    data: QueueState;
}

export default function QueueBlock({ data }: Props) {
    const prevCountRef = useRef(data.items.length);
    const [lastAction, setLastAction] = useState<'enqueue' | 'dequeue' | null>(null);

    useEffect(() => {
        const prevCount = prevCountRef.current;
        const currCount = data.items.length;
        if (currCount > prevCount) {
            setLastAction('enqueue');
        } else if (currCount < prevCount) {
            setLastAction('dequeue');
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
            <h3 className="text-xs font-bold text-accent-cyan tracking-widest uppercase">
                Queue: <span className="font-mono">{data.name}</span>
            </h3>

            {/* Main conveyor belt container */}
            <div className="relative flex items-center w-full max-w-full">
                {/* Dequeue side indicator */}
                <div className="flex flex-col items-center gap-1 mr-3 shrink-0">
                    <motion.div
                        animate={lastAction === 'dequeue'
                            ? { opacity: [0, 1, 1, 0], x: [-8, 0, 0, -20] }
                            : { opacity: 0.5 }
                        }
                        transition={lastAction === 'dequeue' ? { duration: 0.8 } : { duration: 0.3 }}
                        className="text-accent-cyan text-lg font-mono"
                    >
                        ←
                    </motion.div>
                    <span className="text-[9px] text-accent-cyan/70 font-mono font-bold tracking-wider">
                        FRONT
                    </span>
                </div>

                {/* Pipe container */}
                <div className="relative flex-1 min-w-0">
                    {/* Pipe border - top */}
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent-cyan/60 via-accent-cyan/20 to-accent-cyan/60 rounded-full" />
                    {/* Pipe border - bottom */}
                    <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent-cyan/60 via-accent-cyan/20 to-accent-cyan/60 rounded-full" />

                    {/* Flow direction indicators (subtle animated dots) */}
                    <div className="absolute inset-x-0 bottom-[6px] flex items-center justify-center gap-3 pointer-events-none z-0">
                        {[0, 1, 2, 3, 4].map(i => (
                            <motion.div
                                key={i}
                                animate={{ opacity: [0.05, 0.2, 0.05] }}
                                transition={{ duration: 2, repeat: Infinity, delay: i * 0.35 }}
                                className="w-1 h-1 rounded-full bg-accent-cyan"
                            />
                        ))}
                    </div>

                    {/* Items area */}
                    <div className="flex items-center gap-2 px-3 py-4 min-h-[68px] overflow-x-auto scrollbar-hide relative z-10">
                        <AnimatePresence mode="popLayout">
                            {data.items.map((item, index) => {
                                const isFront = index === 0;
                                const isBack = index === data.items.length - 1;
                                const displayVal = String(item.value);

                                return (
                                    <motion.div
                                        key={item.id}
                                        layout
                                        initial={{ opacity: 0, scale: 0.4, x: 60 }}
                                        animate={{ opacity: 1, scale: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.4, x: -60 }}
                                        transition={{
                                            layout: { type: 'spring', stiffness: 350, damping: 30 },
                                            opacity: { duration: 0.3 },
                                            scale: { type: 'spring', stiffness: 300, damping: 20 },
                                            x: { type: 'spring', stiffness: 200, damping: 22 },
                                        }}
                                        className="relative shrink-0"
                                    >
                                        {/* Front/Back badge */}
                                        {(isFront || isBack) && data.items.length > 1 && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={`absolute -top-5 left-1/2 -translate-x-1/2 text-[8px] font-bold font-mono tracking-wider whitespace-nowrap
                                                    ${isFront ? 'text-accent-cyan' : 'text-accent-cyan/50'}`}
                                            >
                                                {isFront ? 'FRONT' : 'BACK'}
                                            </motion.div>
                                        )}

                                        {/* Glow effect for front element */}
                                        {isFront && (
                                            <motion.div
                                                animate={{ opacity: [0.15, 0.35, 0.15] }}
                                                transition={{ duration: 2, repeat: Infinity }}
                                                className="absolute inset-[-6px] bg-accent-cyan/20 blur-[12px] rounded-xl z-[-1]"
                                            />
                                        )}

                                        {/* Block */}
                                        <div
                                            className={`
                                                min-w-[48px] h-[48px] px-3 rounded-lg flex items-center justify-center
                                                font-mono font-semibold text-sm
                                                border transition-all duration-300
                                                ${isFront
                                                    ? 'bg-accent-cyan/20 border-accent-cyan/50 text-accent-cyan shadow-[0_0_20px_rgba(0,229,255,0.15)]'
                                                    : isBack
                                                        ? 'bg-accent-cyan/8 border-accent-cyan/30 text-white/90'
                                                        : 'bg-accent-cyan/5 border-accent-cyan/15 text-white/70'
                                                }
                                            `}
                                        >
                                            <span className="truncate max-w-[80px]">{displayVal}</span>
                                        </div>

                                        {/* Index label */}
                                        <div className="text-[8px] text-text-muted/50 font-mono text-center mt-1">
                                            [{index}]
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>

                        {/* Empty state */}
                        {data.items.length === 0 && (
                            <div className="flex-1 flex items-center justify-center min-h-[48px]">
                                <span className="text-text-muted/40 text-xs font-mono italic">empty queue</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Enqueue side indicator */}
                <div className="flex flex-col items-center gap-1 ml-3 shrink-0">
                    <motion.div
                        animate={lastAction === 'enqueue'
                            ? { opacity: [0, 1, 1, 0], x: [8, 0, 0, 0] }
                            : { opacity: 0.5 }
                        }
                        transition={lastAction === 'enqueue' ? { duration: 0.8 } : { duration: 0.3 }}
                        className="text-accent-cyan text-lg font-mono"
                    >
                        →
                    </motion.div>
                    <span className="text-[9px] text-accent-cyan/70 font-mono font-bold tracking-wider">
                        BACK
                    </span>
                </div>
            </div>

            {/* Action flash badge */}
            <div className="h-5 flex items-center justify-center">
                <AnimatePresence>
                    {lastAction && (
                        <motion.div
                            initial={{ opacity: 0, y: -4, scale: 0.8 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.8 }}
                            transition={{ duration: 0.25 }}
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider
                                ${lastAction === 'enqueue'
                                    ? 'bg-accent-cyan/15 text-accent-cyan border border-accent-cyan/30'
                                    : 'bg-accent-red/15 text-accent-red border border-accent-red/30'
                                }`}
                        >
                            {lastAction === 'enqueue' ? '+ enqueue' : '− dequeue'}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Footer info */}
            <div className="flex items-center gap-4 text-[10px] font-mono text-text-muted/60">
                <span>size: <span className="text-accent-cyan/80 font-bold">{data.items.length}</span></span>
                {data.items.length > 0 && (
                    <>
                        <span>front: <span className="text-accent-cyan/80">{String(data.items[0].value)}</span></span>
                        <span>back: <span className="text-accent-cyan/80">{String(data.items[data.items.length - 1].value)}</span></span>
                    </>
                )}
            </div>
        </div>
    );
}
