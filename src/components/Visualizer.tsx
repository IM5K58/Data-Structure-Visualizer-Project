import { useState, useRef, useEffect, useCallback } from 'react';
import type { DataStructureState } from '../types';
import StackPlate from './DataStructures/StackPlate';
import QueueBlock from './DataStructures/QueueBlock';
import GraphView from './DataStructures/GraphView';
import TreeChart from './DataStructures/TreeChart';
import CircularListView from './DataStructures/CircularListView';

interface Props {
    structures: DataStructureState[];
}

function renderStructure(structure: DataStructureState) {
    switch (structure.type) {
        case 'stack':
            return <StackPlate data={structure} />;
        case 'queue':
            return <QueueBlock data={structure} />;
        case 'memory':
            return <GraphView data={structure} />;
        case 'tree':
            return <TreeChart data={structure} />;
        case 'circular':
            return <CircularListView data={structure} />;
    }
}

const TYPE_COLORS: Record<string, string> = {
    stack: 'border-accent-purple/20',
    queue: 'border-accent-cyan/20',
    memory: 'border-accent-purple/40',
    tree: 'border-green-500/20',
    circular: 'border-amber-500/30',
};

export default function Visualizer({ structures }: Props) {
    const [boxDimensions, setBoxDimensions] = useState<Record<string, { w: number, h: number }>>({});
    const draggingRef = useRef<{ id: string, startY: number, startX: number, startW: number, startH: number, mode: 'v' | 'h' | 'both' } | null>(null);

    const onMouseDown = (id: string, mode: 'v' | 'h' | 'both', e: React.MouseEvent) => {
        const current = boxDimensions[id] || { 
            w: (document.getElementById(`container-${id}`)?.clientWidth || 400), 
            h: (id.includes('memory') || id.includes('tree') ? 450 : 300)
        };
        draggingRef.current = { id, startY: e.clientY, startX: e.clientX, startW: current.w, startH: current.h, mode };
        
        const cursorMap = { v: 'row-resize', h: 'col-resize', both: 'nwse-resize' };
        document.body.style.cursor = cursorMap[mode];
        document.body.style.userSelect = 'none';
    };

    const onMouseMove = useCallback((e: MouseEvent) => {
        if (!draggingRef.current) return;
        const { id, startY, startX, startW, startH, mode } = draggingRef.current;
        
        const deltaY = e.clientY - startY;
        const deltaX = e.clientX - startX;
        
        setBoxDimensions(prev => {
            const current = prev[id] || { w: startW, h: startH };
            return {
                ...prev,
                [id]: {
                    w: (mode === 'h' || mode === 'both') ? Math.max(250, startW + deltaX) : current.w,
                    h: (mode === 'v' || mode === 'both') ? Math.max(150, startH + deltaY) : current.h
                }
            };
        });
    }, []);

    const onMouseUp = useCallback(() => {
        if (draggingRef.current) {
            draggingRef.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }, []);

    useEffect(() => {
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    if (structures.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="text-6xl opacity-20">📊</div>
                    <div className="space-y-1">
                        <p className="text-text-secondary text-sm font-medium">
                            No data structures to visualize
                        </p>
                        <p className="text-text-muted text-xs">
                            Write some C++ code and press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-text-secondary font-mono text-[10px]">Run</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-text-secondary font-mono text-[10px]">Step</kbd>
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto p-6">
            <div className="flex flex-wrap gap-6 items-start">
                {structures.map((structure) => {
                    const id = `${structure.type}-${structure.name}`;
                    const dim = boxDimensions[id] || { 
                        w: -1, // -1 means use default or auto
                        h: (structure.type === 'memory' || structure.type === 'tree' || structure.type === 'circular' ? 450 : 300)
                    };
                    
                    return (
                        <div
                            key={id}
                            id={`container-${id}`}
                            style={{ 
                                height: `${dim.h}px`,
                                width: dim.w !== -1 ? `${dim.w}px` : undefined,
                                flexBasis: dim.w !== -1 ? `${dim.w}px` : undefined,
                                flexGrow: dim.w === -1 ? 1 : 0,
                                minWidth: '300px'
                            }}
                            className={`
                                rounded-xl border bg-bg-panel backdrop-blur-sm
                                flex flex-col relative group transition-shadow duration-300
                                hover:shadow-2xl hover:shadow-black/20
                                ${TYPE_COLORS[structure.type] || 'border-border'}
                            `}
                        >
                            <div className="flex-1 flex items-center justify-center overflow-hidden p-6 relative">
                                {renderStructure(structure)}
                            </div>

                            {/* Resize Handle (Bottom - Vertical) */}
                            <div 
                                onMouseDown={(e) => onMouseDown(id, 'v', e)}
                                className="h-1.5 w-full absolute bottom-0 left-0 cursor-row-resize flex items-center justify-center group/vhandle z-20"
                            >
                                <div className="w-12 h-1 rounded-full bg-border/40 group-hover/vhandle:bg-accent-cyan/50 transition-colors" />
                            </div>

                            {/* Resize Handle (Right - Horizontal) */}
                            <div 
                                onMouseDown={(e) => onMouseDown(id, 'h', e)}
                                className="w-1.5 h-full absolute right-0 top-0 cursor-col-resize flex items-center justify-center group/hhandle z-20"
                            >
                                <div className="h-12 w-1 rounded-full bg-border/40 group-hover/hhandle:bg-accent-cyan/50 transition-colors" />
                            </div>

                            {/* Resize Handle (Corner - Both) */}
                            <div 
                                onMouseDown={(e) => onMouseDown(id, 'both', e)}
                                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-30 group/chandle flex items-end justify-end p-0.5"
                            >
                                <div className="w-2 h-2 border-r-2 border-b-2 border-border/60 group-hover/chandle:border-accent-cyan/80 transition-colors rounded-br-sm" />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
