import { memo, useMemo } from 'react';
import type { TreeState, NodeHighlight } from '../../types';
import ZoomToolbar from './ZoomToolbar';
import { accentFor } from './accents';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNewIds, usePulse } from '../../hooks/usePulse';
import { usePanZoom } from './usePanZoom';
import { NODE_CARD_W, computeTreeLayout, nodeCardHeight } from './layout';
import { NodeCard, NodeLabels } from './NodeCard';

interface Props {
    data: TreeState;
    highlight?: NodeHighlight | null;
}

interface TreeEdge {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isNew: boolean;
}

function TreeChart({ data, highlight }: Props) {
    const reduceMotion = useReducedMotion();
    const accent = accentFor('tree');
    // Marker ids are document-global: two panels of the same type would
    // otherwise emit the same id and the browser would use only the first.
    const markerId = `tree-arrow-${data.name}`;
    // Pulse the most recently changed node + field for ~700ms after a step.
    const pulse = usePulse(
        highlight?.nodeId ? { nodeId: highlight.nodeId, property: highlight.property } : null,
        highlight
    );

    // Track new nodes for entry animation
    const nodeIds = useMemo(() => data.nodes.map(n => n.id), [data.nodes]);
    const newNodeIds = useNewIds(nodeIds, 1000);

    const layoutNodes = useMemo(() => computeTreeLayout(data.nodes, data.rootId), [data.nodes, data.rootId]);
    const allIds = useMemo(() => new Set(data.nodes.map(n => n.id)), [data.nodes]);

    // Re-fits whenever the tree changes shape — until the user pans or zooms,
    // after which their framing is left alone until they press reset.
    const { containerProps, transformStyle, scale, zoomIn, zoomOut, reset } = usePanZoom({
        transformOrigin: '0 0',
        minScale: 0.3,
        maxScale: 2.5,
        refitKey: layoutNodes,
        fitPadding: { top: 40 },
        getContentBounds: () => {
            if (layoutNodes.length === 0) return null;
            return {
                minX: Math.min(...layoutNodes.map(ln => ln.x)),
                maxX: Math.max(...layoutNodes.map(ln => ln.x)) + NODE_CARD_W,
                minY: 0,
                maxY: Math.max(...layoutNodes.map(ln => ln.y + nodeCardHeight(ln.node))),
            };
        },
    });

    // Edges computed from layout positions
    const edges = useMemo<TreeEdge[]>(() => {
        const posMap = new Map(layoutNodes.map(ln => [ln.node.id, ln]));
        const result: TreeEdge[] = [];

        layoutNodes.forEach(ln => {
            const childPtrEntries = Object.entries(ln.node.pointers).filter(
                ([, id]) => id && allIds.has(id!)
            );
            childPtrEntries.forEach(([, targetId], i) => {
                if (!targetId) return;
                const target = posMap.get(targetId);
                if (!target) return;

                const srcH = nodeCardHeight(ln.node);
                const n = childPtrEntries.length;
                const spread = Math.min(NODE_CARD_W * 0.6, 20 * n);
                const xShift = n > 1 ? ((i / (n - 1)) - 0.5) * spread : 0;

                result.push({
                    id: `${ln.node.id}-${i}-${targetId}`,
                    x1: ln.x + NODE_CARD_W / 2 + xShift,
                    y1: ln.y + srcH,
                    x2: target.x + NODE_CARD_W / 2,
                    y2: target.y,
                    isNew: newNodeIds.has(targetId),
                });
            });
        });
        return result;
    }, [layoutNodes, newNodeIds, allIds]);

    if (!data.nodes || data.nodes.length === 0) {
        return <div className="p-4 text-text-muted text-xs font-mono">/* Tree Empty */</div>;
    }

    return (
        <div
            {...containerProps}
            className="flex flex-col items-center w-full min-h-[400px] h-full relative font-mono overflow-hidden select-none bg-black/5 rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan/40"
        >
            <h3 className={`text-xs font-bold ${accent.heading} mb-4 uppercase tracking-widest absolute top-0 left-4 z-20 pointer-events-none p-4`}>
                Tree Visualization
            </h3>

            <ZoomToolbar
                scale={scale}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                onReset={reset}
                tone={accent.heading}
                label="tree"
            />

            <div
                style={transformStyle}
                className="absolute inset-0"
            >
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
                    <defs>
                        <marker id={markerId} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill={accent.edgeArrow} />
                        </marker>
                    </defs>
                    {edges.map(e => {
                        // Clamp the control-point reach to half the gap. With a fixed
                        // ±30 and rows that touched, both control points overshot the
                        // endpoints and the curve doubled back on itself.
                        const k = Math.min(30, (e.y2 - e.y1) / 2);
                        const cy1 = e.y1 + k;
                        const cy2 = e.y2 - k;
                        const path = `M ${e.x1} ${e.y1} C ${e.x1} ${cy1}, ${e.x2} ${cy2}, ${e.x2} ${e.y2}`;
                        return (
                            <motion.path
                                key={e.id}
                                initial={e.isNew ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
                                animate={{ pathLength: 1, opacity: 0.7 }}
                                transition={{ duration: 0.6, ease: 'easeInOut', delay: e.isNew ? 0.2 : 0 }}
                                d={path}
                                fill="none"
                                stroke={accent.edgeStroke}
                                strokeWidth={2 / scale}
                                markerEnd={`url(#${markerId})`}
                                className={accent.edgeGlow}
                            />
                        );
                    })}
                </svg>

                <AnimatePresence>
                    {layoutNodes.map(ln => {
                        const { node, x, y } = ln;
                        const isNew = newNodeIds.has(node.id);
                        const isRoot = node.id === data.rootId;

                        return (
                            <motion.div
                                key={node.id}
                                initial={isNew ? { opacity: 0, scale: 0.3 } : false}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.5 }}
                                transition={{
                                    opacity: { duration: 0.4 },
                                    scale: { type: 'spring', stiffness: 200, damping: 15 },
                                }}
                                style={{
                                    position: 'absolute',
                                    left: x,
                                    top: y,
                                    width: NODE_CARD_W,
                                    transition: 'left 0.3s ease, top 0.3s ease',
                                }}
                                className="z-20"
                            >
                                {isRoot && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="absolute -top-8 left-1/2 -translate-x-1/2 bg-green-500 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-[0_0_15px_rgba(74,222,128,0.6)] z-30 whitespace-nowrap"
                                    >
                                        ROOT
                                    </motion.div>
                                )}

                                {(isNew || isRoot) && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: [0, 0.4, 0], scale: [0.9, 1.2, 0.9] }}
                                        transition={{ duration: 1.5, repeat: reduceMotion ? 0 : Infinity }}
                                        className="absolute inset-[-20px] bg-green-500/15 blur-[25px] rounded-full z-[-1]"
                                    />
                                )}

                                <NodeCard
                                    node={node}
                                    pulse={pulse}
                                    width="100%"
                                    restClassName={isNew || isRoot ? 'shadow-[0_0_40px_rgba(74,222,128,0.3)]' : ''}
                                    emptyText="Uninitialized"
                                    tone={{
                                        fieldValue: 'text-accent-cyan',
                                        pointerRow: 'bg-green-500/5',
                                        pointerValue: 'text-green-400 opacity-80 bg-green-500/5',
                                    }}
                                />

                                <NodeLabels
                                    labels={node.labels}
                                    chipClassName="px-1.5 py-0.5 rounded bg-green-500/20 text-[9px] text-green-300 font-mono font-bold"
                                />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default memo(TreeChart);
