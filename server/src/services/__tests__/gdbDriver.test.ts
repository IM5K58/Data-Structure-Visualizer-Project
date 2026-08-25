import { describe, it, expect } from 'vitest';
import { GDBDriver } from '../gdbDriver.js';
import { FakeGdb, fakeDriverParts } from './fakeGdb.js';

/**
 * The MI protocol layer, driven by a fake process.
 *
 * This is the part of the driver that has actually been wrong: results matched
 * to the wrong command, stops that never arrive, timers left armed against a
 * process that no longer exists. None of it needs a real GDB — it needs lines
 * in and lines out, which is what FakeGdb provides.
 */

async function started(): Promise<{ driver: GDBDriver; fake: FakeGdb }> {
    const { fake, options } = fakeDriverParts();
    const driver = new GDBDriver(options);
    await driver.start('/tmp/job/main');
    return { driver, fake };
}

const STOP_MAIN = '*stopped,reason="breakpoint-hit",frame={line="12",file="main.cpp",func="main"}';

describe('GDBDriver startup', () => {
    it('resolves once GDB has had its moment to initialise', async () => {
        const { driver } = await started();
        expect(driver).toBeInstanceOf(GDBDriver);
    });

    it('fails when the process dies immediately', async () => {
        const { fake, options } = fakeDriverParts();
        const driver = new GDBDriver({ ...options, startupMs: 200 });
        const startPromise = driver.start('/tmp/job/main');
        fake.exit(127);
        await expect(startPromise).rejects.toThrow(/exited immediately with code 127/);
    });

    it('fails when the process cannot be spawned', async () => {
        const { fake, options } = fakeDriverParts();
        const driver = new GDBDriver({ ...options, startupMs: 200 });
        const startPromise = driver.start('/tmp/job/main');
        fake.emit('error', new Error('ENOENT'));
        await expect(startPromise).rejects.toThrow(/GDB not found/);
    });

    // An 'error' with no listener at all is an uncaughtException, which takes
    // the server down rather than failing one request. start() used to drop
    // every listener once it considered GDB up.
    it('still has an error listener after start-up', async () => {
        const { fake } = await started();
        expect(fake.listenerCount('error')).toBeGreaterThan(0);
        expect(() => fake.emit('error', new Error('late failure'))).not.toThrow();
    });
});

describe('GDBDriver command/result matching', () => {
    it('resolves a command with its own token, not whichever answer arrives', async () => {
        const { driver, fake } = await started();

        const first = driver.getCallStack();
        await Promise.resolve();
        const second = driver.evaluateExpression('x');
        await Promise.resolve();

        expect(fake.written.length).toBe(2);
        const [t1, t2] = [fake.tokenOf(0), fake.tokenOf(1)];
        expect(t1).not.toBe(t2);

        // Answer them out of order — the later command first.
        fake.say(`${t2}^done,value="41"`);
        fake.say(`${t1}^done,stack=[frame={func="main"},frame={func="solve"}]`);

        await expect(second).resolves.toBe('41');
        await expect(first).resolves.toEqual(['solve', 'main']);
    });

    it('ignores a result for a token nobody is waiting on', async () => {
        const { driver, fake } = await started();
        const pending = driver.evaluateExpression('x');
        await Promise.resolve();

        fake.say('999^done,value="stray"');
        fake.say(`${fake.tokenOf(0)}^done,value="mine"`);

        await expect(pending).resolves.toBe('mine');
    });

    it('reassembles a record split across two chunks', async () => {
        const { driver, fake } = await started();
        const pending = driver.evaluateExpression('x');
        await Promise.resolve();
        const tok = fake.tokenOf(0);

        fake.sayRaw(`${tok}^done,val`);
        fake.sayRaw('ue="split"\n');

        await expect(pending).resolves.toBe('split');
    });

    it('drops console and log stream records', async () => {
        const { driver, fake } = await started();
        const pending = driver.evaluateExpression('x');
        await Promise.resolve();
        const tok = fake.tokenOf(0);

        fake.say('~"some console chatter"', '&"a log line"', '(gdb)', '=thread-created,id="1"');
        fake.say(`${tok}^done,value="7"`);

        await expect(pending).resolves.toBe('7');
    });

    it('refuses to send once the pipe is closed', async () => {
        const { driver, fake } = await started();
        fake.stdin.writable = false;
        // The high-level calls swallow the rejection and return their empty value.
        await expect(driver.getCallStack()).resolves.toEqual([]);
    });

    // compiler.ts learned this the hard way: an unhandled stream error is an
    // uncaught exception, not a failed request. The pipe breaking is survivable
    // but not *detected* — the command waits out its full 8s MI timeout rather
    // than failing when the write does. Worth knowing; pinned here so a future
    // fast-fail shows up as a test that needs updating rather than a surprise.
    it('survives the write pipe breaking mid-command', async () => {
        const { driver, fake } = await started();
        fake.stdinBroken = true;
        const t0 = Date.now();
        await expect(driver.getCallStack()).resolves.toEqual([]);
        expect(Date.now() - t0).toBeGreaterThan(7000);
    }, 20_000);
});

