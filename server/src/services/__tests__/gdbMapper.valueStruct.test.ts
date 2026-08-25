import { describe, it, expect } from 'vitest';
import { snapshotsToTraceSteps } from '../gdbMapper.js';
import type { GDBSnapshot, GDBField, GDBLocal } from '../gdbTypes.js';

/**
 * Build a snapshot for a single by-value struct local (the array-backed
 * stack/queue/heap path in section 5 of the mapper).
 */
function snap(
    line: number,
    varName: string,
    typeName: string,
    fields: GDBField[],
    arrayReadings: Record<string, string> = {},
): GDBSnapshot {
    const local: GDBLocal = { name: varName, type: typeName, value: '...', rawValue: '...' };
    return {
        line,
        func: 'main',
        locals: [local],
        structData: new Map(),
        valueStructData: new Map([[varName, fields]]),
        arrayReadings: new Map(Object.entries(arrayReadings)),
        stlContainers: new Map(),
        callStack: ['main'],
    };
}

const arr = (name = 'data', len = 100): GDBField => ({ name, type: `int [${len}]`, value: '...' });
const int = (name: string, value: number): GDBField => ({ name, type: 'int', value: String(value) });

/** Element keys for `data[i]` as the driver reports them. */
function elems(varName: string, values: Record<number, string>, field = 'data'): Record<string, string> {
    return Object.fromEntries(
        Object.entries(values).map(([i, v]) => [`${varName}.${field}[${i}]`, v]),
    );
}

describe('heap type-name detection', () => {
    // The struct is registered on its *second* appearance (after the ctor runs),
    // so every case needs at least two identical snapshots.
    const classify = (typeName: string) => {
        const fields = [arr(), int('size', 0)];
        const steps = snapshotsToTraceSteps([
            snap(1, 'h', typeName, fields),
            snap(2, 'h', typeName, fields),
        ], '');
        return steps.find(s => s.type === 'ALLOC')?.hint;
    };

    it.each([
        'MaxHeap', 'MinHeap', 'min_heap', 'MyHeap', 'BinaryHeap', 'IntHeap',
        'PriorityQueue', 'priority_queue', 'PQ', 'HeapSorter',
    ])('classifies %s as heap', (typeName) => {
        expect(classify(typeName)).toBe('heap');
    });

    it.each(['Cheap', 'Stack', 'RingBuffer'])('does not classify %s as heap', (typeName) => {
        expect(classify(typeName)).not.toBe('heap');
    });
});

describe('array-backed struct index selection', () => {
    it('tracks size, not capacity, when both are present', () => {
        // `capacity` is declared first and never changes; latching onto it would
        // emit nothing at all.
        const before = [arr(), int('capacity', 100), int('size', 0)];
        const steps = snapshotsToTraceSteps([
            snap(1, 'h', 'MyHeap', before),
            snap(2, 'h', 'MyHeap', before),
            snap(3, 'h', 'MyHeap', [arr(), int('capacity', 100), int('size', 1)],
                elems('h', { 0: '42' })),
        ], '');

        const pushes = steps.filter(s => s.type === 'PUSH');
        expect(pushes).toHaveLength(1);
        expect(pushes[0].value).toBe('42');
    });

    it('emits one POP per decrement of the live index', () => {
        const two = [arr(), int('top', 1)];
        const steps = snapshotsToTraceSteps([
            snap(1, 's', 'Stack', two),
            snap(2, 's', 'Stack', two),
            snap(3, 's', 'Stack', [arr(), int('top', -1)]),
        ], '');
        expect(steps.filter(s => s.type === 'POP')).toHaveLength(2);
    });

    it('ignores garbage-sized jumps', () => {
        const base = [arr(), int('size', 0)];
        const steps = snapshotsToTraceSteps([
            snap(1, 's', 'Stack', base),
            snap(2, 's', 'Stack', base),
            snap(3, 's', 'Stack', [arr(), int('size', 999999)]),
        ], '');
        expect(steps.filter(s => s.type === 'PUSH')).toHaveLength(0);
    });
});

describe('queue front/rear tracking', () => {
    const fields = (front: number, rear: number, count: number) =>
        [arr('data', 8), int('front', front), int('rear', rear), int('count', count)];

    it('emits one PUSH per enqueue even though count moves with rear', () => {
        const initial = fields(0, 0, 0);
        const steps = snapshotsToTraceSteps([
            snap(1, 'q', 'Queue', initial),
            snap(2, 'q', 'Queue', initial),
            // One enqueue: rear 0→1 AND count 0→1. Iterating every changed index
            // field would report this single operation twice.
            snap(3, 'q', 'Queue', fields(0, 1, 1), elems('q', { 0: '7' })),
        ], '');

        expect(steps.find(s => s.type === 'ALLOC')?.hint).toBe('queue');
        const pushes = steps.filter(s => s.type === 'PUSH');
        expect(pushes).toHaveLength(1);
        expect(pushes[0].value).toBe('7');
    });

    it('emits a POP when front advances', () => {
        const start = fields(0, 2, 2);
        const steps = snapshotsToTraceSteps([
            snap(1, 'q', 'Queue', start),
            snap(2, 'q', 'Queue', start),
            snap(3, 'q', 'Queue', fields(1, 2, 1)),
        ], '');
        expect(steps.filter(s => s.type === 'POP')).toHaveLength(1);
        expect(steps.filter(s => s.type === 'PUSH')).toHaveLength(0);
    });

    it('treats a rear wrap past the array end as an enqueue', () => {
        // capacity 8, rear 7 → 0 is a ring wrap, not a reset.
        const start = fields(3, 7, 4);
        const steps = snapshotsToTraceSteps([
            snap(1, 'q', 'Queue', start),
            snap(2, 'q', 'Queue', start),
            snap(3, 'q', 'Queue', fields(3, 0, 5), elems('q', { 7: '9' })),
        ], '');
        const pushes = steps.filter(s => s.type === 'PUSH');
        expect(pushes).toHaveLength(1);
        expect(pushes[0].value).toBe('9');
    });

    it('reads a clear() as removals, not as a rear wrap', () => {
        // front 6→0 and rear 7→0 both look like ring wraps in isolation. The
        // count going 1→0 is what identifies this as emptying the queue.
        const start = fields(6, 7, 1);
        const steps = snapshotsToTraceSteps([
            snap(1, 'q', 'Queue', start),
            snap(2, 'q', 'Queue', start),
            snap(3, 'q', 'Queue', fields(0, 0, 0)),
        ], '');
        expect(steps.filter(s => s.type === 'PUSH')).toHaveLength(0);
        expect(steps.filter(s => s.type === 'POP')).toHaveLength(1);
    });

    it('uses the count field even when front and rear are unnamed', () => {
        const unnamed = (a: number, b: number, count: number) =>
            [arr('data', 8), int('i', a), int('j', b), int('count', count)];
        const start = unnamed(0, 0, 0);
        const steps = snapshotsToTraceSteps([
            snap(1, 'q', 'Queue', start),
            snap(2, 'q', 'Queue', start),
            snap(3, 'q', 'Queue', unnamed(0, 1, 1), elems('q', { 0: '5' })),
        ], '');
        expect(steps.filter(s => s.type === 'PUSH')).toHaveLength(1);
    });
});
