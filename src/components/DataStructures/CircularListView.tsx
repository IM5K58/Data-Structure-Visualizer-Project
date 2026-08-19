import { memo, useMemo } from 'react';
import type { CircularState, NodeHighlight } from '../../types';
import ZoomToolbar from './ZoomToolbar';
import { accentFor } from './accents';

/** The wrap-around edge carries a second meaning, not the panel accent. */
const CYCLE_BACK_STROKE = 'rgba(251, 191, 36, 0.9)';
const CYCLE_BACK_GLOW = 'drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useNewIds, usePulse } from '../../hooks/usePulse';
import { usePanZoom } from './usePanZoom';
import { NODE_CARD_W, computeCircularLayout, getCircularOrder, nodeCardHeight } from './layout';
import { NodeCard, NodeLabels } from './NodeCard';

interface Props {
    data: CircularState;
    highlight?: NodeHighlight | null;
}

interface CircularEdge {
    id: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isCycleBack: boolean;
    isNew: boolean;
}

function CircularListView({ data, highlight }: Props) {
    const reduceMotion = useReducedMotion();
    const accent = accentFor('circular');
    // Document-global ids collide when two circular panels render.
    const markerId = `circ-arrow-${data.name}`;
    const markerBackId = `circ-arrow-back-${data.name}`;
    const pulse = usePulse(
        highlight?.nodeId ? { nodeId: highlight.nodeId, property: highlight.property } : null,
        highlight
    );

    const nodeIds = useMemo(() => data.nodes.map(n => n.id), [data.nodes]);
    const newNodeIds = useNewIds(nodeIds, 1000);

    const { nodes: layoutNodes, W: svgW, H: svgH } = useMemo(
        () => computeCircularLayout(data.nodes, data.headId),
        [data.nodes, data.headId]
    );
    const posMap = useMemo(
        () => new Map(layoutNodes.map(ln => [ln.node.id, ln])),
        [layoutNodes]
    );
    const allIds = useMemo(() => new Set(data.nodes.map(n => n.id)), [data.nodes]);
    const order = useMemo(() => getCircularOrder(data.nodes, data.headId), [data.nodes, data.headId]);

    const { containerProps, transformStyle, scale, zoomIn, zoomOut, reset } = usePanZoom({
        transformOrigin: '0 0',
        minScale: 0.3,
        maxScale: 2.5,
        refitKey: layoutNodes,
        getContentBounds: () => {
            if (layoutNodes.length === 0) return null;
            return {
                minX: Math.min(...layoutNodes.map(ln => ln.x)),
                maxX: Math.max(...layoutNodes.map(ln => ln.x)) + NODE_CARD_W,
                minY: Math.min(...layoutNodes.map(ln => ln.y)),
                maxY: Math.max(...layoutNodes.map(ln => ln.y + nodeCardHeight(ln.node))),
            };
        },
    });

    // Build edges following pointer chain
    const edges = useMemo<CircularEdge[]>(() => {
        const result: CircularEdge[] = [];
        const nodeMap = new Map(data.nodes.map(n => [n.id, n]));
        const orderSet = new Set(order);

        for (let i = 0; i < order.length; i++) {
            const fromId = order[i];
            const node = nodeMap.get(fromId);
            if (!node) continue;
            const from = posMap.get(fromId);
            if (!from) continue;

            for (const [, targetId] of Object.entries(node.pointers)) {
                if (!targetId || !allIds.has(targetId)) continue;
                const to = posMap.get(targetId);
                if (!to) continue;

                // cycle-back edge: last node → first node (or back to already-visited)
                const isCycleBack = orderSet.has(targetId) &&
                    order.indexOf(targetId) < order.indexOf(fromId);

                result.push({
                    id: `${fromId}-${targetId}`,
                    x1: from.cx,
                    y1: from.cy,
                    x2: to.cx,
                    y2: to.cy,
                    isCycleBack,
                    isNew: newNodeIds.has(targetId),
                });
            }
        }
        return result;
    }, [newNodeIds, allIds, order, posMap, data.nodes]);

    if (!data.nodes || data.nodes.length === 0) {
        return <div className="p-4 text-text-muted text-xs font-mono">/* Circular List Empty */</div>;
    }

    return (
        <div
            {...containerProps}
            className="flex flex-col items-center w-full min-h-[400px] h-full relative font-mono overflow-hidden select-none bg-black/5 rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-accent-cyan/40"
        >
            <h3 className={`text-xs font-bold ${accent.heading} mb-4 uppercase tracking-widest absolute top-0 left-4 z-20 pointer-events-none p-4`}>
                Circular List
            </h3>

            <ZoomToolbar
                scale={scale}
                onZoomIn={zoomIn}
                onZoomOut={zoomOut}
                onReset={reset}
                tone={accent.heading}
                label="circular list"
            />

            <div
                style={transformStyle}
                className="absolute inset-0"
            >
                {/* SVG Edges */}
                <svg
                    style={{ width: svgW, height: svgH }}
                    className="absolute pointer-events-none z-10 overflow-visible"
                >
                    <defs>
                        <marker id={markerId} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill={accent.edgeArrow} />
                        </marker>
                        <marker id={markerBackId} markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="rgba(251, 191, 36, 0.9)" />
                        </marker>
                    </defs>
                    <AnimatePresence>
                        {edges.map(e => {
                            const dx = e.x2 - e.x1;
                            const dy = e.y2 - e.y1;
                            const mx = (e.x1 + e.x2) / 2;
                            const my = (e.y1 + e.y2) / 2;
                            // Curve outward from center for cycle-back, inward for normal
                            const curvature = e.isCycleBack ? 1.4 : 0.3;
                            const cx1 = mx - dy * curvature;
                            const cy1 = my + dx * curvature;
                            const path = `M ${e.x1} ${e.y1} Q ${cx1} ${cy1} ${e.x2} ${e.y2}`;

                            return (
                                <motion.path
                                    key={e.id}
                                    initial={e.isNew ? { pathLength: 0, opacity: 0 } : { pathLength: 1, opacity: 1 }}
                                    animate={{ pathLength: 1, opacity: e.isCycleBack ? 0.85 : 0.7 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.6, ease: 'easeInOut', delay: e.isNew ? 0.2 : 0 }}
                                    d={path}
                                    fill="none"
                                    stroke={e.isCycleBack ? CYCLE_BACK_STROKE : accent.edgeStroke}
                                    strokeWidth={2 / scale}
                                    strokeDasharray={e.isCycleBack ? `${6 / scale} ${3 / scale}` : undefined}
                                    markerEnd={`url(#${e.isCycleBack ? markerBackId : markerId})`}
                                    className={e.isCycleBack ? CYCLE_BACK_GLOW : accent.edgeGlow}
                                />
                            );
                        })}
                    </AnimatePresence>
                </svg>

                {/* Nodes */}
                <AnimatePresence>
                    {layoutNodes.map(ln => {
                        const { node, x, y } = ln;
                        const isNew = newNodeIds.has(node.id);
                        const isHead = node.id === data.headId;

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
                                    transition: 'left 0.4s ease, top 0.4s ease',
                                }}
                                className="z-20"
                            >
                                {isHead && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="absolute -top-8 left-1/2 -translate-x-1/2 bg-amber-500 px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-[0_0_15px_rgba(251,191,36,0.6)] z-30 whitespace-nowrap"
                                    >
                                        HEAD
                                    </motion.div>
                                )}

                                {(isNew || isHead) && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: [0, 0.35, 0], scale: [0.9, 1.2, 0.9] }}
                                        transition={{ duration: 1.5, repeat: reduceMotion ? 0 : Infinity }}
                                        className="absolute inset-[-20px] bg-amber-500/15 blur-[25px] rounded-full z-[-1]"
                                    />
                                )}

                                <NodeCard
                                    node={node}
                                    pulse={pulse}
                                    width="100%"
                                    restClassName={isNew || isHead ? 'shadow-[0_0_40px_rgba(251,191,36,0.3)]' : ''}
                                    emptyText="Uninitialized"
                                    tone={{
                                        fieldValue: 'text-accent-cyan',
                                        pointerRow: 'bg-amber-500/5',
                                        pointerValue: 'text-amber-400 opacity-80 bg-amber-500/5',
                                    }}
                                />

                                <NodeLabels
                                    labels={node.labels}
                                    chipClassName="px-1.5 py-0.5 rounded bg-amber-500/20 text-[9px] text-amber-300 font-mono font-bold"
                                />
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default memo(CircularListView);
