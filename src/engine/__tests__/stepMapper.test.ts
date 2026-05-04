import { describe, it, expect } from 'vitest';
import { mapTraceToCommands } from '../stepMapper';
import type { TraceStep } from '../../api/compilerApi';
import type { Command, TargetType } from '../../types';

// ─── Helpers ───────────────────────────────────────────────────────────────

let stepCounter = 0;
function mkStep(partial: Omit<TraceStep, 'step' | 'line'> & { line?: number }): TraceStep {
    return { line: 1, ...partial, step: stepCounter++ };
}

function alloc(addr: string, struct = 'Node', vName?: string, hint: TraceStep['hint'] = 'node'): TraceStep {
    return mkStep({ type: 'ALLOC', addr, struct, var: vName, hint });
}

function setPtr(source: string, field: string, target: string | undefined): TraceStep {
    return mkStep({ type: 'SET_PTR', source, field, target });
}

/** Reset the global step counter so tests are isolated. */
function reset() { stepCounter = 0; }

/**
 * Read the final classification target for the heap-allocated nodes.
 * Looks at any node-bearing command and returns its `target`.
 */
function detectedTarget(commands: Command[]): TargetType | null {
    for (const cmd of commands) {
        if (cmd.type === 'ALLOCATE_NODE' && cmd.nodeId) return cmd.target;
    }
    return null;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe('mapTraceToCommands — runtime topology classification', () => {
    it('singly linked chain → memory (linked list)', () => {
        reset();
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            alloc('0x300'),
            setPtr('0x100', 'next', '0x200'),
            setPtr('0x200', 'next', '0x300'),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('memory');
    });

    it('chain with cycle (a→b→c→a) → circular', () => {
        reset();
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            alloc('0x300'),
            setPtr('0x100', 'next', '0x200'),
            setPtr('0x200', 'next', '0x300'),
            setPtr('0x300', 'next', '0x100'),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('circular');
    });

    it('branching acyclic (tree with two children) → tree', () => {
        reset();
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            alloc('0x300'),
            alloc('0x400'),
            setPtr('0x100', 'left',  '0x200'),
            setPtr('0x100', 'right', '0x300'),
            setPtr('0x200', 'left',  '0x400'),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('tree');
    });

    it('parent-pointer tree (left/right + parent back-edges) → tree', () => {
        reset();
        // root --left--> a, root --right--> b
        // a.parent = root, b.parent = root  (these create 2-cycles)
        // Expected: classification recognizes "parent" as the back-edge field
        // and re-runs topology on left/right only → branching, acyclic → tree.
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            alloc('0x300'),
            setPtr('0x100', 'left',   '0x200'),
            setPtr('0x100', 'right',  '0x300'),
            setPtr('0x200', 'parent', '0x100'),
            setPtr('0x300', 'parent', '0x100'),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('tree');
    });

    it('doubly linked list (next/prev along a chain) → doubly', () => {
        reset();
        // a <-> b <-> c via next/prev
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            alloc('0x300'),
            setPtr('0x100', 'next', '0x200'),
            setPtr('0x200', 'next', '0x300'),
            setPtr('0x200', 'prev', '0x100'),
            setPtr('0x300', 'prev', '0x200'),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('doubly');
    });

    it('general graph (branching + cycle that survives back-edge stripping) → graph', () => {
        reset();
        // Edges:
        //   a --p1--> b         (forward)
        //   a --p2--> c         (branching from a)
        //   b --p1--> c         (chain)
        //   c --p1--> b         (back-edge that pairs with b→c via the SAME field)
        //
        // Why this stays 'graph': field 'p1' has 3 edges (a→b, b→c, c→b) but only 2
        // are bidirectional (b↔c), so 'p1' is NOT fully back-edge and is kept.
        // Field 'p2' has 1 edge (a→c) and 0 bidir → also kept. Nothing gets stripped,
        // primary == full graph, which is cyclic AND has out-degree 2 at node 'a'.
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            alloc('0x300'),
            setPtr('0x100', 'p1', '0x200'),
            setPtr('0x100', 'p2', '0x300'),
            setPtr('0x200', 'p1', '0x300'),
            setPtr('0x300', 'p1', '0x200'),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('graph');
    });

    it('single allocated node with no edges → memory (default, no reclassification)', () => {
        reset();
        const steps: TraceStep[] = [alloc('0x100')];
        const cmds = mapTraceToCommands(steps);
        // < 2 nodes → analyzeAndReclassify bails out, remains 'memory'
        expect(detectedTarget(cmds)).toBe('memory');
    });

    it('reassigning a pointer to null does not leave a stale edge', () => {
        reset();
        // a → b, then a.next = null. Final graph has no edges, so classification stays memory.
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            setPtr('0x100', 'next', '0x200'),
            setPtr('0x100', 'next', undefined),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('memory');
    });
});

describe('mapTraceToCommands — deletion and edge cases', () => {
    it('deleted nodes are excluded from classification', () => {
        reset();
        // Build a 4-node chain, then delete the tail. The remaining 3 are still
        // a chain → memory (linked list). The 'doubly' / 'circular' classifier
        // shouldn't fire on the deleted node.
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            alloc('0x300'),
            alloc('0x400'),
            setPtr('0x100', 'next', '0x200'),
            setPtr('0x200', 'next', '0x300'),
            setPtr('0x300', 'next', '0x400'),
            mkStep({ type: 'DELETE', addr: '0x400' }),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('memory');
    });

    it('two disjoint chains stay as memory (no false-positive classification)', () => {
        reset();
        // a→b and c→d, no cross-edges. maxOutDeg ≤ 1, no cycles, no back-fields.
        // Should remain 'memory'.
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            alloc('0x300'),
            alloc('0x400'),
            setPtr('0x100', 'next', '0x200'),
            setPtr('0x300', 'next', '0x400'),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('memory');
    });

    it('single self-cycle (a→a) → circular', () => {
        reset();
        const steps: TraceStep[] = [
            alloc('0x100'),
            alloc('0x200'),
            setPtr('0x100', 'next', '0x200'),
            setPtr('0x200', 'next', '0x100'),
        ];
        const cmds = mapTraceToCommands(steps);
        expect(detectedTarget(cmds)).toBe('circular');
    });

    it('command line numbers propagate from TraceStep.line', () => {
        reset();
        const steps: TraceStep[] = [
            { ...alloc('0x100'), line: 42 } as TraceStep,
            { ...setPtr('0x100', 'next', '0x100'), line: 99 } as TraceStep,
        ];
        const cmds = mapTraceToCommands(steps);
        expect(cmds[0].line).toBe(42);
        // Second command (SET_POINTER) should carry line 99
        const set = cmds.find(c => c.type === 'SET_POINTER');
        expect(set?.line).toBe(99);
    });
});

describe('mapTraceToCommands — non-pointer hints', () => {
    it('STACK: ALLOC with hint=stack does not create a heap node, PUSH/POP route to stack target', () => {
        reset();
        const steps: TraceStep[] = [
            mkStep({ type: 'ALLOC', addr: '__val__s', var: 's', hint: 'stack' }),
            mkStep({ type: 'PUSH', var: 's', value: 10 }),
            mkStep({ type: 'PUSH', var: 's', value: 20 }),
            mkStep({ type: 'POP',  var: 's' }),
        ];
        const cmds = mapTraceToCommands(steps);
        // No ALLOCATE_NODE for the stack container itself
        expect(cmds.find(c => c.type === 'ALLOCATE_NODE')).toBeUndefined();
        // PUSH/POP go to 'stack' target
        const pushCmds = cmds.filter(c => c.type === 'PUSH');
        expect(pushCmds).toHaveLength(2);
        expect(pushCmds.every(c => c.target === 'stack')).toBe(true);
        expect(pushCmds.map(c => c.value)).toEqual([10, 20]);
    });

    it('QUEUE: ALLOC with hint=queue routes PUSH/POP to ENQUEUE/DEQUEUE on queue target', () => {
        reset();
        const steps: TraceStep[] = [
            mkStep({ type: 'ALLOC', addr: '__val__q', var: 'q', hint: 'queue' }),
            mkStep({ type: 'PUSH', var: 'q', value: 100 }),
            mkStep({ type: 'POP',  var: 'q' }),
        ];
        const cmds = mapTraceToCommands(steps);
        const enq = cmds.find(c => c.type === 'ENQUEUE');
        const deq = cmds.find(c => c.type === 'DEQUEUE');
        expect(enq?.target).toBe('queue');
        expect(deq?.target).toBe('queue');
        expect(enq?.value).toBe(100);
    });
});
