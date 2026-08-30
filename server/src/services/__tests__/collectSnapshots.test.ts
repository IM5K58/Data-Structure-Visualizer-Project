import { describe, it, expect } from 'vitest';
import { collectSnapshots, type SteppingDriver } from '../traceSession.js';
import type { GDBStopInfo, GDBLocal, GDBField, GDBFrame } from '../gdbTypes.js';

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

const STL = '/usr/include/c++/12/bits/stl_vector.h';

function stop(line: number, opts: Partial<GDBStopInfo> = {}): GDBStopInfo {
    return { reason: 'end-stepping-range', line, file: USER, func: 'main', ...opts };
}

/** A stop inside libstdc++ — somewhere the user never wrote a line. */
const LIBRARY = stop(1287, { file: STL, func: 'std::vector::push_back' });

/** The stack while inside that call: their frame is still underneath. */
const INSIDE_LIBRARY: GDBFrame[] = [
    { level: 0, func: 'std::vector::push_back', file: STL, fullname: STL, line: 1287 },
    { level: 1, func: 'main', file: USER, fullname: USER, line: 11 },
];

/**
 * A driver that replays a scripted list of stops. Every inspection call returns
 * nothing, so each test says only what it is about.
 */
function scripted(
    stops: Array<GDBStopInfo | null>,
    opts: {
        /** Stops handed back by finish(), in order. */
        finishes?: Array<GDBStopInfo | null>;
        /** The stack at any moment. Defaults to one still inside main. */
        frames?: GDBFrame[];
    } = {},
): SteppingDriver & { steps: number; inspections: number; escapes: number; overs: number; ins: number } {
    let i = 0;
    let f = 0;
    const stack = opts.frames ?? [{ level: 0, func: 'main', file: USER, fullname: USER, line: 10 }];
    return {
        steps: 0,
        inspections: 0,
        escapes: 0,
        /** How the loop chose to move: over a call, or into one. */
        overs: 0,
        ins: 0,
        async next() { this.steps++; this.overs++; return stops[i++] ?? null; },
        async step() { this.steps++; this.ins++; return stops[i++] ?? null; },
        async finish() { this.escapes++; return opts.finishes?.[f++] ?? null; },
        async getFrames(): Promise<GDBFrame[]> { return stack; },
        async getVariables(): Promise<GDBLocal[]> { this.inspections++; return []; },
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

    // Execution left main for good — no frame below belongs to the user any
    // more. Complete, not truncated: every line they wrote was captured.
    it('ends cleanly once no frame belongs to the user any more', async () => {
        const driver = scripted(
            [stop(11), stop(0, { file: '', func: '__libc_start_call_main' })],
            { frames: [{ level: 0, func: '__libc_start_call_main', file: '', fullname: '', line: 0 }] },
        );
        const r = await collectSnapshots(driver, stop(10));

        expect(r.snapshots.map(s => s.line)).toEqual([10, 11]);
        expect(r.timedOut).toBe(false);
    });

    // The frame after main has a source file on Windows — crtexe.c. The old
    // "no file means the end" heuristic saw a file here and kept going.
    it('ends on a CRT frame that does have a source file', async () => {
        const driver = scripted(
            [stop(240, { file: 'crtexe.c', func: '__tmainCRTStartup' })],
            { frames: [{ level: 0, func: '__tmainCRTStartup', file: 'crtexe.c', fullname: 'crtexe.c', line: 240 }] },
        );
        const r = await collectSnapshots(driver, stop(10));

        expect(r.snapshots.map(s => s.line)).toEqual([10]);
        expect(r.timedOut).toBe(false);
    });
});

