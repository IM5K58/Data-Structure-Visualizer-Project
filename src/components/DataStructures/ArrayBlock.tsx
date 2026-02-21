import { motion } from 'framer-motion';
import type { ArrayState } from '../../types';

interface Props {
    data: ArrayState;
}

export default function ArrayBlock({ data }: Props) {
    return (
        <div className="flex flex-col items-center gap-2">
            <h3 className="text-sm font-semibold text-accent-green tracking-wider uppercase mb-2">
                Array: <span className="font-mono">{data.name}[{data.items.length}]</span>
            </h3>

            <div className="flex items-end gap-[2px]">
                {data.items.map((item) => (
                    <div key={item.id} className="flex flex-col items-center gap-1">
                        <motion.div
                            layout
                            initial={false}
                            animate={{
                                backgroundColor:
                                    item.value !== null
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : 'rgba(255, 255, 255, 0.03)',
                                borderColor:
                                    item.value !== null
                                        ? 'rgba(16, 185, 129, 0.4)'
                                        : 'rgba(255, 255, 255, 0.08)',
                                boxShadow:
                                    item.value !== null
                                        ? '0 0 12px rgba(16, 185, 129, 0.15)'
                                        : 'none',
                            }}
                            transition={{ duration: 0.3 }}
                            className="w-[52px] h-[44px] rounded-md flex items-center justify-center border font-mono font-semibold text-base"
                        >
                            {item.value !== null ? (
                                <motion.span
                                    key={`val-${item.value}`}
                                    initial={{ opacity: 0, scale: 1.4 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="text-white"
                                >
                                    {String(item.value)}
                                </motion.span>
                            ) : (
                                <span className="text-text-muted text-xs">—</span>
                            )}
                        </motion.div>
                        <span className="text-[10px] text-text-muted font-mono">{item.index}</span>
                    </div>
                ))}
            </div>

            <span className="text-[10px] text-text-muted font-mono mt-1">
                length: {data.items.length}
            </span>
        </div>
    );
}
