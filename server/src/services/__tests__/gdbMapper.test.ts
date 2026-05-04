import { describe, it, expect } from 'vitest';
import { snapshotsToTraceSteps } from '../gdbMapper.js';
import type { GDBSnapshot, STLSnapshot, STLKind } from '../gdbDriver.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function snap(line: number, stl: Record<string, STLSnapshot> = {}, callStack: string[] = ['main']): GDBSnapshot {
    return {
        line,
        func: 'main',
        locals: [],
        structData: new Map(),
        valueStructData: new Map(),
        arrayReadings: new Map(),
        stlContainers: new Map(Object.entries(stl)),
        callStack,
    };
}

function stl(kind: STLKind, size: number, pushValue?: string): STLSnapshot {
    return { kind, size, pushValue };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('snapshotsToTraceSteps — STL containers', () => {
    it('first sight of empty stack → single ALLOC (hint=stack)', () => {
        const steps = snapshotsToTraceSteps(
            [snap(1, { s: stl('stack', 0) })],
            '',
        );
        const allocs = steps.filter(s => s.type === 'ALLOC');
        expect(allocs).toHaveLength(1);
        expect(allocs[0].var).toBe('s');
        expect(allocs[0].hint).toBe('stack');
        expect(allocs[0].addr).toBe('__stl__s');
        // No PUSH on first empty sight
        expect(steps.filter(s => s.type === 'PUSH')).toHaveLength(0);
    });

    it('first sight of pre-populated vector → ALLOC + N replay PUSHes (hint=stack)', () => {
        const steps = snapshotsToTraceSteps(
            [snap(1, { v: stl('vector', 3, '42') })],
            '',
        );
        expect(steps.filter(s => s.type === 'ALLOC')).toHaveLength(1);
        const pushes = steps.filter(s => s.type === 'PUSH');
        expect(pushes).toHaveLength(3);
        // All replay pushes use the most recently observed value
        expect(pushes.every(p => p.value === '42')).toBe(true);
    });

    it('queue: size 0 → 2 emits 2 PUSH events with back() value', () => {
        const steps = snapshotsToTraceSteps(
            [
                snap(1, { q: stl('queue', 0) }),
                snap(2, { q: stl('queue', 2, '20') }),
            ],
            '',
        );
        const allocs = steps.filter(s => s.type === 'ALLOC');
        expect(allocs[0].hint).toBe('queue');
        const pushes = steps.filter(s => s.type === 'PUSH');
        expect(pushes).toHaveLength(2);
        expect(pushes.every(p => p.value === '20')).toBe(true);
    });

    it('priority_queue: size shrink emits POPs', () => {
        const steps = snapshotsToTraceSteps(
            [
                snap(1, { pq: stl('priority_queue', 3, '99') }),
                snap(2, { pq: stl('priority_queue', 1, '5') }),
            ],
            '',
        );
        const pops = steps.filter(s => s.type === 'POP');
        expect(pops).toHaveLength(2);
        // ALLOC + 3 replay PUSH on first sight, then 2 POP — and no extra PUSH on shrink
        const pushes = steps.filter(s => s.type === 'PUSH');
        expect(pushes).toHaveLength(3);
    });

    it('stack: unchanged size between snapshots → no PUSH or POP', () => {
        const steps = snapshotsToTraceSteps(
            [
                snap(1, { s: stl('stack', 2, 'x') }),
                snap(2, { s: stl('stack', 2, 'x') }),
            ],
            '',
        );
        // First sight: ALLOC + 2 replay PUSH. No further events.
        expect(steps.filter(s => s.type === 'ALLOC')).toHaveLength(1);
        expect(steps.filter(s => s.type === 'PUSH')).toHaveLength(2);
        expect(steps.filter(s => s.type === 'POP')).toHaveLength(0);
    });

    it('multiple containers tracked independently', () => {
        const steps = snapshotsToTraceSteps(
            [
                snap(1, { s: stl('stack', 0), q: stl('queue', 0) }),
                snap(2, { s: stl('stack', 1, 'a'), q: stl('queue', 0) }),
                snap(3, { s: stl('stack', 1, 'a'), q: stl('queue', 1, 'b') }),
            ],
            '',
        );
        const stackPushes = steps.filter(s => s.type === 'PUSH' && s.var === 's');
        const queuePushes = steps.filter(s => s.type === 'PUSH' && s.var === 'q');
        expect(stackPushes).toHaveLength(1);
        expect(queuePushes).toHaveLength(1);
        expect(stackPushes[0].value).toBe('a');
        expect(queuePushes[0].value).toBe('b');
    });

    it('emits STACK_FRAMES only when call stack changes', () => {
        const steps = snapshotsToTraceSteps(
            [
                snap(1, {}, ['main']),
                snap(2, {}, ['main']),               // unchanged → no event
                snap(3, {}, ['main', 'foo']),        // call entered → event
                snap(4, {}, ['main', 'foo']),        // unchanged → no event
                snap(5, {}, ['main']),               // returned → event
            ],
            '',
        );
        const stackEvents = steps.filter(s => s.type === 'STACK_FRAMES');
        // 1 for initial snapshot (changes from [] to ['main']) + 2 for transitions
        expect(stackEvents).toHaveLength(3);
        expect(stackEvents[0].frames).toEqual(['main']);
        expect(stackEvents[1].frames).toEqual(['main', 'foo']);
        expect(stackEvents[2].frames).toEqual(['main']);
    });

    it('attaches program output to the last step of the last snapshot', () => {
        const steps = snapshotsToTraceSteps(
            [
                snap(1, { s: stl('stack', 0) }),
                snap(2, { s: stl('stack', 1, '7') }),
            ],
            'hello\n',
        );
        const last = steps[steps.length - 1];
        expect(last.output).toBe('hello\n');
    });
});
