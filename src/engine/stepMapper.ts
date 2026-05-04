import type { Command, CommandType, TargetType } from '../types';
import type { TraceStep } from '../api/compilerApi';

/**
 * Converts TraceSteps from the backend into frontend Visualizer Commands.
 * Maintains a mapping of variable scopes to their current memory addresses.
 */
export function mapTraceToCommands(steps: TraceStep[]): Command[] {
    const commands: Command[] = [];
    const varToAddr = new Map<string, string>();
    // varToTarget is only used for stack/queue distinction in instrumenter mode (PUSH/POP)
    const varToTarget = new Map<string, TargetType>();

    for (const step of steps) {
        const raw = step.raw || `Step ${step.step} at line ${step.line}`;
        const line = step.line || undefined;

        switch (step.type) {
            case 'ALLOC': {
                if (step.var && step.addr) {
                    varToAddr.set(step.var, step.addr);
                    // Track container hints for PUSH/POP/MAP_SET routing.
                    if (step.hint === 'stack') varToTarget.set(step.var, 'stack');
                    else if (step.hint === 'queue') varToTarget.set(step.var, 'queue');
                    else if (step.hint === 'heap') varToTarget.set(step.var, 'heap');
                    else if (step.hint === 'hashmap') varToTarget.set(step.var, 'hashmap');
                    else if (step.hint === 'unionfind') varToTarget.set(step.var, 'unionfind');
                }

                // Container structs are populated via PUSH / MAP_SET / UF_* commands;
                // skip creating a memory node for the container itself.
                if (step.hint === 'stack' || step.hint === 'queue' || step.hint === 'heap' || step.hint === 'hashmap' || step.hint === 'unionfind') {
                    break;
                }

                // All pointer-based nodes start as 'memory'.
                // analyzeAndReclassify() will determine the real type (tree/circular/linked list)
                // from the actual runtime pointer graph topology.
                commands.push({
                    type: 'ALLOCATE_NODE',
                    target: 'memory',
                    targetName: 'Heap',
                    nodeId: step.addr,
                    structType: step.struct,
                    label: step.var,
                    raw,
                    line,
                });
                break;
            }

            case 'DELETE': {
                let nodeId = step.addr;
                if (!nodeId && step.var) {
                    nodeId = varToAddr.get(step.var);
                }

                if (nodeId) {
                    commands.push({
                        type: 'DELETE_NODE',
                        target: 'memory',
                        targetName: 'Heap',
                        nodeId,
                        raw,
                        line,
                    });
                }
                break;
            }

            case 'SET_FIELD': {
                const nodeId = step.source && step.source !== '0'
                    ? step.source
                    : (step.var ? varToAddr.get(step.var) : undefined);

                if (nodeId) {
                    commands.push({
                        type: 'SET_FIELD',
                        target: 'memory',
                        targetName: 'Heap',
                        nodeId,
                        property: step.field,
                        value: step.value,
                        raw,
                        line,
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
                    commands.push({
                        type: 'SET_LABEL',
                        target: 'memory',
                        targetName: 'Heap',
                        nodeId: step.target || undefined,
                        label: step.field,
                        raw,
                        line,
                    });
                } else {
                    // A pointer field inside a struct is being updated
                    const nodeId = step.source && step.source !== '0'
                        ? step.source
                        : (step.var ? varToAddr.get(step.var) : undefined);

                    if (nodeId) {
                        const isNull = !step.target || step.target === '0';
                        commands.push({
                            type: 'SET_POINTER',
                            target: 'memory',
                            targetName: 'Heap',
                            nodeId,
                            property: step.field,
                            pointerTo: isNull ? null : step.target,
                            label: step.var === '__scope' ? undefined : step.var,
                            raw,
                            line,
                        });
                    }
                }
                break;
            }

            case 'PUSH': {
                const target = varToTarget.get(step.var || '') ?? 'stack';
                const cmdType: CommandType = target === 'queue' ? 'ENQUEUE' : 'PUSH';

                commands.push({
                    type: cmdType,
                    target,
                    targetName: step.var || 'default',
                    value: step.value,
                    raw,
                    line,
                });
                break;
            }

            case 'POP': {
                const target = varToTarget.get(step.var || '') ?? 'stack';
                const cmdType: CommandType = target === 'queue' ? 'DEQUEUE' : 'POP';

                commands.push({
                    type: cmdType,
                    target,
                    targetName: step.var || 'default',
                    raw,
                    line,
                });
                break;
            }

            case 'MAP_SET': {
                const target: TargetType = varToTarget.get(step.var || '') ?? 'hashmap';
                commands.push({
                    type: 'MAP_SET',
                    target,
                    targetName: step.var || 'map',
                    property: step.key,
                    value: step.value,
                    raw,
                    line,
                });
                break;
            }

            case 'MAP_REMOVE': {
                const target: TargetType = varToTarget.get(step.var || '') ?? 'hashmap';
                commands.push({
                    type: 'MAP_REMOVE',
                    target,
                    targetName: step.var || 'map',
                    property: step.key,
                    raw,
                    line,
                });
                break;
            }

            case 'UF_UNION': {
                const target: TargetType = varToTarget.get(step.var || '') ?? 'unionfind';
                commands.push({
                    type: 'UF_UNION',
                    target,
                    targetName: step.var || 'uf',
                    label: step.field,    // a
                    pointerTo: step.arg2, // b
                    raw,
                    line,
                });
                break;
            }

            case 'UF_FIND': {
                const target: TargetType = varToTarget.get(step.var || '') ?? 'unionfind';
                commands.push({
                    type: 'UF_FIND',
                    target,
                    targetName: step.var || 'uf',
                    label: step.field,    // x
                    raw,
                    line,
                });
                break;
            }

            case 'LOCAL_VAR': {
                // Primitive local variable changed — used by LocalVarsPanel
                commands.push({
                    type: 'LOCAL_VAR_UPDATE',
                    target: 'memory',
                    targetName: 'locals',
                    label: step.var,        // variable name
                    value: step.value,      // new value (as string from GDB)
                    property: step.target as string, // C++ type (reused field)
                    raw,
                    line,
                });
                break;
            }

            case 'LINE': {
                // A marker for the current executing line, could be ignored or used to just update raw representation
                break;
            }

            case 'STACK_FRAMES': {
                commands.push({
                    type: 'STACK_FRAMES',
                    target: 'memory',
                    targetName: 'callstack',
                    frames: step.frames ?? [],
                    raw,
                    line,
                });
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
 * graph properties to detect the real data structure type.
 *
 * Decision pipeline:
 *   1. Build per-field directed edges (final state, ignoring pointer reassignments).
 *   2. Detect bidirectional pairs (a→b ∧ b→a) — these encode prev/parent links.
 *   3. Strip one direction of each bidirectional pair to get the "primary" graph.
 *      Heuristic: keep the field whose subgraph has the smaller max-out-degree,
 *      i.e., is more chain-like; the other direction is treated as the back-edge.
 *   4. Re-run topology analysis on the primary graph:
 *        primary acyclic, max-out-deg ≥ 2, depth > 1 → Tree (with optional parent ptr)
 *        primary acyclic, max-out-deg ≤ 1, has bidir pairs        → Doubly Linked List
 *        primary acyclic, max-out-deg ≤ 1, no bidir pairs         → Linked List (memory)
 *        primary cyclic,  max-out-deg ≤ 1                          → Circular Linked List
 *        primary cyclic,  max-out-deg ≥ 2                          → General Graph
 */
function analyzeAndReclassify(commands: Command[]): Command[] {
    // Collect all allocated node IDs that went to 'memory' target
    const memoryNodeIds = new Set<string>();
    const nodeStructTypes = new Map<string, string>();

    for (const cmd of commands) {
        if (cmd.type === 'ALLOCATE_NODE' && cmd.target === 'memory' && cmd.nodeId) {
            memoryNodeIds.add(cmd.nodeId);
            if (cmd.structType) nodeStructTypes.set(cmd.nodeId, cmd.structType);
        }
        if (cmd.type === 'DELETE_NODE' && cmd.target === 'memory' && cmd.nodeId) {
            memoryNodeIds.delete(cmd.nodeId);
        }
    }

    if (memoryNodeIds.size < 2) return commands;

    // Per-field edges (last assignment wins): nodeId → fieldName → targetId
    const fieldEdges = new Map<string, Map<string, string>>();
    for (const cmd of commands) {
        if (cmd.type === 'SET_POINTER' && cmd.target === 'memory' && cmd.nodeId && cmd.property) {
            if (!fieldEdges.has(cmd.nodeId)) fieldEdges.set(cmd.nodeId, new Map());
            fieldEdges.get(cmd.nodeId)!.set(cmd.property, cmd.pointerTo ?? '');
        }
    }

    // Build per-field directed graphs: fieldName → (src → set<tgt>)
    const fieldGraphs = new Map<string, Map<string, Set<string>>>();
    for (const [src, fields] of fieldEdges) {
        if (!memoryNodeIds.has(src)) continue;
        for (const [field, tgt] of fields) {
            if (!tgt || !memoryNodeIds.has(tgt)) continue;
            if (!fieldGraphs.has(field)) fieldGraphs.set(field, new Map());
            const g = fieldGraphs.get(field)!;
            if (!g.has(src)) g.set(src, new Set());
            g.get(src)!.add(tgt);
        }
    }

    // Combined directed graph (all fields)
    const fullOut = new Map<string, Set<string>>();
    for (const id of memoryNodeIds) fullOut.set(id, new Set());
    for (const [, g] of fieldGraphs) {
        for (const [src, tgts] of g) {
            for (const t of tgts) fullOut.get(src)!.add(t);
        }
    }

    // ── Bidirectional-pair detection ──
    // For each ordered edge (u,v), if (v,u) also exists in the full graph, mark it.
    // We pick a "back-edge field" by counting per-field reverse-pair occurrences:
    // the field that participates in the most bidirectional pairs is treated as the
    // back-pointer and stripped from the primary graph.
    const bidirPairs = new Set<string>(); // canonical "min|max"
    for (const [u, tgts] of fullOut) {
        for (const v of tgts) {
            if (fullOut.get(v)?.has(u)) {
                const key = u < v ? `${u}|${v}` : `${v}|${u}`;
                bidirPairs.add(key);
            }
        }
    }

    // Per-field count of edges that participate in a bidirectional pair
    const fieldBidirCount = new Map<string, number>();
    for (const [field, g] of fieldGraphs) {
        let c = 0;
        for (const [src, tgts] of g) {
            for (const t of tgts) {
                if (fullOut.get(t)?.has(src)) c++;
            }
        }
        fieldBidirCount.set(field, c);
    }

    // Identify "back-edge" fields: every edge of this field is half of a bidir pair,
    // AND there's another field that also participates in those same pairs.
    const backFields = new Set<string>();
    if (bidirPairs.size > 0 && fieldGraphs.size >= 2) {
        // Sort fields by bidir count desc; the most bidir-saturated field becomes the back-field,
        // but only if all its edges are bidirectional (otherwise it carries unique info).
        const sorted = [...fieldGraphs.keys()].sort(
            (a, b) => (fieldBidirCount.get(b) ?? 0) - (fieldBidirCount.get(a) ?? 0)
        );
        for (const f of sorted) {
            const g = fieldGraphs.get(f)!;
            let total = 0;
            for (const [, tgts] of g) total += tgts.size;
            const bidir = fieldBidirCount.get(f) ?? 0;
            // Strip a field only if every one of its edges is part of a bidir pair.
            if (total > 0 && total === bidir) {
                backFields.add(f);
                // Stop after stripping enough fields to break all bidir pairs.
                // (For typical cases — doubly LL, parent-pointer tree — one back-field suffices.)
                break;
            }
        }
    }

    // ── Build primary graph (full minus back-field edges) ──
    const primaryOut = new Map<string, Set<string>>();
    const primaryIn = new Map<string, number>();
    for (const id of memoryNodeIds) {
        primaryOut.set(id, new Set());
        primaryIn.set(id, 0);
    }
    for (const [field, g] of fieldGraphs) {
        if (backFields.has(field)) continue;
        for (const [src, tgts] of g) {
            for (const t of tgts) {
                if (primaryOut.get(src)!.has(t)) continue;
                primaryOut.get(src)!.add(t);
                primaryIn.set(t, (primaryIn.get(t) || 0) + 1);
            }
        }
    }

    // ── Topology of primary graph ──
    let maxOutDegree = 0;
    for (const [, edges] of primaryOut) {
        if (edges.size > maxOutDegree) maxOutDegree = edges.size;
    }
    const hasCycles = detectCycles(primaryOut, memoryNodeIds);

    // Roots = nodes with in-degree 0 in primary graph
    const roots: string[] = [];
    for (const id of memoryNodeIds) {
        if ((primaryIn.get(id) || 0) === 0) roots.push(id);
    }

    let maxDepth = 0;
    if (roots.length > 0 && !hasCycles) {
        maxDepth = computeMaxDepth(roots[0], primaryOut, memoryNodeIds);
    }

    // ── Decision ──
    let detectedTarget: TargetType | null = null;

    if (hasCycles && maxOutDegree >= 2) {
        detectedTarget = 'graph';
    } else if (hasCycles && maxOutDegree <= 1) {
        detectedTarget = 'circular';
    } else if (!hasCycles && maxOutDegree >= 2 && maxDepth > 1) {
        detectedTarget = 'tree';
    } else if (!hasCycles && maxOutDegree <= 1 && backFields.size > 0) {
        // Single-link chain with back-pointers along it = doubly linked list
        detectedTarget = 'doubly';
    }
    // else: linear chain w/o back-pointers → leave as 'memory' (linked list view)

    if (!detectedTarget) return commands;

    const targetName =
        detectedTarget === 'tree' ? 'Tree' :
        detectedTarget === 'circular' ? 'Circular' :
        detectedTarget === 'doubly' ? 'DoublyList' :
        detectedTarget === 'graph' ? 'Graph' : 'Heap';

    // Reclassify commands of the same struct type(s) as the memory nodes
    const structTypesToReclassify = new Set<string>();
    for (const id of memoryNodeIds) {
        const st = nodeStructTypes.get(id);
        if (st) structTypesToReclassify.add(st);
    }

    return commands.map(cmd => {
        if (cmd.target !== 'memory') return cmd;
        const nodeStructType = cmd.nodeId ? nodeStructTypes.get(cmd.nodeId) : undefined;
        if (nodeStructType && structTypesToReclassify.has(nodeStructType)) {
            return { ...cmd, target: detectedTarget!, targetName };
        }
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
