import { useState, useRef, useEffect, useCallback } from 'react';
import type { DataStructureState } from '../types';
import type { LastChange } from '../hooks/useVisualizer';
import StackPlate from './DataStructures/StackPlate';
import QueueBlock from './DataStructures/QueueBlock';
import GraphView from './DataStructures/GraphView';
import TreeChart from './DataStructures/TreeChart';
import CircularListView from './DataStructures/CircularListView';
import DoublyListView from './DataStructures/DoublyListView';
import GraphChart from './DataStructures/GraphChart';
import HeapView from './DataStructures/HeapView';
import HashMapView from './DataStructures/HashMapView';
import UnionFindView from './DataStructures/UnionFindView';

export interface NodeHighlight {
    nodeId: string | null;
    property: string | null;
    kind: LastChange['kind'];
}

interface Props {
    structures: DataStructureState[];
    lastChange?: LastChange | null;
}

function renderStructure(structure: DataStructureState, highlight: NodeHighlight | null) {
    switch (structure.type) {
        case 'stack':
            return <StackPlate data={structure} highlight={highlight} />;
        case 'queue':
            return <QueueBlock data={structure} highlight={highlight} />;
        case 'memory':
            return <GraphView data={structure} highlight={highlight} />;
        case 'tree':
            return <TreeChart data={structure} highlight={highlight} />;
        case 'circular':
            return <CircularListView data={structure} highlight={highlight} />;
        case 'doubly':
            return <DoublyListView data={structure} highlight={highlight} />;
        case 'graph':
            return <GraphChart data={structure} highlight={highlight} />;
        case 'heap':
            return <HeapView data={structure} highlight={highlight} />;
        case 'hashmap':
            return <HashMapView data={structure} highlight={highlight} />;
        case 'unionfind':
            return <UnionFindView data={structure} highlight={highlight} />;
    }
}

function highlightFor(structure: DataStructureState, lastChange: LastChange | null | undefined): NodeHighlight | null {
    if (!lastChange) return null;
    // Memory-class structures get reclassified into different targets after analysis.
    // The lastChange.target follows that reclassification, so a 'doubly' structure
    // matches a lastChange.target === 'doubly', and so on. We only need name + target equality.
    if (lastChange.target !== structure.type || lastChange.targetName !== structure.name) return null;
    return {
        nodeId: lastChange.nodeId,
        property: lastChange.property,
        kind: lastChange.kind,
    };
}

const TYPE_COLORS: Record<string, string> = {
    stack: 'border-accent-purple/20',
    queue: 'border-accent-cyan/20',
    memory: 'border-accent-purple/40',
    tree: 'border-green-500/20',
    circular: 'border-amber-500/30',
    doubly: 'border-accent-cyan/40',
    graph: 'border-rose-500/30',
    heap: 'border-orange-500/30',
    hashmap: 'border-pink-500/30',
    unionfind: 'border-emerald-500/30',
};

export default function Visualizer({ structures, lastChange }: Props) {
    const [boxDimensions, setBoxDimensions] = useState<Record<string, { w: number, h: number }>>({});
    const draggingRef = useRef<{ id: string, startY: number, startX: number, startW: number, startH: number, mode: 'v' | 'h' | 'both' } | null>(null);

    const onMouseDown = (id: string, mode: 'v' | 'h' | 'both', e: React.MouseEvent) => {
        const current = boxDimensions[id] || {
            w: (document.getElementById(`container-${id}`)?.clientWidth || 400),
            h: (id.includes('memory') || id.includes('tree') || id.includes('doubly') || id.includes('graph') || id.includes('circular') ? 450 : 300)
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
                        h: (
                            structure.type === 'memory' || structure.type === 'tree'
                            || structure.type === 'circular' || structure.type === 'doubly'
                            || structure.type === 'graph' || structure.type === 'heap'
                            || structure.type === 'hashmap' || structure.type === 'unionfind'
                                ? 450 : 300
                        )
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
                                {renderStructure(structure, highlightFor(structure, lastChange))}
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
