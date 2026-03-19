import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { MemoryState } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
    data: MemoryState;
}

interface Edge {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    targetSide: 'left' | 'right' | 'top' | 'bottom' | 'self';
    isNew?: boolean;
}

function getElementLocalPos(el: HTMLElement, targetParent: HTMLElement) {
    let top = 0;
    let left = 0;
    let current: HTMLElement | null = el;
    while (current && current !== targetParent) {
        top += current.offsetTop;
        left += current.offsetLeft;
        current = current.offsetParent as HTMLElement | null;
    }
    return { x: left, y: top, width: el.offsetWidth, height: el.offsetHeight };
}

export default function GraphView({ data }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mainContainerRef = useRef<HTMLDivElement>(null);
    const [edges, setEdges] = useState<Edge[]>([]);
    const edgesRef = useRef<Edge[]>([]);
    const prevNodeIds = useRef<Set<string>>(new Set());
    const [newNodeIds, setNewNodeIds] = useState<Set<string>>(new Set());
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const isDraggingPan = useRef(false);
    const lastPos = useRef({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 0) {
            if ((e.target as HTMLElement).closest('button')) return;
            isDraggingPan.current = true;
            lastPos.current = { x: e.clientX, y: e.clientY };
            if (mainContainerRef.current) mainContainerRef.current.style.cursor = 'grabbing';
        }
    };

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isDraggingPan.current) {
            const dx = e.clientX - lastPos.current.x;
            const dy = e.clientY - lastPos.current.y;
            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            lastPos.current = { x: e.clientX, y: e.clientY };
        }
    }, []);

    const handleMouseUp = useCallback(() => {
        isDraggingPan.current = false;
        if (mainContainerRef.current) mainContainerRef.current.style.cursor = 'default';
    }, []);

    const resetView = () => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    };

    // Check if current memory structure looks like a Stack or Linked List
    const { isStackMode, isLinkedListMode } = useMemo(() => {
        if (data.nodes.length === 0) return { isStackMode: false, isLinkedListMode: false };
        
        // 1. Check for manual name override or explicit hint if we had one
        const hasStackInName = data.name.toLowerCase().includes('stack');
        
        // 2. Behavioral/Structural analysis
        // A Linked List is usually a single chain where each node has at most one outgoing pointer (to another node)
        // and at most one incoming pointer.
        let isLinear = true;
        const inDegree = new Map<string, number>();
        data.nodes.forEach(n => inDegree.set(n.id, 0));
        
        data.nodes.forEach(n => {
            const outPointers = Object.values(n.pointers).filter(target => target && data.nodes.some(m => m.id === target));
            if (outPointers.length > 1) isLinear = false;
            outPointers.forEach(target => {
                if (target) inDegree.set(target, (inDegree.get(target) || 0) + 1);
            });
        });

        if (Array.from(inDegree.values()).some(d => d > 1)) isLinear = false;
        
        const isLinkedList = isLinear && data.nodes.length > 1;

        return { 
            isStackMode: hasStackInName, 
            isLinkedListMode: isLinkedList && !hasStackInName 
        };
    }, [data.nodes, data.name]);

    // Final safety check for data integrity
    if (!data.nodes || !Array.isArray(data.nodes)) {
        return <div className="p-4 text-text-muted">No memory nodes to display.</div>;
    }

    // Calculate logical order of nodes
    const orderedNodes = useMemo(() => {
        const result: typeof data.nodes = [];
        const inDegree = new Map<string, number>();
        const adj = new Map<string, string[]>();

        data.nodes.forEach(n => {
            inDegree.set(n.id, 0);
            adj.set(n.id, []);
        });

        data.nodes.forEach(n => {
            Object.values(n.pointers).forEach(targetId => {
                if (targetId && inDegree.has(targetId)) {
                    adj.get(n.id)!.push(targetId);
                    inDegree.set(targetId, inDegree.get(targetId)! + 1);
                }
            });
        });

        const queue: string[] = [];
        const visited = new Set<string>();
        
        // Priority for Stack: Top-down
        if (isStackMode) {
            // In stack, the entry is usually the one pointed by a 'top' label or highest in-degree
            const stackRoots = data.nodes.filter(n => inDegree.get(n.id) === 0);
            queue.push(...stackRoots.map(n => n.id));
        } else {
            data.nodes.forEach(n => {
                if (inDegree.get(n.id) === 0) queue.push(n.id);
            });
        }

        if (queue.length === 0 && data.nodes.length > 0) {
            queue.push(data.nodes[data.nodes.length - 1].id);
        }

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);
            const node = data.nodes.find(n => n.id === currentId);
            if (node) result.push(node);
            const children = adj.get(currentId) || [];
            children.forEach(childId => queue.push(childId));
        }

        data.nodes.forEach(n => {
            if (!visited.has(n.id)) {
                result.push(n);
                visited.add(n.id);
            }
        });

        return result;
    }, [data.nodes, isStackMode]);

    // Track new nodes and handle wheel listener
    useEffect(() => {
        const currentIds = new Set(data.nodes.map(n => n.id));
        const newlyAdded = new Set([...currentIds].filter(id => !prevNodeIds.current.has(id)));
        
        if (newlyAdded.size > 0) {
            setNewNodeIds(newlyAdded);
            setTimeout(() => setNewNodeIds(new Set()), 1000);
        }
        prevNodeIds.current = currentIds;

        const container = mainContainerRef.current;
        if (!container) return;

        const onWheelNative = (e: WheelEvent) => {
            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                const delta = -e.deltaY * 0.001;
                setScale(prev => Math.min(Math.max(0.5, prev + delta), 2));
            }
        };

        container.addEventListener('wheel', onWheelNative, { passive: false });
        return () => container.removeEventListener('wheel', onWheelNative);
    }, [data.nodes]);

    // Update edge coordinates
    useEffect(() => {
        let animationFrameId: number;
        const calculateEdges = () => {
            const innerDiv = containerRef.current;
            if (!innerDiv) return;
            
            const newEdges: Edge[] = [];

            data.nodes.forEach(node => {
                Object.entries(node.pointers).forEach(([ptrName, targetId]) => {
                    if (!targetId) return;
                    const sourceEl = document.getElementById(`ptr-${node.id}-${ptrName}`);
                    const targetEl = document.getElementById(`node-${targetId}`);

                    if (sourceEl && targetEl) {
                        const sPos = getElementLocalPos(sourceEl, innerDiv);
                        const tPos = getElementLocalPos(targetEl, innerDiv);

                        const x1 = sPos.x + sPos.width;
                        const y1 = sPos.y + sPos.height / 2;

                        const sCenterX = sPos.x + sPos.width / 2;
                        const sCenterY = sPos.y + sPos.height / 2;
                        const tCenterX = tPos.x + tPos.width / 2;
                        const tCenterY = tPos.y + tPos.height / 2;

                        let x2, y2, targetSide: Edge['targetSide'] = 'left';

                        if (node.id === targetId) {
                            x2 = tPos.x + tPos.width - 10;
                            y2 = tPos.y + tPos.height + 4;
                            targetSide = 'self';
                        } else if (isStackMode) {
                            // In stack mode, pointers go straight down
                            x2 = tCenterX;
                            y2 = tPos.y - 4;
                            targetSide = 'top';
                        } else if (isLinkedListMode) {
                            // In linked list mode, pointers go straight right
                            x2 = tPos.x - 4;
                            y2 = tPos.y + tPos.height / 2;
                            targetSide = 'left';
                        } else if (tPos.x > sPos.x + sPos.width + 40) {
                            x2 = tPos.x - 4;
                            y2 = tPos.y + 15;
                            targetSide = 'left';
                        } else if (tPos.x + tPos.width < sPos.x - 40) {
                            x2 = tPos.x + tPos.width + 4;
                            y2 = tPos.y + 15;
                            targetSide = 'right';
                        } else if (tCenterY > sCenterY) {
                            const xOffset = sCenterX < tCenterX ? -30 : 30;
                            x2 = tCenterX + xOffset;
                            y2 = tPos.y - 4;
                            targetSide = 'top';
                        } else {
                            const xOffset = sCenterX < tCenterX ? -30 : 30;
                            x2 = tCenterX + xOffset;
                            y2 = tPos.y + tPos.height + 4;
                            targetSide = 'bottom';
                        }

                        newEdges.push({
                            id: `${node.id}-${ptrName}-${targetId}`,
                            x1, y1, x2, y2,
                            targetSide, isNew: newNodeIds.has(targetId)
                        });
                    }
                });
            });

            if (JSON.stringify(newEdges) !== JSON.stringify(edgesRef.current)) {
                setEdges(newEdges);
                edgesRef.current = newEdges;
            }
            animationFrameId = requestAnimationFrame(calculateEdges);
        };
        calculateEdges();
        return () => cancelAnimationFrame(animationFrameId);
    }, [data.nodes, newNodeIds, isStackMode, isLinkedListMode]);

    const drawPath = (e: Edge) => {
        const { x1, y1, x2, y2, targetSide } = e;
        const dx = x2 - x1, dy = y2 - y1;
        
        if (targetSide === 'self') return `M ${x1} ${y1} C ${x1 + 60} ${y1}, ${x2 + 40} ${y2 + 60}, ${x2} ${y2}`;
        
        // Safety check for NaN values that can cause SVG crashes (Black Screen)
        if ([x1, y1, x2, y2, dx, dy].some(val => typeof val !== 'number' || isNaN(val))) {
            return '';
        }

        // Stack mode: strictly linear or slight curve
        if (isStackMode && targetSide === 'top') {
            return `M ${x1} ${y1} C ${x1 + 40} ${y1}, ${x2} ${y2 - 40}, ${x2} ${y2}`;
        }
        
        // Linked list mode: straight or gentle arch
        if (isLinkedListMode && targetSide === 'left') {
            return `M ${x1} ${y1} L ${x2} ${y2}`;
        }

        const archHeightValue = Math.min(Math.abs(dx) * 0.25, 120);
        const cp1WeightValue = Math.max(Math.abs(dx) / 1.8, 60);
        
        if (isNaN(archHeightValue) || isNaN(cp1WeightValue)) return '';

        const archHeight = archHeightValue;
        const cp1Weight = cp1WeightValue;
        const cp2Weight = Math.max(Math.abs(dx) / 1.8, Math.abs(dy) / 2, 60);

        let cp1x = x1 + cp1Weight, cp1y = y1 - archHeight;
        let cp2x = x2, cp2y = y2;

        if (targetSide === 'left') { 
            cp2x = x2 - cp2Weight; 
            cp2y = y2 - archHeight; 
        }
        else if (targetSide === 'right') { 
            cp2x = x2 + cp2Weight; 
            cp2y = y2 - archHeight; 
            cp1x = x1 + Math.max(Math.abs(dx), 80); 
        }
        else if (targetSide === 'top') { 
            cp2x = x2; 
            cp2y = y2 - Math.max(cp2Weight, archHeight); 
            if (dx < 0) cp1x = x1 + 60; 
        }
        else if (targetSide === 'bottom') { 
            cp2x = x2; 
            cp2y = y2 + cp2Weight; 
        }

        return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
    };

    return (
        <div 
            ref={mainContainerRef}
            className="flex flex-col items-center w-full min-h-[400px] h-full relative font-mono overflow-hidden select-none bg-black/5 rounded-lg"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            <h3 className="text-xs font-bold text-accent-purple mb-4 uppercase tracking-widest absolute top-0 left-4 z-20 pointer-events-none p-4">
                {isStackMode ? 'Stack Visualization' : isLinkedListMode ? 'Linked List' : 'Memory (Heap)'}
            </h3>

            <div className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-bg-panel/80 backdrop-blur-md border border-border p-1.5 rounded-lg shadow-xl pointer-events-auto">
                <button onClick={() => setScale(prev => Math.max(0.5, prev - 0.1))} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-text-secondary transition-colors" title="Zoom Out">−</button>
                <div className="px-2 text-[10px] font-bold text-accent-cyan min-w-[45px] text-center cursor-pointer hover:text-white" onClick={resetView} title="Reset View">{Math.round(scale * 100)}%</div>
                <button onClick={() => setScale(prev => Math.min(2, prev + 0.1))} className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-text-secondary transition-colors" title="Zoom In">+</button>
            </div>

            <div
                ref={containerRef}
                style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: 'center center' }}
                className={`flex-1 w-full h-full flex ${isStackMode ? 'flex-col items-center gap-8' : isLinkedListMode ? 'flex-row items-center justify-center gap-24' : 'flex-wrap items-start justify-start gap-16'} p-24 relative transition-transform duration-100`}
            >
                {/* Stack Bucket Overlay */}
                {isStackMode && (
                    <div className="absolute top-20 bottom-10 w-48 bg-white/5 border-x border-b border-white/10 rounded-b-3xl pointer-events-none backdrop-blur-[2px] z-0" />
                )}

                <svg className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible">
                    <defs>
                        <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="rgba(192, 132, 252, 0.8)" />
                        </marker>
                    </defs>
                    {edges.map(e => (
                        <motion.path
                            key={e.id}
                            initial={e.isNew ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
                            animate={{ pathLength: 1, opacity: 0.6 }}
                            transition={{ duration: 0.8, ease: "easeInOut", delay: e.isNew ? 0.2 : 0 }}
                            d={drawPath(e)}
                            fill="none" stroke="rgba(192, 132, 252, 1)" strokeWidth={2 / scale}
                            markerEnd="url(#arrowhead)" className="drop-shadow-[0_0_8px_rgba(192,132,252,0.4)]"
                        />
                    ))}
                </svg>

                <AnimatePresence mode="popLayout">
                    {orderedNodes.map((node, idx) => {
                        const isNew = newNodeIds.has(node.id);
                        const isTop = isStackMode && idx === 0;
                        
                        return (
                        <motion.div
                            key={node.id} layout
                            initial={isNew 
                                ? (isStackMode ? { opacity: 0, y: -500, scale: 0.3, rotate: -10 } : { opacity: 0, scale: 0.5, x: 500, y: 300, rotate: 15, filter: 'blur(20px)' })
                                : { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, filter: 'blur(0px)' }
                            }
                            animate={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0, filter: 'blur(0px)' }}
                            exit={isStackMode 
                                ? { opacity: 0, y: -300, scale: 0.5, rotate: 10 } 
                                : { opacity: 0, scale: 0.5, y: 100, x: 100, rotate: -15 }
                            }
                            transition={{ 
                                layout: { type: 'spring', stiffness: 250, damping: 35, mass: 1 },
                                opacity: { duration: 0.5 },
                                x: { type: 'spring', stiffness: 120, damping: 20 },
                                y: isStackMode ? { type: 'spring', stiffness: 100, damping: 15, mass: 1.2 } : { type: 'spring', stiffness: 120, damping: 20 },
                                scale: { type: 'spring', stiffness: 200, damping: 15 }
                            }}
                            className={`flex flex-col items-center z-10 relative transition-all duration-500 ${isNew ? 'scale-105 select-none' : ''}`}
                        >
                            {isTop && (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.5 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="absolute -top-10 bg-accent-purple px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-[0_0_15px_rgba(192,132,252,0.6)] z-20"
                                >
                                    TOP
                                </motion.div>
                            )}

                            {(isNew || isTop) && (
                                <motion.div 
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: [0, 0.4, 0], scale: [0.9, 1.2, 0.9] }}
                                    transition={{ duration: 1.5, repeat: Infinity }}
                                    className="absolute inset-[-20px] bg-accent-purple/15 blur-[25px] rounded-full z-[-1]"
                                />
                            )}
                            <div id={`node-${node.id}`} className={`flex flex-col items-center relative transition-shadow duration-500 ${isNew || isTop ? 'shadow-[0_0_40px_rgba(192,132,252,0.3)]' : ''}`}>
                                <div className="bg-bg-tertiary px-3 py-1 rounded-t-lg border border-border text-[10px] font-bold text-text-secondary w-full text-center tracking-wider z-10">{node.type}</div>
                                <div className="bg-bg-panel border border-t-0 border-border rounded-b-lg shadow-xl shadow-bg-secondary/20 overflow-hidden w-36 relative">
                                    {Object.entries(node.fields).map(([fieldName, val]) => (
                                        <div key={fieldName} className="flex border-b border-border/40 text-xs text-center border-border/40">
                                            <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted bg-black/10 text-[11px] font-mono tracking-tighter truncate">{fieldName}</div>
                                            <div className="w-[55%] p-1.5 text-accent-cyan font-bold truncate overflow-visible">{val !== undefined ? String(val) : '?'}</div>
                                        </div>
                                    ))}
                                    {Object.entries(node.pointers).map(([ptrName, targetId]) => (
                                        <div key={ptrName} className="flex border-b border-border/40 text-xs bg-accent-purple/5">
                                            <div className="w-[45%] p-1.5 border-r border-border/40 text-text-muted text-center bg-black/20 text-[11px] font-mono tracking-tighter truncate">{ptrName}</div>
                                            <div id={`ptr-${node.id}-${ptrName}`} className="w-[55%] p-1.5 text-accent-purple text-center tracking-tighter truncate opacity-80 font-bold bg-accent-purple/5">
                                                {targetId ? `*${(targetId as string).includes('-') ? (targetId as string).split('-')[1] : (targetId as string).slice(-4)}` : 'null'}
                                            </div>
                                        </div>
                                    ))}
                                    {Object.keys(node.fields).length === 0 && Object.keys(node.pointers).length === 0 && (
                                        <div className="p-4 text-center text-[10px] text-text-muted italic opacity-50 font-mono">Uninitialized Memory</div>
                                    )}
                                </div>
                            </div>
                            {!isStackMode && (
                                <div className={`mt-2 px-2 py-0.5 rounded bg-black/20 text-[9px] text-text-muted font-mono tracking-widest opacity-60 transition-colors duration-500 ${isNew ? 'text-accent-cyan opacity-100 shadow-[0_0_10px_rgba(0,229,255,0.2)]' : ''}`}>
                                    0x{(node.id as string).includes('-') ? (node.id as string).replace('item-', '') : (node.id as string).slice(-4).toUpperCase()}A4
                                </div>
                            )}
                        </motion.div>
                        );
                    })}
                </AnimatePresence>

                {data.nodes.length === 0 && (
                    <div className="text-text-muted font-mono text-xs opacity-50 h-full flex mt-20 items-center justify-center pointer-events-none">
              /* Memory Heap Empty */
                    </div>
                )}
            </div>
        </div>
    );
}
