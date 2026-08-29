import { describe, it, expect } from 'vitest';
import { collectSnapshots, type SteppingDriver } from '../traceSession.js';
import type { GDBStopInfo, GDBLocal, GDBField } from '../gdbTypes.js';

/**
 * The stepping loop's control flow — the first tests it has ever had.
 *
 * This is where the decisions live: when to stop, what counts as leaving the
 * user's code, what a failed step means. Every one of those has been wrong at
 * some point this week, and none of it was covered, because reaching the loop
 * used to require a real debugger.
 *
 * These pin TODAY's exec-next behaviour. That is the point: increments 4 to 6
 * rewrite this loop, and a rewrite without a recorded baseline is a rewrite
 * nobody can check.
 */

const USER = '/tmp/job/main.cpp';

function stop(line: number, opts: Partial<GDBStopInfo> = {}): GDBStopInfo {
    return { reason: 'end-stepping-range', line, file: USER, func: 'main', ...opts };
}

/**
 * A driver that replays a scripted list of stops. Every inspection call returns
 * nothing, so each test says only what it is about.
 */
function scripted(stops: Array<GDBStopInfo | null>): SteppingDriver & { steps: number } {
    let i = 0;
    return {
        steps: 0,
        async next() { this.steps++; return stops[i++] ?? null; },
        async getVariables(): Promise<GDBLocal[]> { return []; },
        async inspectPointer(): Promise<GDBField[]> { return []; },
        async evaluateExpression() { return ''; },
        async enumerateMapEntries() { return []; },
        async inspectValueStruct(): Promise<GDBField[]> { return []; },
        async getCallStack() { return ['main']; },
    };
}

describe('collectSnapshots stopping conditions', () => {
    it('captures one snapshot per user-source stop and ends on termination', async () => {
        const driver = scripted([stop(11), stop(12), stop(0, { reason: 'exited-normally' })]);
        const r = await collectSnapshots(driver, stop(10));

        expect(r.snapshots.map(s => s.line)).toEqual([10, 11, 12]);
        expect(r.timedOut).toBe(false);
        expect(r.aborted).toBe(false);
        expect(r.lastStop.reason).toBe('exited-normally');
    });

    it('stops immediately when the first stop is already terminal', async () => {
        const driver = scripted([]);
        const r = await collectSnapshots(driver, stop(0, { reason: 'exited-normally' }));
        expect(r.snapshots).toEqual([]);
        expect(driver.steps).toBe(0);
    });

    // The caller has gone. Whatever is collected is a partial trace nobody wants.
    it('abandons the trace when told to, and says so', async () => {
        let calls = 0;
        const driver = scripted([stop(11), stop(12), stop(13)]);
        const r = await collectSnapshots(driver, stop(10), () => ++calls > 2);

        expect(r.aborted).toBe(true);
        expect(r.timedOut).toBe(false);
        expect(r.snapshots.length).toBeLessThan(4);
    });

    // Execution left main. Reported as complete, not truncated: every line the
    // user wrote was captured.
    it('ends cleanly when a stop has no source file', async () => {
        const driver = scripted([stop(11), stop(0, { file: '', func: '__libc_start_call_main' })]);
        const r = await collectSnapshots(driver, stop(10));

        expect(r.snapshots.map(s => s.line)).toEqual([10, 11]);
        expect(r.timedOut).toBe(false);
    });

    // ...but only once something has been captured. A first stop with no file
    // means the trace never started, which is a different failure.
    it('does not treat a missing file as the end before anything is captured', async () => {
        const driver = scripted([stop(11), stop(0, { reason: 'exited-normally' })]);
        const r = await collectSnapshots(driver, stop(10, { file: '' }));
        expect(r.snapshots.length).toBeGreaterThan(0);
    });

    // next() returns null only when the step itself failed — a program that
    // merely ended produces a terminal stop instead. So this is a truncated
    // trace, and it used to be reported as a successful one.
    it('marks a failed step as truncated rather than success', async () => {
        const driver = scripted([stop(11), null]);
        const r = await collectSnapshots(driver, stop(10));

        expect(r.timedOut).toBe(true);
        expect(r.aborted).toBe(false);
        expect(r.snapshots.map(s => s.line)).toEqual([10, 11]);
    });

    it('gives up when the wall-clock budget is spent', async () => {
        const driver = scripted(Array.from({ length: 50 }, (_, i) => stop(11 + i)));
        let clock = 0;
        const r = await collectSnapshots(driver, stop(10), () => false, () => (clock += 20_000));

        expect(r.timedOut).toBe(true);
        expect(r.snapshots.length).toBeLessThan(50);
    });

    it('stops at the step cap on a program that never ends', async () => {
        const driver = scripted(Array.from({ length: 2000 }, () => stop(11)));
        const r = await collectSnapshots(driver, stop(10));

        expect(r.timedOut).toBe(true);
        expect(r.snapshots.length).toBeLessThanOrEqual(501);
    });
});

describe('collectSnapshots frame filtering', () => {
    // Today's loop steps over calls, so a stop in another file is CRT or
    // runtime code: step past it without paying for a snapshot.
    it('steps through frames outside the user source without capturing them', async () => {
        const driver = scripted([
            stop(90, { file: '/usr/include/c++/12/bits/stl_vector.h', func: 'std::vector::push_back' }),
            stop(11),
            stop(0, { reason: 'exited-normally' }),
        ]);
        const r = await collectSnapshots(driver, stop(10));

        expect(r.snapshots.map(s => s.line)).toEqual([10, 11]);
    });

    it('records the call stack alongside each snapshot', async () => {
        const driver = scripted([stop(0, { reason: 'exited-normally' })]);
        const r = await collectSnapshots(driver, stop(10));
        expect(r.snapshots[0].callStack).toEqual(['main']);
    });
});
