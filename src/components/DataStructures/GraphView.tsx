import { useState, useRef, useEffect } from 'react';
import type { MemoryState } from '../../types';
import { motion } from 'framer-motion';

interface Props {
    data: MemoryState;
}

interface Edge {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export default function GraphView({ data }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState<Edge[]>([]);

    // Update edge coordinates continuously for smooth animation tracking
    useEffect(() => {
        let animationFrameId: number;

        const calculateEdges = () => {
            if (!containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            const newEdges: Edge[] = [];

            data.nodes.forEach(node => {
                Object.entries(node.pointers).forEach(([ptrName, targetId]) => {
                    if (!targetId) return;

                    const sourceEl = document.getElementById(`ptr-${node.id}-${ptrName}`);
                    const targetEl = document.getElementById(`node-${targetId}`);

                    if (sourceEl && targetEl) {
                        const sRect = sourceEl.getBoundingClientRect();
                        const tRect = targetEl.getBoundingClientRect();

                        // Start right middle of the exact pointer field cell
                        const x1 = sRect.right - containerRect.left;
                        const y1 = sRect.top + sRect.height / 2 - containerRect.top;

                        // End top middle or left middle of the target struct box
                        const dx = tRect.left - sRect.right;
                        let x2, y2;

                        if (dx > 0) {
                            // Target is comfortably to the right
                            x2 = tRect.left - containerRect.left - 2;
                            y2 = tRect.top + 20 - containerRect.top;
                        } else {
                            // Target is below, above, or behind
                            x2 = tRect.left + tRect.width / 2 - containerRect.left;
                            y2 = tRect.top - containerRect.top - 2;
                        }

                        newEdges.push({ id: `${node.id}-${ptrName}-${targetId}`, x1, y1, x2, y2 });
                    }
                });
            });

            setEdges(newEdges);
            animationFrameId = requestAnimationFrame(calculateEdges);
        };

        calculateEdges();
        return () => cancelAnimationFrame(animationFrameId);
    }, [data.nodes]);

    const drawPath = (x1: number, y1: number, x2: number, y2: number) => {
        const isTargetAboveBox = Math.abs(x1 - x2) < 50 && y2 < y1;
        const curvature = Math.max(Math.abs(x2 - x1) / 2, 40);

        if (isTargetAboveBox) {
            // Curve loops backwards
            return `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 + 40} ${y2 - 60}, ${x2} ${y2}`;
        }

        return `M ${x1} ${y1} C ${x1 + curvature} ${y1}, ${x2 - curvature} ${y2}, ${x2} ${y2}`;
    };

    return (
        <div className="flex flex-col items-center w-full min-h-[350px] relative font-mono">
            <h3 className="text-xs font-bold text-accent-purple mb-4 uppercase tracking-widest absolute top-0 left-4 z-20">
                Memory (Heap)
            </h3>

            <div ref={containerRef} className="flex-1 w-full flex flex-wrap gap-16 p-8 items-start justify-center relative">

                {/* SVG Arrow Canvas */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 overflow-visible">
                    <defs>
                        <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="rgba(192, 132, 252, 0.6)" />
                        </marker>
                    </defs>
                    {edges.map(e => (
                        <path
                            key={e.id}
                            d={drawPath(e.x1, e.y1, e.x2, e.y2)}
                            fill="none"
                            stroke="rgba(192, 132, 252, 0.4)"
                            strokeWidth="2"
                            markerEnd="url(#arrowhead)"
                            className="drop-shadow-md"
                        />
                    ))}
                </svg>

                {/* Nodes */}
                {data.nodes.map((node) => (
                    <motion.div
                        key={node.id}
                        initial={{ opacity: 0, scale: 0.8, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: -15 }}
                        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                        className="flex flex-col items-center z-10"
                    >
                        {/* Type Header */}
                        <div className="bg-bg-tertiary px-3 py-1 rounded-t-lg border border-border text-[10px] font-bold text-text-secondary w-full text-center tracking-wider z-10">
                            {node.type}
                        </div>

                        {/* Struct Body */}
                        <div id={`node-${node.id}`} className="bg-bg-panel border border-t-0 border-border rounded-b-lg shadow-xl shadow-bg-secondary/20 overflow-hidden w-36 relative">

                            {/* Data Fields */}
                            {Object.entries(node.fields).map(([fieldName, val]) => (
                                <div key={fieldName} className="flex border-b border-border/40 text-xs">
                                    <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted text-center bg-black/10 text-[11px]">
                                        {fieldName}
                                    </div>
                                    <div className="w-[55%] p-1.5 text-accent-cyan text-center font-bold">
                                        {val !== undefined ? String(val) : '?'}
                                    </div>
                                </div>
                            ))}

                            {/* Pointer Fields */}
                            {Object.entries(node.pointers).map(([ptrName, targetId]) => (
                                <div key={ptrName} className="flex border-b border-border/40 text-xs bg-accent-purple/5">
                                    <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted text-center bg-black/20 text-[11px]">
                                        {ptrName}
                                    </div>
                                    <div id={`ptr-${node.id}-${ptrName}`} className="w-[55%] p-1.5 text-accent-purple text-center tracking-tighter truncate opacity-80 font-bold bg-accent-purple/5">
                                        {targetId ? `*${targetId.split('-')[1]}` : 'null'}
                                    </div>
                                </div>
                            ))}

                            {/* Empty state if struct has no properties yet */}
                            {Object.keys(node.fields).length === 0 && Object.keys(node.pointers).length === 0 && (
                                <div className="p-4 text-center text-[10px] text-text-muted italic opacity-50">
                                    Uninitialized Memory
                                </div>
                            )}

                        </div>

                        {/* Hex Address Label */}
                        <div className="mt-2 px-2 py-0.5 rounded bg-black/20 text-[9px] text-text-muted font-mono tracking-widest opacity-60">
                            0x{node.id.replace('item-', '')}A4
                        </div>
                    </motion.div>
                ))}
                {data.nodes.length === 0 && (
                    <div className="text-text-muted font-mono text-xs opacity-50 h-full flex mt-20 items-center justify-center pointer-events-none">
             /* Memory Heap Empty */
                    </div>
                )}
            </div>
        </div>
    );
}
