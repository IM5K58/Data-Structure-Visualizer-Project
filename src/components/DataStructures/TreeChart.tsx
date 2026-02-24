import { motion, AnimatePresence } from 'framer-motion';
import type { TreeState, TreeNode } from '../../types';

interface Props {
    data: TreeState;
}

const LEVEL_HEIGHT = 80;
const NODE_SIZE = 40;

const TreeChart = ({ data }: Props) => {
    if (!data.root) {
        return (
            <div className="flex flex-col items-center">
                <span className="text-xs font-bold text-accent-purple uppercase tracking-widest mb-4">
                    {data.name} (Tree)
                </span>
                <div className="text-text-muted text-xs italic">Empty Tree</div>
            </div>
        );
    }

    const nodes: { node: TreeNode; depth: number; x: number; y: number }[] = [];
    const walk = (node: TreeNode, depth: number, x: number, offset: number) => {
        nodes.push({ node, depth, x, y: depth * LEVEL_HEIGHT });
        if (node.left) walk(node.left, depth + 1, x - offset, offset / 2);
        if (node.right) walk(node.right, depth + 1, x + offset, offset / 2);
    };

    // x is the relative offset from center
    walk(data.root, 0, 0, 120);

    return (
        <div className="flex flex-col items-center w-full min-h-[400px] relative">
            <span className="text-xs font-bold text-accent-purple uppercase tracking-widest mb-4">
                {data.name} (Tree)
            </span>

            <div className="relative w-full flex-1 mt-10 h-[350px]">
                {/* 
                    Origin Wrapper: Everything inside is relative to the center of the container.
                    We use left: 50% and top: 0. 
                */}
                <div className="absolute top-0 left-1/2 w-0 h-0 overflow-visible">
                    {/* SVG for Branches */}
                    <svg
                        className="absolute overflow-visible pointer-events-none"
                        style={{ width: '1px', height: '1px' }} // Tiny anchor
                    >
                        <AnimatePresence>
                            {nodes.map(({ node, x, y }) => {
                                const connections = [];
                                if (node.left) {
                                    const leftChild = nodes.find(n => n.node.id === node.left!.id);
                                    if (leftChild) {
                                        connections.push(
                                            <motion.line
                                                key={`line-${node.id}-${node.left.id}`}
                                                initial={{ pathLength: 0, opacity: 0 }}
                                                animate={{ pathLength: 1, opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                x1={x} y1={y + NODE_SIZE / 2}
                                                x2={leftChild.x} y2={leftChild.y + NODE_SIZE / 2}
                                                stroke="currentColor"
                                                className="text-accent-purple/40"
                                                strokeWidth="2.5"
                                            />
                                        );
                                    }
                                }
                                if (node.right) {
                                    const rightChild = nodes.find(n => n.node.id === node.right!.id);
                                    if (rightChild) {
                                        connections.push(
                                            <motion.line
                                                key={`line-${node.id}-${node.right.id}`}
                                                initial={{ pathLength: 0, opacity: 0 }}
                                                animate={{ pathLength: 1, opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                x1={x} y1={y + NODE_SIZE / 2}
                                                x2={rightChild.x} y2={rightChild.y + NODE_SIZE / 2}
                                                stroke="currentColor"
                                                className="text-accent-purple/40"
                                                strokeWidth="2.5"
                                            />
                                        );
                                    }
                                }
                                return connections;
                            })}
                        </AnimatePresence>
                    </svg>

                    {/* Nodes Container */}
                    <AnimatePresence>
                        {nodes.map(({ node, x, y }) => (
                            <motion.div
                                key={node.id}
                                initial={{ scale: 0, opacity: 0, x: x - NODE_SIZE / 2, y }}
                                animate={{ scale: 1, opacity: 1, x: x - NODE_SIZE / 2, y }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                                className="absolute flex items-center justify-center rounded-full bg-gradient-to-br from-accent-purple to-accent-purple/80 border border-white/30 shadow-[0_0_15px_rgba(168,85,247,0.4)] pointer-events-auto"
                                style={{
                                    width: NODE_SIZE,
                                    height: NODE_SIZE,
                                    top: 0,
                                    left: 0
                                }}
                            >
                                <span className="text-white text-[11px] font-bold">{node.value}</span>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default TreeChart;
