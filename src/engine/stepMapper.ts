import type { Command, CommandType, TargetType } from '../types';
import type { TraceStep } from '../api/compilerApi';

/**
 * Converts TraceSteps from the backend into frontend Visualizer Commands.
 * Maintains a mapping of variable scopes to their current memory addresses.
 */
export function mapTraceToCommands(steps: TraceStep[]): Command[] {
    const commands: Command[] = [];
    const varToAddr = new Map<string, string>();
    const varToTarget = new Map<string, TargetType>();
    const addrToTarget = new Map<string, TargetType>();

    /** Resolve target type and name for a node address */
    function resolveNodeTarget(addr: string | undefined, varName: string | undefined): { target: TargetType; targetName: string } {
        if (addr && addrToTarget.get(addr) === 'tree') return { target: 'tree', targetName: 'Tree' };
        if (varName && varToTarget.get(varName) === 'tree') return { target: 'tree', targetName: 'Tree' };
        if (addr && addrToTarget.get(addr) === 'circular') return { target: 'circular', targetName: 'Circular' };
        if (varName && varToTarget.get(varName) === 'circular') return { target: 'circular', targetName: 'Circular' };
        return { target: 'memory', targetName: 'Heap' };
    }

    for (const step of steps) {
        const raw = step.raw || `Step ${step.step} at line ${step.line}`;

        switch (step.type) {
            case 'ALLOC': {
                // ALLOC gives us the mapping between the variable name and its new memory address
                if (step.var && step.addr) {
                    varToAddr.set(step.var, step.addr);
                    if (step.hint === 'stack') varToTarget.set(step.var, 'stack');
                    else if (step.hint === 'queue') varToTarget.set(step.var, 'queue');
                    else if (step.hint === 'tree') varToTarget.set(step.var, 'tree');
                    else if (step.hint === 'circular') varToTarget.set(step.var, 'circular');
                    else varToTarget.set(step.var, 'memory');
                }

                // Stack/Queue items are added via PUSH/ENQUEUE commands,
                // so skip creating a memory node for the container struct itself
                if (step.hint === 'stack' || step.hint === 'queue') {
                    break;
                }

                // Track address→target mapping for tree/circular nodes
                const isTree = step.hint === 'tree';
                const isCircular = step.hint === 'circular';
                if (step.addr && isTree) addrToTarget.set(step.addr, 'tree');
                if (step.addr && isCircular) addrToTarget.set(step.addr, 'circular');
                const target: TargetType = isTree ? 'tree' : isCircular ? 'circular' : 'memory';
                const targetName = isTree ? 'Tree' : isCircular ? 'Circular' : 'Heap';

                commands.push({
                    type: 'ALLOCATE_NODE',
                    target,
                    targetName,
                    nodeId: step.addr,
                    structType: step.struct,
                    label: step.var,
                    raw,
                });
                break;
            }

            case 'DELETE': {
                let nodeId = step.addr;
                if (!nodeId && step.var) {
                    nodeId = varToAddr.get(step.var);
                }

                if (nodeId) {
                    const { target, targetName } = resolveNodeTarget(nodeId, step.var);
                    commands.push({
                        type: 'DELETE_NODE',
                        target,
                        targetName,
                        nodeId,
                        raw,
                    });
                }
                break;
            }

            case 'SET_FIELD': {
                const nodeId = step.source && step.source !== '0'
                    ? step.source
                    : (step.var ? varToAddr.get(step.var) : undefined);

                if (nodeId) {
                    const { target, targetName } = resolveNodeTarget(nodeId, step.var);
                    commands.push({
                        type: 'SET_FIELD',
                        target,
                        targetName,
                        nodeId,
                        property: step.field,
                        value: step.value,
                        raw,
                    });
                }
                break;
            }

            case 'SET_PTR': {
                if (step.var === '__scope' && step.field) {
                    // Update variable tracking map when a pointer variable is reassigned
                    if (step.target) {
                        varToAddr.set(step.field, step.target);
                    } else {
                        varToAddr.delete(step.field);
                    }
                    const { target, targetName } = resolveNodeTarget(step.target, step.field);
                    commands.push({
                        type: 'SET_LABEL',
                        target,
                        targetName,
                        nodeId: step.target || undefined,
                        label: step.field,
                        raw,
                    });
                } else {
                    // A pointer field inside a struct is being updated
                    const nodeId = step.source && step.source !== '0'
                        ? step.source
                        : (step.var ? varToAddr.get(step.var) : undefined);

                    if (nodeId) {
                        const { target, targetName } = resolveNodeTarget(nodeId, step.var);
                        // In C++, NULL pointer is 0 (or some default value), we map '0' to null
                        const isNull = !step.target || step.target === '0';
                        commands.push({
                            type: 'SET_POINTER',
                            target,
                            targetName,
                            nodeId,
                            property: step.field,
                            pointerTo: isNull ? null : step.target,
                            label: step.var === '__scope' ? undefined : step.var,
                            raw,
                        });
                    }
                }
                break;
            }

            case 'PUSH': {
                let target = varToTarget.get(step.var || '');
                if (!target) {
                    target = 'stack'; // ALLOC 힌트가 없으면 기본값 stack
                }
                const cmdType: CommandType = target === 'queue' ? 'ENQUEUE' : 'PUSH';

                commands.push({
                    type: cmdType,
                    target,
                    targetName: step.var || 'default',
                    value: step.value,
                    raw,
                });
                break;
            }

            case 'POP': {
                let target = varToTarget.get(step.var || '');
                if (!target) {
                    target = 'stack'; // ALLOC 힌트가 없으면 기본값 stack
                }
                const cmdType: CommandType = target === 'queue' ? 'DEQUEUE' : 'POP';

                commands.push({
                    type: cmdType,
                    target,
                    targetName: step.var || 'default',
                    raw,
                });
                break;
            }

            case 'LINE': {
                // A marker for the current executing line, could be ignored or used to just update raw representation
                break;
            }

            default: {
                console.warn(`Unknown trace step type: ${step.type}`);
            }
        }

        // Attach output to the last added command if available
        if (step.output && commands.length > 0) {
            commands[commands.length - 1].output = step.output;
        }
    }

    // Runtime pattern analysis: reclassify memory nodes based on actual pointer graph
    return analyzeAndReclassify(commands);
}

