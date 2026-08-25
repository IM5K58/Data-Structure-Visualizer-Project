import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';

/**
 * A stand-in for the GDB process, so the MI protocol can be tested without a
 * debugger, a compiler or a binary.
 *
 * The driver only ever touches a handful of things on a ChildProcess: stdout's
 * 'data', stdin's `writable`/`write`/'error', the process-level 'error' and
 * 'exit', `kill`, `exitCode` and `signalCode`. That is the whole surface this
 * fake has to provide.
 */
export class FakeGdb extends EventEmitter {
    /** Every MI line the driver has written, in order, newline stripped. */
    readonly written: string[] = [];

    exitCode: number | null = null;
    signalCode: NodeJS.Signals | null = null;
    readonly pid = 4242;

    readonly stdout = new EventEmitter() as EventEmitter & { setEncoding(e: string): void };
    readonly stdin: EventEmitter & { writable: boolean; write(chunk: string): boolean };

    /** Set to make writes fail the way a closed pipe does. */
    stdinBroken = false;

    constructor() {
        super();
        (this.stdout as { setEncoding(e: string): void }).setEncoding = () => {};

        const written = this.written;
        const isBroken = () => this.stdinBroken;
        const stdin = new EventEmitter() as EventEmitter & {
            writable: boolean; write(chunk: string): boolean;
        };
        stdin.writable = true;
        stdin.write = (chunk: string) => {
            if (isBroken()) {
                stdin.emit('error', Object.assign(new Error('EPIPE'), { code: 'EPIPE' }));
                return false;
            }
            for (const line of chunk.split('\n')) {
                if (line.trim()) written.push(line);
            }
            return true;
        };
        this.stdin = stdin;
    }

    /** Feed lines to the driver exactly as GDB's stdout would. */
    say(...lines: string[]): void {
        this.stdout.emit('data', lines.join('\n') + '\n');
    }

    /** Feed a partial chunk, to exercise the driver's line buffering. */
    sayRaw(chunk: string): void {
        this.stdout.emit('data', chunk);
    }

    /** The token the driver used for the Nth command it sent (0-based). */
    tokenOf(index: number): string {
        return this.written[index].split('-')[0];
    }

    kill(signal?: NodeJS.Signals): boolean {
        this.signalCode = signal ?? 'SIGTERM';
        this.stdin.writable = false;
        queueMicrotask(() => this.emit('exit', null, this.signalCode));
        return true;
    }

    /** Simulate GDB exiting on its own. */
    exit(code = 0): void {
        this.exitCode = code;
        this.stdin.writable = false;
        this.emit('exit', code, null);
    }

    asChildProcess(): ChildProcess {
        return this as unknown as ChildProcess;
    }
}

/** A driver wired to a fake, with a startup delay short enough for tests. */
export function fakeDriverParts(): { fake: FakeGdb; options: { spawn: () => ChildProcess; startupMs: number } } {
    const fake = new FakeGdb();
    return { fake, options: { spawn: () => fake.asChildProcess(), startupMs: 5 } };
}
