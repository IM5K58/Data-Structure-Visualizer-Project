import { motion, AnimatePresence } from 'framer-motion';
import type { QueueState } from '../../types';

interface Props {
    data: QueueState;
}

export default function QueueBlock({ data }: Props) {
    return (
        <div className="flex flex-col items-center gap-2">
            <h3 className="text-sm font-semibold text-accent-cyan tracking-wider uppercase mb-2">
                Queue: <span className="font-mono">{data.name}</span>
            </h3>

            <div className="flex items-center gap-1">
                {/* Front label */}
                <span className="text-[10px] text-accent-cyan font-mono opacity-70 mr-1">
                    FRONT →
                </span>

                <div className="flex items-center gap-1 min-w-[60px] min-h-[44px]">
                    <AnimatePresence mode="popLayout">
                        {data.items.map((item, index) => (
                            <motion.div
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.5, x: 40 }}
                                animate={{ opacity: 1, scale: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.5, x: -40 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            >
                                <div
                                    className={`
                    w-[52px] h-[44px] rounded-lg flex items-center justify-center
                    text-white font-mono font-semibold text-base
                    border border-accent-cyan/40
                    ${index === 0
                                            ? 'bg-accent-cyan/25 shadow-[0_0_15px_rgba(0,229,255,0.2)]'
                                            : 'bg-accent-cyan/10'
                                        }
                  `}
                                >
                                    {item.value}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {data.items.length === 0 && (
                        <div className="w-[52px] h-[44px] rounded-lg border border-dashed border-white/10 flex items-center justify-center text-text-muted text-xs">
                            empty
                        </div>
                    )}
                </div>

                {/* Back label */}
                <span className="text-[10px] text-accent-cyan font-mono opacity-70 ml-1">
                    ← BACK
                </span>
            </div>

            <span className="text-[10px] text-text-muted font-mono mt-1">
                size: {data.items.length}
            </span>
        </div>
    );
}
