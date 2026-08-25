import { describe, it, expect } from 'vitest';
import { snapshotsToTraceSteps } from '../gdbMapper.js';
import type { GDBSnapshot, STLSnapshot } from '../gdbTypes.js';

/**
 * A container size read before its constructor has run is garbage, and the
 * mapper turns a size into one command object per element.
 *
 * Measured in the deployment container: a three-line program that only declares
 * `std::vector<int> v` reported size 27,767,532,377,092 at main's prologue,
 * because that is whatever was on the stack. The mapper looped over it and the
 * server died with "JavaScript heap out of memory" — from the most common
 * container in C++, in a program that does nothing.
 *
 * traceSession refuses such a size at the source. This pins the second line:
 * the mapper must not allocate proportionally to a number it was handed.
 */

const GARBAGE_SIZE = 27_767_532_377_092;

function snapshot(line: number, containers: Record<string, STLSnapshot>): GDBSnapshot {
    return {
        line,
        func: 'main',
        locals: [],
        structData: new Map(),
        valueStructData: new Map(),
        arrayReadings: new Map(),
        stlContainers: new Map(Object.entries(containers)),
        callStack: ['main'],
    };
}

describe('mapper bounds container commands', () => {
    it('does not allocate one command per element for a garbage size', () => {
        const steps = snapshotsToTraceSteps([
            snapshot(3, { v: { kind: 'vector', size: 0 } }),
            snapshot(4, { v: { kind: 'vector', size: GARBAGE_SIZE, pushValue: '1' } }),
        ], '');
        // The real assertion is that this returns at all, and in bounded memory.
        expect(steps.length).toBeLessThan(5000);
    });

    it('bounds a garbage shrink too', () => {
        const steps = snapshotsToTraceSteps([
            snapshot(3, { v: { kind: 'vector', size: GARBAGE_SIZE, pushValue: '1' } }),
            snapshot(4, { v: { kind: 'vector', size: 0 } }),
        ], '');
        expect(steps.length).toBeLessThan(20_000);
    });

    // The point is not the exact ceiling — it is that the output stops growing
    // with the number it was handed. A bound that still scaled would leave the
    // same failure one order of magnitude further out.
    it('produces the same amount of work however large the garbage is', () => {
        const run = (size: number) => snapshotsToTraceSteps([
            snapshot(3, { v: { kind: 'vector', size: 0 } }),
            snapshot(4, { v: { kind: 'vector', size, pushValue: '1' } }),
        ], '').length;

        expect(run(GARBAGE_SIZE)).toBe(run(GARBAGE_SIZE * 1000));
        expect(run(Number.MAX_SAFE_INTEGER)).toBe(run(GARBAGE_SIZE));
    });

    it('still reports an ordinary push one command at a time', () => {
        const steps = snapshotsToTraceSteps([
            snapshot(3, { v: { kind: 'vector', size: 0 } }),
            snapshot(4, { v: { kind: 'vector', size: 3, pushValue: '7' } }),
        ], '');
        expect(steps.filter(s => s.type === 'PUSH')).toHaveLength(3);
    });

    it('still reports an ordinary pop', () => {
        const steps = snapshotsToTraceSteps([
            snapshot(3, { v: { kind: 'vector', size: 3, pushValue: '7' } }),
            snapshot(4, { v: { kind: 'vector', size: 1, pushValue: '7' } }),
        ], '');
        expect(steps.filter(s => s.type === 'POP')).toHaveLength(2);
    });
});
