import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { DataStructureState, NodeHighlight } from '../types';
import type { LastChange } from '../hooks/useVisualizer';
import { defaultPanelHeight, panelBorderFor, renderStructure } from './structureRegistry';

interface Props {
    structures: DataStructureState[];
    lastChange?: LastChange | null;
}

function structureId(structure: DataStructureState): string {
    return `${structure.type}-${structure.name}`;
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

export default function Visualizer({ structures, lastChange }: Props) {
    // Built once per step rather than per render. The views latch their pulse
    // animations off this object's identity, so rebuilding it on every render
    // (panel drags fire on mousemove) would restart every pulse timer and keep
    // the highlights stuck on.
    const highlights = useMemo(() => {
        const map = new Map<string, NodeHighlight | null>();
        for (const structure of structures) {
            map.set(structureId(structure), highlightFor(structure, lastChange));
        }
        return map;
    }, [structures, lastChange]);

    // The drag handler only has the panel id, so map id -> default height here
    // rather than re-deriving it from the id string. Substring-matching the id
    // was how a structure *named* 'graph' used to get a tree-sized panel.
    const defaultHeights = useMemo(() => {
        const m = new Map<string, number>();
        for (const s of structures) m.set(structureId(s), defaultPanelHeight(s.type));
        return m;
    }, [structures]);

    const [boxDimensions, setBoxDimensions] = useState<Record<string, { w: number, h: number }>>({});
    const draggingRef = useRef<{ id: string, startY: number, startX: number, startW: number, startH: number, mode: 'v' | 'h' | 'both' } | null>(null);

    const onMouseDown = useCallback((id: string, mode: 'v' | 'h' | 'both', e: React.MouseEvent) => {
        const current = boxDimensions[id] || {
            w: (document.getElementById(`container-${id}`)?.clientWidth || 400),
            h: defaultHeights.get(id) ?? 300,
        };
        draggingRef.current = { id, startY: e.clientY, startX: e.clientX, startW: current.w, startH: current.h, mode };

        const cursorMap = { v: 'row-resize', h: 'col-resize', both: 'nwse-resize' };
        document.body.style.cursor = cursorMap[mode];
        document.body.style.userSelect = 'none';
    }, [boxDimensions, defaultHeights]);

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
                    const id = structureId(structure);
                    const dim = boxDimensions[id] || {
                        w: -1, // -1 means use default or auto
                        h: defaultPanelHeight(structure.type),
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
                                ${panelBorderFor(structure.type)}
                            `}
                        >
                            <div className="flex-1 flex items-center justify-center overflow-hidden p-6 relative">
                                {renderStructure(structure, highlights.get(id) ?? null)}
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