describe('GDBDriver stop events', () => {
    it('resolves the waiter with the parsed frame', async () => {
        const { driver, fake } = await started();
        const stopped = driver.runWithRedirect('/tmp/job/in', '/tmp/job/out');
        await Promise.resolve();

        // The command has to be acknowledged first — runWithRedirect awaits the
        // MI result before handing back the stop promise. Real GDB answers the
        // console `run` with ^running.
        fake.say(`${fake.tokenOf(0)}^running`);
        fake.say(STOP_MAIN);

        await expect(stopped).resolves.toEqual({
            reason: 'breakpoint-hit', line: 12, file: 'main.cpp', func: 'main',
        });
    });

    it('sends the redirect quoted, as one console command', async () => {
        const { driver, fake } = await started();
        const stopped = driver.runWithRedirect('/tmp/job/in', '/tmp/job/out');
        await Promise.resolve();

        expect(fake.written[0]).toContain('interpreter-exec console "run < \\"/tmp/job/in\\" > \\"/tmp/job/out\\""');

        fake.say(`${fake.tokenOf(0)}^running`, STOP_MAIN);
        await stopped;
    });

    // next() arms a 6s stop wait, then awaits an MI command whose own timeout is
    // 8s. When GDB answers neither, the stop rejects two seconds before anything
    // is awaiting it — an unhandled rejection, which Node treats as fatal by
    // default. Caught by these tests; the wait now claims its own rejection.
    it('returns null from next() when no stop ever arrives, without an unhandled rejection', async () => {
        const { options } = fakeDriverParts();
        const driver = new GDBDriver(options);
        await driver.start('/tmp/job/main');

        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => unhandled.push(reason);
        process.on('unhandledRejection', onUnhandled);
        try {
            await expect(driver.next()).resolves.toBeNull();
            await new Promise(r => setTimeout(r, 300));
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
        expect(unhandled).toEqual([]);
    }, 25_000);
});

describe('GDBDriver teardown', () => {
    it('asks GDB to exit and returns quickly', async () => {
        const { driver, fake } = await started();
        const t0 = Date.now();
        const quitting = driver.quit();
        fake.exit(0);
        await quitting;
        expect(fake.written.some(l => l.includes('gdb-exit'))).toBe(true);
        expect(Date.now() - t0).toBeLessThan(900);
    });

    // once('exit') never fires for a process that already exited, so waiting on
    // it burned the full grace period on every error path.
    it('returns immediately when the process is already gone', async () => {
        const { driver, fake } = await started();
        fake.exit(1);
        const t0 = Date.now();
        await driver.quit();
        expect(Date.now() - t0).toBeLessThan(200);
    });

    it('is safe to call twice', async () => {
        const { driver, fake } = await started();
        fake.exit(0);
        await driver.quit();
        await expect(driver.quit()).resolves.toBeUndefined();
    });

    // Timers left armed fire later against a process that no longer exists.
    it('settles commands still in flight instead of leaving them hanging', async () => {
        const { driver, fake } = await started();
        const pending = driver.evaluateExpression('x');
        await Promise.resolve();
        fake.exit(0);
        await driver.quit();
        // evaluateExpression swallows the rejection; the point is that it settles.
        await expect(pending).resolves.toBe('');
    });

    it('settles a pending stop wait too', async () => {
        const { driver, fake } = await started();
        const stepping = driver.next();
        await Promise.resolve();
        fake.exit(0);
        await driver.quit();
        await expect(stepping).resolves.toBeNull();
    });
});
