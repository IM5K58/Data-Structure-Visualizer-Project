import { describe, it, expect } from 'vitest';
import { snapshotsToTraceSteps } from '../gdbMapper.js';
import type { GDBSnapshot, GDBLocal } from '../gdbTypes.js';

/**
 * Locals belong to a frame, not to a name.
 *
 * Until the tracer stepped into functions this never came up: only main was
 * ever captured, so a name identified a variable. With step-into, `n` in main
 * and `n` in push_front are different variables that share a spelling, and
 * comparing one against the other invents changes that never happened — a
 * value flickering back and forth on screen as execution enters and leaves.
 *
 * The key is the whole call path, so recursion separates too.
 */

function local(name: string, value: string, type = 'int'): GDBLocal {
    return { name, type, value, rawValue: value };
}

function snap(line: number, func: string, callStack: string[], locals: GDBLocal[]): GDBSnapshot {
    return {
        line, func, locals,
        structData: new Map(),
        valueStructData: new Map(),
        arrayReadings: new Map(),
        stlContainers: new Map(),
        callStack,
    };
}

const localVars = (steps: ReturnType<typeof snapshotsToTraceSteps>) =>
    steps.filter(s => s.type === 'LOCAL_VAR').map(s => `${s.var}=${s.value}`);

describe('locals are compared within their own frame', () => {
    // main enters push_front and comes back. The callee's n is its own.
    it('does not compare a callee local against a same-named caller local', () => {
        const steps = snapshotsToTraceSteps([
            snap(13, 'main', ['main'], [local('n', '1')]),
            snap(6, 'push_front', ['main', 'push_front'], [local('n', '99')]),
            snap(7, 'push_front', ['main', 'push_front'], [local('n', '99')]),
            snap(14, 'main', ['main'], [local('n', '1')]),
        ], '');

        // main:n=1 once, push_front:n=99 once. The callee's unchanged second
        // line emits nothing, and returning to main does not re-announce a
        // value that never moved.
        expect(localVars(steps)).toEqual(['n=1', 'n=99']);
    });

    // Without per-frame keying this is where the flicker came from: every
    // crossing looked like a change, so the same two values alternated forever.
    it('does not flip-flop a shared name across repeated calls', () => {
        const steps = snapshotsToTraceSteps([
            snap(13, 'main', ['main'], [local('n', '1')]),
            snap(6, 'push_front', ['main', 'push_front'], [local('n', '99')]),
            snap(14, 'main', ['main'], [local('n', '1')]),
            snap(6, 'push_front', ['main', 'push_front'], [local('n', '99')]),
            snap(15, 'main', ['main'], [local('n', '1')]),
        ], '');

        expect(localVars(steps)).toEqual(['n=1', 'n=99']);
    });

    it('still reports a real change within one frame', () => {
        const steps = snapshotsToTraceSteps([
            snap(13, 'main', ['main'], [local('sum', '0')]),
            snap(14, 'main', ['main'], [local('sum', '5')]),
        ], '');

        expect(localVars(steps)).toEqual(['sum=0', 'sum=5']);
    });

    // Recursion: the same function at two depths is two activations, and the
    // call path tells them apart.
    it('separates one function from itself at another depth', () => {
        const steps = snapshotsToTraceSteps([
            snap(21, 'insert', ['main', 'insert'], [local('key', '50')]),
            snap(21, 'insert', ['main', 'insert', 'insert'], [local('key', '30')]),
            snap(22, 'insert', ['main', 'insert'], [local('key', '50')]),
        ], '');

        // Both depths announce their own key; returning to the outer one does
        // not re-announce 50, because that frame never changed.
        expect(localVars(steps)).toEqual(['key=50', 'key=30']);
    });

    // Snapshots recorded before callStack existed still have to map.
    it('falls back to the function name when there is no call stack', () => {
        const steps = snapshotsToTraceSteps([
            snap(13, 'main', [], [local('x', '1')]),
            snap(14, 'main', [], [local('x', '2')]),
        ], '');

        expect(localVars(steps)).toEqual(['x=1', 'x=2']);
    });
});
