import { motion, AnimatePresence } from 'framer-motion';
import type { StackState } from '../../types';

interface Props {
    data: StackState;
}

export default function StackPlate({ data }: Props) {
    return (
        <div className="flex flex-col items-center gap-2">
            <h3 className="text-sm font-semibold text-accent-purple tracking-wider uppercase mb-2">
                Stack: <span className="font-mono">{data.name}</span>
            </h3>

            <div className="relative flex flex-col-reverse items-center gap-1 min-h-[60px]">
                <AnimatePresence mode="popLayout">
                    {data.items.map((item, index) => (
                        <motion.div
                            key={item.id}
                            layout
                            initial={{ opacity: 0, scale: 0.5, y: -30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.5, y: -40 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                            className="relative"
                        >
                            <div
                                className={`
                  w-[80px] h-[44px] rounded-lg flex items-center justify-center
                  text-white font-mono font-semibold text-base
                  border border-accent-purple/40
                  ${index === data.items.length - 1
                                        ? 'bg-accent-purple/30 shadow-[0_0_20px_rgba(124,58,237,0.3)]'
                                        : 'bg-accent-purple/15'
                                    }
                `}
                            >
                                {String(item.value)}
                            </div>
                            {index === data.items.length - 1 && (
                                <span className="absolute -right-12 top-1/2 -translate-y-1/2 text-[10px] text-accent-purple font-mono opacity-70">
                                    ← TOP
                                </span>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>

                {data.items.length === 0 && (
                    <div className="w-[80px] h-[44px] rounded-lg border border-dashed border-white/10 flex items-center justify-center text-text-muted text-xs">
                        empty
                    </div>
                )}
            </div>

            {/* Base line */}
            <div className="w-[100px] h-[2px] bg-accent-purple/40 rounded-full mt-1" />
            <span className="text-[10px] text-text-muted font-mono">
                size: {data.items.length}
            </span>
        </div>
    );
}
