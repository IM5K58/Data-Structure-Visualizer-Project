import { describe, it, expect } from 'vitest';
import { GDBDriver } from '../gdbDriver.js';
import { FakeGdb, fakeDriverParts } from './fakeGdb.js';

/**
 * The execution commands, and the error path they share.
 *
 * GDB reports a refused command as a *resolved* result whose class is 'error',
 * not as a rejection — measured. The old next() therefore saw nothing, kept
 * waiting for a stop that was never coming, and turned "GDB cannot step here"
 * into a six-second timeout. These pin the fast path instead.
 */

async function started(): Promise<{ driver: GDBDriver; fake: FakeGdb }> {
    const { fake, options } = fakeDriverParts();
    const driver = new GDBDriver(options);
    await driver.start('/tmp/job/main');
    return { driver, fake };
}

const STOP = (func: string, line: number, file = 'main.cpp') =>
    `*stopped,reason="end-stepping-range",frame={line="${line}",file="${file}",func="${func}"}`;

describe('execution commands', () => {
    it.each([
        ['next', 'exec-next'],
        ['step', 'exec-step'],
        ['finish', 'exec-finish'],
    ] as const)('%s sends %s and returns the stop', async (method, mi) => {
        const { driver, fake } = await started();
        const pending = driver[method]();
        await Promise.resolve();

        expect(fake.written[0]).toContain(mi);
        fake.say(`${fake.tokenOf(0)}^running`, STOP('insert', 14));

        await expect(pending).resolves.toEqual({
            reason: 'end-stepping-range', line: 14, file: 'main.cpp', func: 'insert',
        });
    });

    // The whole point of increment 1: a refused command must not cost a timeout.
    it.each(['next', 'step', 'finish'] as const)(
        '%s returns null at once when GDB refuses it', async (method) => {
            const { driver, fake } = await started();
            const t0 = Date.now();
            const pending = driver[method]();
            await Promise.resolve();

            fake.say(`${fake.tokenOf(0)}^error,msg="Cannot find bounds of current function"`);

            await expect(pending).resolves.toBeNull();
            expect(Date.now() - t0).toBeLessThan(500);
        });

    it('returns null when the pipe is already closed', async () => {
        const { driver, fake } = await started();
        fake.stdin.writable = false;
        await expect(driver.step()).resolves.toBeNull();
    });
});

describe('stop-wait generation', () => {
    // Without the counter, a *stopped belonging to a cancelled command resolves
    // whichever wait happens to be armed next — one step reported as another.
    it('a stop arriving after a refusal does not resolve the next command', async () => {
        const { driver, fake } = await started();

        const refused = driver.step();
        await Promise.resolve();
        fake.say(`${fake.tokenOf(0)}^error,msg="Cannot find bounds of current function"`);
        await expect(refused).resolves.toBeNull();

        // GDB emits the stop late, for the command that was already abandoned.
        fake.say(STOP('stale', 999));

        const next = driver.next();
        await Promise.resolve();
        fake.say(`${fake.tokenOf(1)}^running`, STOP('main', 12));

        const info = await next;
        expect(info?.func).toBe('main');
        expect(info?.line).toBe(12);
    });
});

describe('getFrames', () => {
    it('reports level, func, file and line, innermost first', async () => {
        const { driver, fake } = await started();
        const pending = driver.getFrames();
        await Promise.resolve();

        fake.say(`${fake.tokenOf(0)}^done,stack=[`
            + `frame={level="0",func="insert",file="main.cpp",fullname="/j/main.cpp",line="14"},`
            + `frame={level="1",func="main",file="main.cpp",fullname="/j/main.cpp",line="30"}]`);

        await expect(pending).resolves.toEqual([
            { level: 0, func: 'insert', file: 'main.cpp', fullname: '/j/main.cpp', line: 14 },
            { level: 1, func: 'main', file: 'main.cpp', fullname: '/j/main.cpp', line: 30 },
        ]);
    });

    // Frames in libc and the CRT have no source; that absence is the signal the
    // stepping loop uses to decide it has left the user's code.
    it('leaves file empty for a frame GDB has no source for', async () => {
        const { driver, fake } = await started();
        const pending = driver.getFrames();
        await Promise.resolve();

        fake.say(`${fake.tokenOf(0)}^done,stack=[`
            + `frame={level="0",addr="0x7f00",func="__libc_start_call_main"},`
            + `frame={level="1",func="main",file="main.cpp",line="30"}]`);

        const frames = await pending;
        expect(frames[0].file).toBe('');
        expect(frames[0].func).toBe('__libc_start_call_main');
        expect(frames[1].file).toBe('main.cpp');
    });

    it('getCallStack still returns names outermost first', async () => {
        const { driver, fake } = await started();
        const pending = driver.getCallStack();
        await Promise.resolve();

        fake.say(`${fake.tokenOf(0)}^done,stack=[`
            + `frame={level="0",func="inner"},frame={level="1",func="outer"},frame={level="2",func="main"}]`);

        await expect(pending).resolves.toEqual(['main', 'outer', 'inner']);
    });
});

describe('addSkip', () => {
    it('reports success when GDB accepts the rule', async () => {
        const { driver, fake } = await started();
        const pending = driver.addSkip('^std::');
        await Promise.resolve();

        expect(fake.written[0]).toContain('skip -rfu ^std::');
        fake.say(`${fake.tokenOf(0)}^done`);
        await expect(pending).resolves.toBe(true);
    });

    // Accelerator, not a requirement — escaping foreign frames does the work.
    // A GDB that rejects the syntax must not fail the session.
    it('reports failure without throwing when GDB rejects it', async () => {
        const { driver, fake } = await started();
        const pending = driver.addSkip('^operator new');
        await Promise.resolve();

        fake.say(`${fake.tokenOf(0)}^error,msg="Invalid argument: new"`);
        await expect(pending).resolves.toBe(false);
    });
});