/**
 * Runtime Pattern Analysis Engine
 *
 * Builds a pointer graph from actual SET_POINTER commands and analyzes
 * graph properties to detect the real data structure type:
 * - Linear chain (max out-degree 1, no cycles) → LinkedList (memory)
 * - Branching, acyclic (max out-degree ≥ 2, no cycles) → Tree
 * - Has PUSH/POP only → Stack (already handled by hints)
 * - Has ENQUEUE/DEQUEUE only → Queue (already handled by hints)
 *
 * This overrides the static hint-based classification when the runtime
 * evidence is strong enough.
 */
function analyzeAndReclassify(commands: Command[]): Command[] {
    // Collect all allocated node IDs that went to 'memory' target
    const memoryNodeIds = new Set<string>();
    // Track pointer relationships: nodeId → Set of target nodeIds
    const outEdges = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();
    // Track which struct types are memory-allocated
    const nodeStructTypes = new Map<string, string>();

    for (const cmd of commands) {
        if (cmd.type === 'ALLOCATE_NODE' && (cmd.target === 'memory' || cmd.target === 'circular') && cmd.nodeId) {
            memoryNodeIds.add(cmd.nodeId);
            outEdges.set(cmd.nodeId, new Set());
            inDegree.set(cmd.nodeId, 0);
            if (cmd.structType) nodeStructTypes.set(cmd.nodeId, cmd.structType);
        }
        if (cmd.type === 'DELETE_NODE' && (cmd.target === 'memory' || cmd.target === 'circular') && cmd.nodeId) {
            memoryNodeIds.delete(cmd.nodeId);
        }
    }

    // If no memory nodes, nothing to reclassify
    if (memoryNodeIds.size < 2) return commands;

    // Build pointer graph from SET_POINTER commands on memory nodes.
    // Track per-field last assignment to avoid stale edges from pointer reassignments.
    const fieldEdges = new Map<string, Map<string, string>>();
    for (const cmd of commands) {
        if (cmd.type === 'SET_POINTER' && (cmd.target === 'memory' || cmd.target === 'circular') && cmd.nodeId && cmd.property) {
            if (!fieldEdges.has(cmd.nodeId)) fieldEdges.set(cmd.nodeId, new Map());
            fieldEdges.get(cmd.nodeId)!.set(cmd.property, cmd.pointerTo ?? '');
        }
    }
    // Reconstruct outEdges/inDegree from final field state only
    for (const [nodeId, fields] of fieldEdges) {
        if (!memoryNodeIds.has(nodeId)) continue;
        for (const [, target] of fields) {
            if (target && memoryNodeIds.has(target)) {
                outEdges.get(nodeId)?.add(target);
                inDegree.set(target, (inDegree.get(target) || 0) + 1);
            }
        }
    }

    // Analyze graph properties
    let maxOutDegree = 0;
    let totalNodes = 0;

    for (const [nodeId, edges] of outEdges) {
        if (!memoryNodeIds.has(nodeId)) continue;
        totalNodes++;
        if (edges.size > maxOutDegree) maxOutDegree = edges.size;
    }

    // Detect cycles using DFS
    const hasCycles = detectCycles(outEdges, memoryNodeIds);

    // Find root candidates (nodes with in-degree 0)
    const roots: string[] = [];
    for (const nodeId of memoryNodeIds) {
        if ((inDegree.get(nodeId) || 0) === 0) {
            roots.push(nodeId);
        }
    }

    // Compute tree depth from root
    let maxDepth = 0;
    if (roots.length > 0 && !hasCycles) {
        maxDepth = computeMaxDepth(roots[0], outEdges, memoryNodeIds);
    }

    // Decision logic
    let detectedTarget: TargetType | null = null;

    if (hasCycles && maxOutDegree <= 1) {
        // Single-link chain forming a loop → circular linked list
        detectedTarget = 'circular';
    } else if (maxOutDegree >= 2 && !hasCycles && maxDepth > 1) {
        // Branching, acyclic, depth > 1 → Tree
        detectedTarget = 'tree';
    }
    // Linear chains (maxOutDegree <= 1, no cycles) stay as 'memory' (linked list visualization)

    // Apply reclassification if needed
    if (!detectedTarget) return commands;

    const targetName = detectedTarget === 'tree' ? 'Tree' : detectedTarget === 'circular' ? 'Circular' : 'Heap';

    // Group by struct type — only reclassify nodes of the same struct type
    const structTypesToReclassify = new Set<string>();
    for (const nodeId of memoryNodeIds) {
        const st = nodeStructTypes.get(nodeId);
        if (st) structTypesToReclassify.add(st);
    }

    return commands.map(cmd => {
        if (cmd.target !== 'memory') return cmd;
        // Only reclassify commands that reference memory nodes of the detected struct types
        const nodeStructType = cmd.nodeId ? nodeStructTypes.get(cmd.nodeId) : undefined;
        if (nodeStructType && structTypesToReclassify.has(nodeStructType)) {
            return { ...cmd, target: detectedTarget!, targetName };
        }
        // For SET_LABEL commands that reference memory nodes
        if (cmd.type === 'SET_LABEL' && cmd.nodeId && memoryNodeIds.has(cmd.nodeId)) {
            return { ...cmd, target: detectedTarget!, targetName };
        }
        return cmd;
    });
}