describe('collectSnapshots escaping foreign frames', () => {
    // Inside a library call with the user's frame still below: run out of it
    // rather than stepping through, and pay for nothing on the way.
    it('finishes out of a library frame instead of stepping through it', async () => {
        const driver = scripted(
            [LIBRARY, stop(0, { reason: 'exited-normally' })],
            { finishes: [stop(11)], frames: INSIDE_LIBRARY },
        );
        const r = await collectSnapshots(driver, stop(10));

        expect(driver.escapes).toBe(1);
        expect(r.snapshots.map(s => s.line)).toEqual([10, 11]);
    });

    // The expensive part of a snapshot is the inspection. Doing it in a frame
    // the user never wrote costs exactly as much and is worth nothing.
    it('inspects nothing while outside the user source', async () => {
        const driver = scripted(
            [LIBRARY, stop(0, { reason: 'exited-normally' })],
            { finishes: [stop(11)], frames: INSIDE_LIBRARY },
        );
        await collectSnapshots(driver, stop(10));

        // Two inspections, for the two user-source stops — none for the frame
        // in between.
        expect(driver.inspections).toBe(2);
    });

    it('gives up when it cannot get back to the user source', async () => {
        const driver = scripted([LIBRARY], { finishes: [null], frames: INSIDE_LIBRARY });
        const r = await collectSnapshots(driver, stop(10));

        expect(r.timedOut).toBe(true);
        expect(r.snapshots.map(s => s.line)).toEqual([10]);
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
    // A stop outside the user's file is never captured, whichever way the loop
    // leaves it. This used to step through with next(); increment 4 escapes
    // with finish() instead, and the snapshot list is the same either way.
    it('never captures a stop outside the user source', async () => {
        const driver = scripted(
            [LIBRARY, stop(0, { reason: 'exited-normally' })],
            { finishes: [stop(11)], frames: INSIDE_LIBRARY },
        );
        const r = await collectSnapshots(driver, stop(10));

        expect(r.snapshots.map(s => s.line)).toEqual([10, 11]);
        expect(r.snapshots.some(s => s.line === 1287)).toBe(false);
    });

    it('records the call stack alongside each snapshot', async () => {
        const driver = scripted([stop(0, { reason: 'exited-normally' })]);
        const r = await collectSnapshots(driver, stop(10));
        expect(r.snapshots[0].callStack).toEqual(['main']);
    });
});

/**
 * Step-into, behind its flag. The whole phase exists for this: with exec-next,
 * everything inside a function the user wrote is invisible, which is most of
 * what a data-structure visualiser is for.
 */
describe('collectSnapshots stepping into functions', () => {
    const ON = (stops: Array<GDBStopInfo | null>, opts = {}) => {
        const driver = scripted(stops, opts);
        return { driver, run: (first = stop(10)) => collectSnapshots(driver, first, () => false, Date.now, true) };
    };

    it('steps over calls when the flag is off', async () => {
        const driver = scripted([stop(11), stop(0, { reason: 'exited-normally' })]);
        await collectSnapshots(driver, stop(10), () => false, Date.now, false);

        expect(driver.ins).toBe(0);
        expect(driver.overs).toBeGreaterThan(0);
    });

    it('steps into calls when the flag is on', async () => {
        const { driver, run } = ON([stop(11), stop(0, { reason: 'exited-normally' })]);
        await run();

        expect(driver.ins).toBeGreaterThan(0);
        expect(driver.overs).toBe(0);
    });

    // A line inside a callee is exactly what exec-next could never show.
    it('captures lines in a function the user wrote', async () => {
        const inCallee = (line: number) => stop(line, { func: 'push_front' });
        const { run } = ON([inCallee(6), inCallee(7), stop(14), stop(0, { reason: 'exited-normally' })]);
        const r = await run(stop(13));

        expect(r.snapshots.map(s => `${s.func}:${s.line}`))
            .toEqual(['main:13', 'push_front:6', 'push_front:7', 'main:14']);
    });
});

describe('collectSnapshots visit cap', () => {
    const recursive = (n: number) =>
        Array.from({ length: n }, () => stop(21, { func: 'insert' }));

    it('stops describing a line once it has been seen enough times', async () => {
        const driver = scripted([...recursive(30), stop(0, { reason: 'exited-normally' })]);
        const r = await collectSnapshots(driver, stop(21, { func: 'insert' }), () => false, Date.now, true);

        // Eight captures of that line, and every later visit stepped but not
        // described. 414 captures became 98 on the real fixture this models.
        expect(r.snapshots.filter(s => s.func === 'insert').length).toBe(8);
        expect(driver.steps).toBeGreaterThan(8);
    });

    // Demoting means stepping OVER, so a recursive line cannot keep descending
    // once it has been described enough.
    it('steps over a demoted line rather than into it', async () => {
        const driver = scripted([...recursive(20), stop(0, { reason: 'exited-normally' })]);
        await collectSnapshots(driver, stop(21, { func: 'insert' }), () => false, Date.now, true);

        expect(driver.ins).toBe(8);
        expect(driver.overs).toBeGreaterThan(0);
    });

    it('counts each function separately, so one hot line does not silence another', async () => {
        const stops = [
            ...Array.from({ length: 12 }, () => stop(21, { func: 'insert' })),
            stop(31, { func: 'height' }),
            stop(0, { reason: 'exited-normally' }),
        ];
        const driver = scripted(stops);
        const r = await collectSnapshots(driver, stop(21, { func: 'insert' }), () => false, Date.now, true);

        expect(r.snapshots.some(s => s.func === 'height')).toBe(true);
    });

    it('does not cap anything while stepping over', async () => {
        const driver = scripted([...recursive(30), stop(0, { reason: 'exited-normally' })]);
        const r = await collectSnapshots(driver, stop(21, { func: 'insert' }), () => false, Date.now, false);

        expect(r.snapshots.length).toBeGreaterThan(8);
    });
});