/** DFS-based cycle detection */
function detectCycles(outEdges: Map<string, Set<string>>, validNodes: Set<string>): boolean {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map<string, number>();
    for (const n of validNodes) color.set(n, WHITE);

    function dfs(node: string): boolean {
        color.set(node, GRAY);
        const neighbors = outEdges.get(node);
        if (neighbors) {
            for (const next of neighbors) {
                if (!validNodes.has(next)) continue;
                const c = color.get(next);
                if (c === GRAY) return true; // back edge = cycle
                if (c === WHITE && dfs(next)) return true;
            }
        }
        color.set(node, BLACK);
        return false;
    }

    for (const node of validNodes) {
        if (color.get(node) === WHITE) {
            if (dfs(node)) return true;
        }
    }
    return false;
}

/** Compute max depth from a root node via BFS */
function computeMaxDepth(root: string, outEdges: Map<string, Set<string>>, validNodes: Set<string>): number {
    const visited = new Set<string>();
    const queue: { node: string; depth: number }[] = [{ node: root, depth: 1 }];
    visited.add(root);
    let maxDepth = 1;

    while (queue.length > 0) {
        const { node, depth } = queue.shift()!;
        if (depth > maxDepth) maxDepth = depth;

        const neighbors = outEdges.get(node);
        if (neighbors) {
            for (const next of neighbors) {
                if (validNodes.has(next) && !visited.has(next)) {
                    visited.add(next);
                    queue.push({ node: next, depth: depth + 1 });
                }
            }
        }
    }

    return maxDepth;
}
