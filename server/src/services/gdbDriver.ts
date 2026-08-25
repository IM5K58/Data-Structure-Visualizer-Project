/**
 * GDB Machine Interface (MI) driver.
 *
 * Owns exactly one GDB process: spawning it, speaking MI to it, and taking it
 * down again. What to ask it for lives one level up, in traceSession.ts.
 */

import { spawn, ChildProcess } from 'child_process';
import { dirname } from 'path';
import { rlimitWrapperPrefix } from './compiler.js';
import { childEnv } from './childEnv.js';
import { parseMI } from './miParser.js';
import { stripGDBAnnotation, strOf } from './gdbValues.js';
import type { GDBLocal, GDBField, GDBStopInfo } from './gdbTypes.js';

const GDB_PATH = process.env.GDB_PATH ?? (process.platform === 'win32'
    ? 'C:\\msys64\\ucrt64\\bin\\gdb.exe'
    : '/usr/bin/gdb');

/** Set VERBOSE_MI_LOG=true to echo every GDB/MI line — very noisy, debugging only. */
const VERBOSE_MI_LOG = process.env.VERBOSE_MI_LOG === 'true';

/**
 * The console command that runs the inferior with its stdin and stdout
 * redirected to files. Exported and pure so CI, which has no gdb, can pin the
 * exact string it produces.
 *
 * The paths are quoted. They did not used to be, and the comment explaining why
 * was wrong on both counts:
 *
 *   "Temp paths are UUID-based so they never contain spaces" — true of the job
 *   directory, not of its parent. getTempBase() returns os.tmpdir() off Linux,
 *   which on Windows is C:\Users\<name>\AppData\Local\Temp. Any account name
 *   with a space in it lands here.
 *
 *   "Inner quotes break the MI string parser" — only unescaped ones. This
 *   string is embedded in `interpreter-exec console "<here>"`, so its quotes
 *   have to be escaped, and GDB then accepts them.
 *
 * Measured against gdb 16.3 with a space in the path. Unquoted, GDB does report
 * the problem — as `&"warning: Error in redirection: No such file or
 * directory."` — but that is the stream channel, which handleLine() drops on
 * sight. No ^error is ever produced, so sendMI resolves normally and the driver
 * learns nothing. The program then runs with no redirect at all, which means
 * its stdin and stdout are GDB's own MI pipes:
 *
 *   - stdin is never delivered, so a program that reads it blocks until
 *     waitStop() times out 12s later;
 *   - a program that does not block writes its output INTO the MI stream, where
 *     the parser reads it as MI records — user C++ can forge *stopped there;
 *   - programOutput is empty either way, because the file is never created.
 *
 * Quoted, the same run completes and the output file is correct.
 */
export function buildRunRedirect(
    stdinFile: string,
    stdoutFile: string,
    platform: NodeJS.Platform = process.platform,
): string {
    const quote = (file: string): string => {
        // GDB wants forward slashes on Windows. Not on POSIX, where a backslash
        // is a legal filename character and rewriting it would name a different
        // file — so there it stays, and is rejected below instead.
        const path = platform === 'win32' ? file.replace(/\\/g, '/') : file;
        // On Linux `run` is handed to /bin/sh, so these keep their meaning even
        // inside the quotes. All are legal in a POSIX filename. Refuse loudly
        // rather than emit a command that quietly means something else — the
        // silent version of this is the bug being fixed.
        if (/["`$\n\\]/.test(path)) {
            throw new Error(`GDB redirect path contains an unquotable character: ${path}`);
        }
        return `\\"${path}\\"`;
    };
    return `run < ${quote(stdinFile)} > ${quote(stdoutFile)}`;
}

/** How long GDB gets to exit on its own before it is signalled. */
const QUIT_GRACE_MS = 1000;

/**
 * How a GDB process gets created. The class is otherwise entirely about the MI
 * protocol — tokens, pending commands, stop events, timers — and that is the
 * part worth testing, so it is the one thing that gets injected.
 */
export type GdbSpawner = (binaryPath: string) => ChildProcess;

const spawnGdbProcess: GdbSpawner = (binaryPath) => spawn(GDB_PATH, [
    '--interpreter=mi2',
    '--quiet',
    '--nx',
    binaryPath,
], {
    stdio: ['pipe', 'pipe', 'ignore'],
    // An allowlist, not process.env. GDB passes its environment straight to the
    // inferior, so anything here is readable by the user's own C++ via
    // getenv(). childEnv() also puts the MSYS2 DLL directory on PATH, which a
    // compiled binary needs to start on Windows.
    env: childEnv(),
    // cwd is the job directory, not the server's. GDB passes its cwd to the
    // inferior, and the server runs out of server/ — the directory holding
    // .env — so `fopen(".env")` in the traced program read the secret straight
    // off disk, with no path to guess and nothing the environment allowlist
    // could do about it. Reproduced before this was added.
    cwd: dirname(binaryPath),
});

export interface GDBDriverOptions {
    /** Override how GDB is created. Tests pass a fake process here. */
    spawn?: GdbSpawner;
    /** How long GDB gets to initialise before start() resolves. */
    startupMs?: number;
}

interface PendingCmd {
    resolve: (r: { class: string; results: Record<string, unknown> }) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class GDBDriver {
    private proc: ChildProcess | null = null;
    private rawBuf = '';
    private token = 100;
    private pending = new Map<number, PendingCmd>();
    private stopResolve: ((i: GDBStopInfo) => void) | null = null;
    private stopReject: ((e: Error) => void) | null = null;
    private stopTimer: ReturnType<typeof setTimeout> | null = null;

    private readonly spawnGdb: GdbSpawner;
    private readonly startupMs: number;

    constructor(options: GDBDriverOptions = {}) {
        this.spawnGdb = options.spawn ?? spawnGdbProcess;
        this.startupMs = options.startupMs
            ?? (process.platform === 'win32' ? 1500 : 800);
    }

    async start(binaryPath: string): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            // GDB itself is deliberately not rlimited — it needs heap room for
            // its own state. The limits go on the inferior instead, via
            // `set exec-wrapper` once GDB is up.
            this.proc = this.spawnGdb(binaryPath);

            this.proc.stdout!.setEncoding('utf-8');
            this.proc.stdout!.on('data', (chunk: string) => {
                this.rawBuf += chunk;
                this.flush();
            });

            // A stream error is not covered by the process 'error' event, and an
            // unhandled one on a pipe takes the server down. compiler.ts:238
            // carries the same guard.
            this.proc.stdin!.on('error', () => { /* GDB closed the pipe */ });

            // Fail immediately if GDB executable is not found
            const onStartError = (err: Error) => {
                reject(new Error(`GDB not found at "${GDB_PATH}": ${err.message}`));
            };
            // If GDB exits immediately (bad binary, wrong arch, etc.) → reject
            const onStartExit = (code: number | null) => {
                clearTimeout(t);
                reject(new Error(`GDB exited immediately with code ${code}`));
            };
            this.proc.once('error', onStartError);
            this.proc.once('exit', onStartExit);

            // Give GDB time to initialize, then drop the two start-up listeners.
            // Drop exactly those two, not every listener: an 'error' event with
            // no listener at all is an uncaughtException, which would kill the
            // server rather than fail the request.
            const t = setTimeout(() => {
                this.proc!.removeListener('error', onStartError);
                this.proc!.removeListener('exit', onStartExit);
                this.proc!.on('error', () => { /* reported through the MI calls */ });
                resolve();
            }, this.startupMs);
        });
    }

    private flush(): void {
        const lines = this.rawBuf.split('\n');
        this.rawBuf = lines.pop() ?? '';
        for (const line of lines) {
            const trimmed = line.trim();
            // Off by default: this is thousands of lines per request, and the MI
            // payloads echo user source and variable values into the logs.
            if (trimmed && VERBOSE_MI_LOG) console.log('  [GDB raw]', trimmed);
            this.handleLine(trimmed);
        }
    }

    private handleLine(line: string): void {
        if (!line || line === '(gdb)' || line.startsWith('~"') || line.startsWith('&"')) return;

        // Result record: <token>^<class>[,<results>]
        const rr = line.match(/^(\d+)\^(\w+)(?:,(.+))?$/);
        if (rr) {
            const tok = parseInt(rr[1]);
            const cls = rr[2];
            const rest = rr[3] ?? '';
            const cmd = this.pending.get(tok);
            if (cmd) {
                clearTimeout(cmd.timer);
                this.pending.delete(tok);
                cmd.resolve({ class: cls, results: parseMI(rest) });
            }
            return;
        }

        // Async stop record
        if (line.startsWith('*stopped')) {
            const rest = line.slice('*stopped'.length);
            const results = rest.startsWith(',') ? parseMI(rest.slice(1)) : {};
            const frame = results['frame'] as Record<string, unknown> ?? {};
            const info: GDBStopInfo = {
                reason: strOf(results['reason']) || 'unknown',
                line: parseInt(strOf(frame['line'])) || 0,
                file: strOf(frame['file']),
                func: strOf(frame['func']),
            };
            if (this.stopResolve) {
                if (this.stopTimer) clearTimeout(this.stopTimer);
                const resolve = this.stopResolve;
                this.stopResolve = null;
                this.stopReject = null;
                resolve(info);
            }
        }
        // Ignore *running, =thread-*, =library-*, etc.
    }

    private sendMI(cmd: string): Promise<{ class: string; results: Record<string, unknown> }> {
        if (!this.proc?.stdin?.writable) {
            return Promise.reject(new Error('GDB stdin not writable'));
        }
        const tok = this.token++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(tok);
                reject(new Error(`GDB MI timeout: ${cmd}`));
            }, 8000);
            this.pending.set(tok, { resolve, reject, timer });
            this.proc!.stdin!.write(`${tok}-${cmd}\n`);
        });
    }

    private waitStop(ms = 12000): Promise<GDBStopInfo> {
        const waiting = new Promise<GDBStopInfo>((resolve, reject) => {
            this.stopResolve = resolve;
            this.stopReject = reject;
            this.stopTimer = setTimeout(() => {
                this.stopResolve = null;
                this.stopReject = null;
                reject(new Error('GDB stop timeout'));
            }, ms);
        });

        // Every caller arms this wait BEFORE awaiting the MI command that will
        // cause the stop, and some of them wait for less time than sendMI's own
        // 8s timeout — next() gives it 6s, finishInferior 3s. In that window the
        // rejection lands with nothing attached to it yet, and an unhandled
        // rejection is fatal to the process by default in Node. Claim it here;
        // the real awaiter still sees the rejection through `waiting`.
        waiting.catch(() => { /* the caller handles the real one */ });
        return waiting;
    }

    async setBreakpoint(location: string): Promise<void> {
        await this.sendMI(`break-insert -f ${location}`).catch(() => {});
    }

    /**
     * Apply per-inferior resource limits via GDB's exec-wrapper.
     * No-op on non-Linux. Must be called BEFORE running the inferior.
     */
    async applyExecWrapper(): Promise<void> {
        const wrapper = rlimitWrapperPrefix();
        if (!wrapper) return;   // not Linux, or limits deliberately disabled

        // This is the ONLY thing capping the traced program's CPU, memory, file
        // size and process count. Losing it silently means arbitrary user C++
        // runs unbounded — the exact hole compiler.ts refuses to start with — so
        // failure is fatal to the session rather than swallowed.
        //
        // Both failure shapes have to be handled. The `.catch(() => {})` that
        // used to be here covered only a rejected promise (stdin closed, MI
        // timeout); a failure GDB itself reports comes back as a *resolved*
        // result whose class is 'error', which it never saw at all.
        const res = await this.sendMI(`interpreter-exec console "set exec-wrapper ${wrapper}"`);
        if (res.class !== 'done') {
            const msg = typeof res.results.msg === 'string' ? res.results.msg : res.class;
            throw new Error(`GDB rejected the resource-limit wrapper: ${msg}`);
        }
    }

    async runWithRedirect(stdinFile: string, stdoutFile: string): Promise<GDBStopInfo> {
        // Built before waitStop(): a bad path throws, and throwing after the
        // wait is armed would strand stopTimer and stopResolve.
        const cmd = buildRunRedirect(stdinFile, stdoutFile);
        const stopPromise = this.waitStop();
        await this.sendMI(`interpreter-exec console "${cmd}"`).catch(() => {});
        return stopPromise;
    }

    async run(): Promise<GDBStopInfo> {
        const stopPromise = this.waitStop();
        await this.sendMI('exec-run').catch(() => {});
        return stopPromise;
    }

    /**
     * Let the program finish on its own, so its output actually gets written.
     *
     * The stepping loop can end with the inferior still alive. On Linux stepping
     * past the end of main lands in libc, which has no debug info, and exec-next
     * fails there with "Cannot find bounds of current function" — measured
     * inside the deployment container. Tearing the session down at that point
     * kills the program mid-flight, and `printf` to a redirected file is fully
     * buffered: it only flushes at exit. So the captured output came back empty
     * even though the program had produced all of it.
     *
     * Bounded, because "finish on its own" is not guaranteed — a program blocked
     * on input never will. quit() kills it in that case, same as before.
     */
    async finishInferior(ms = 3000): Promise<void> {
        try {
            const stopped = this.waitStop(ms);
            await this.sendMI('exec-continue').catch(() => {});
            await stopped;
        } catch { /* did not finish in time; teardown handles it */ }
    }

    async next(): Promise<GDBStopInfo | null> {
        try {
            const stopPromise = this.waitStop(6000);
            await this.sendMI('exec-next').catch(() => {});
            return await stopPromise;
        } catch {
            return null;
        }
    }

    /**
     * Returns the current call stack, outermost → innermost function names.
     * For visualization (recursion / function-call hierarchy).
     */
    async getCallStack(): Promise<string[]> {
        try {
            const res = await this.sendMI('stack-list-frames');
            if (res.class !== 'done') return [];
            const stack = res.results['stack'];
            if (!Array.isArray(stack)) return [];
            // Frames come back with `level` and `func`. GDB orders innermost first
            // (level=0 = current), so we reverse for outermost-first.
            const frames = (stack as unknown[])
                .map(f => {
                    const obj = f as Record<string, unknown>;
                    return strOf(obj['func']) || '<unknown>';
                })
                .reverse();
            return frames;
        } catch {
            return [];
        }
    }

    async getLocals(): Promise<GDBLocal[]> {
        try {
            const res = await this.sendMI('stack-list-locals 2');
            if (res.class !== 'done') return [];
            const locals = res.results['locals'];
            if (!Array.isArray(locals)) return [];
            return (locals as unknown[]).map((l) => {
                const obj = l as Record<string, unknown>;
                const rawValue = strOf(obj['value']);
                return {
                    name: strOf(obj['name']),
                    type: strOf(obj['type']),
                    value: stripGDBAnnotation(rawValue),
                    rawValue,
                };
            }).filter(l => l.name);
        } catch {
            return [];
        }
    }

    /** Inspect pointer variable and return struct fields */
    async inspectPointer(expr: string): Promise<GDBField[]> {
        const varName = `vtmp${this.token}`; // must start with a letter (GDB rejects __ prefix)
        try {
            const createRes = await this.sendMI(`var-create ${varName} * ${expr}`);
            if (createRes.class !== 'done') return [];

            const fields = await this.listChildrenFlat(varName);
            await this.sendMI(`var-delete ${varName}`).catch(() => {});
            return fields;
        } catch {
            await this.sendMI(`var-delete ${varName}`).catch(() => {});
            return [];
        }
    }

    /**
     * Recursively expand GDB var children, flattening access-specifier
     * pseudo-nodes (public / private / protected) that GDB inserts for C++ structs.
     */
    private async listChildrenFlat(varName: string): Promise<GDBField[]> {
        const childRes = await this.sendMI(`var-list-children --all-values ${varName}`);
        if (childRes.class !== 'done') return [];
        const children = childRes.results['children'];
        if (!Array.isArray(children)) return [];

        const fields: GDBField[] = [];
        for (const c of children as unknown[]) {
            const obj = c as Record<string, unknown>;
            const exp  = strOf(obj['exp']  ?? obj['name']); // display name
            const gdbVarName = strOf(obj['name']);           // GDB internal var name for recursion

            // GDB wraps C++ struct members in access-specifier pseudo-children
            if (exp === 'public' || exp === 'private' || exp === 'protected') {
                const sub = await this.listChildrenFlat(gdbVarName);
                fields.push(...sub);
                continue;
            }

            if (!exp || exp.startsWith('__')) continue;

            fields.push({
                name:  exp,
                type:  strOf(obj['type']),
                value: stripGDBAnnotation(strOf(obj['value'])),
            });
        }
        return fields;
    }

    /**
     * Evaluate a C++ expression in the current frame and return its value string.
     */
    async evaluateExpression(expr: string): Promise<string> {
        try {
            const escaped = expr.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const res = await this.sendMI(`data-evaluate-expression "${escaped}"`);
            if (res.class !== 'done') return '';
            return stripGDBAnnotation(strOf(res.results['value']));
        } catch {
            return '';
        }
    }

    /**
     * List direct children of a GDB var object for a value-type struct.
     * - Recurses into access-specifier pseudo-nodes (public/private/protected).
     * - Arrays: recorded as { value: "[size]" } without fetching elements.
     * - Scalars: value read via C++ expression using cppPath.fieldName.
     * - Nested structs: skipped (numchild > 0, not array, not access specifier).
     */
    private async listValueStructFields(gdbVarName: string, cppPath: string): Promise<GDBField[]> {
        const res = await this.sendMI(`var-list-children ${gdbVarName}`);
        if (res.class !== 'done') return [];
        const children = res.results['children'];
        if (!Array.isArray(children)) return [];

        const fields: GDBField[] = [];
        for (const c of children as unknown[]) {
            const obj   = c as Record<string, unknown>;
            const exp   = strOf(obj['exp']  ?? obj['name']);
            const child = strOf(obj['name']);
            const type  = strOf(obj['type']);
            const numchild = parseInt(strOf(obj['numchild'])) || 0;

            if (exp === 'public' || exp === 'private' || exp === 'protected') {
                const sub = await this.listValueStructFields(child, cppPath);
                fields.push(...sub);
                continue;
            }
            if (!exp || exp.startsWith('__')) continue;

            if (type.includes('[')) {
                // Array field: store element count as value, do not fetch elements here
                fields.push({ name: exp, type, value: `[${numchild}]` });
            } else if (numchild === 0) {
                // Scalar field: read via C++ expression
                const val = await this.evaluateExpression(`${cppPath}.${exp}`);
                fields.push({ name: exp, type, value: val });
            }
            // Nested structs (numchild > 0, not array) → skip for now
        }
        return fields;
    }

    /**
     * Enumerate entries of a libstdc++ map / unordered_map via the pretty
     * printer's children. Best-effort: returns [] on any error or unsupported
     * GDB version. Children format we care about (libstdc++):
     *   children=[
     *     child={exp="[<key>]", value="<value>", type="..."},
     *     ...
     *   ]
     * Older versions expose alternating key/value pairs as separate children.
     * We handle both.
     */
    async enumerateMapEntries(varName: string): Promise<{ key: string; value: string }[]> {
        const tmp = `vmap${this.token}`;
        try {
            const created = await this.sendMI(`var-create ${tmp} * ${varName}`);
            if (created.class !== 'done') return [];
            const numchild = parseInt(strOf(created.results['numchild'])) || 0;
            if (numchild === 0) {
                await this.sendMI(`var-delete ${tmp}`).catch(() => {});
                return [];
            }
            const childRes = await this.sendMI(`var-list-children --all-values ${tmp}`);
            await this.sendMI(`var-delete ${tmp}`).catch(() => {});
            if (childRes.class !== 'done') return [];
            const children = childRes.results['children'];
            if (!Array.isArray(children)) return [];

            const entries: { key: string; value: string }[] = [];
            const flat: { exp: string; value: string }[] = [];
            for (const c of children as unknown[]) {
                const obj = c as Record<string, unknown>;
                flat.push({
                    exp: strOf(obj['exp'] ?? obj['name']),
                    value: stripGDBAnnotation(strOf(obj['value'])),
                });
            }

            // Format A: each child has exp like "[42]" or "[\"foo\"]" with value
            const formatA = flat.every(c => /^\[.+\]$/.test(c.exp));
            if (formatA) {
                for (const c of flat) {
                    const key = c.exp.replace(/^\[(.*)\]$/, '$1');
                    entries.push({ key, value: c.value });
                }
                return entries;
            }

            // Format B: alternating key/value children (older libstdc++)
            for (let i = 0; i + 1 < flat.length; i += 2) {
                entries.push({ key: flat[i].value, value: flat[i + 1].value });
            }
            return entries;
        } catch {
            await this.sendMI(`var-delete ${tmp}`).catch(() => {});
            return [];
        }
    }

    /**
     * Inspect a value-type (stack-allocated) struct local variable.
     * Returns its scalar fields and array-field metadata.
     */
    async inspectValueStruct(varName: string): Promise<GDBField[]> {
        const tmpName = `vstv${this.token}`;
        try {
            const createRes = await this.sendMI(`var-create ${tmpName} * ${varName}`);
            if (createRes.class !== 'done') return [];
            const fields = await this.listValueStructFields(tmpName, varName);
            await this.sendMI(`var-delete ${tmpName}`).catch(() => {});
            return fields;
        } catch {
            await this.sendMI(`var-delete ${tmpName}`).catch(() => {});
            return [];
        }
    }

    /**
     * Tear the session down. Safe to call twice, and safe on a driver that never
     * started — callers reach it from both the happy path and the catch.
     */
    async quit(): Promise<void> {
        // Settle everything in flight first. These timers used to stay armed
        // after teardown and fire seconds later against a process that no longer
        // existed, rejecting into nothing.
        for (const p of this.pending.values()) {
            clearTimeout(p.timer);
            p.reject(new Error('GDB session closed'));
        }
        this.pending.clear();

        if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
        const stopReject = this.stopReject;
        this.stopResolve = null;
        this.stopReject = null;
        stopReject?.(new Error('GDB session closed'));

        // Claim the handle before awaiting, so a second call has nothing to do.
        const proc = this.proc;
        this.proc = null;
        if (!proc) return;

        // Already gone: return now. once('exit') does NOT fire for a process
        // that exited before the listener was attached — measured — so the old
        // code sat through its full 1000ms fallback on every error path and then
        // signalled a pid that was no longer there.
        if (proc.exitCode !== null || proc.signalCode !== null) return;

        try { proc.stdin?.write('-gdb-exit\n'); } catch { /* pipe already closed */ }

        // Only GDB is signalled. Killing its process group would need `detached`
        // at spawn, and the premise for that — that Linux leaves the tracee
        // running when the tracer dies — did not hold up: GDB sets
        // PTRACE_O_EXITKILL on inferiors it starts, and it may put the inferior
        // in its own group anyway, which a group kill would miss. Changing
        // signal delivery on a platform this box cannot test is not worth it.
        await new Promise<void>((resolve) => {
            const t = setTimeout(() => {
                try { proc.kill('SIGKILL'); } catch { /* already gone */ }
                resolve();
            }, QUIT_GRACE_MS);
            proc.once('exit', () => { clearTimeout(t); resolve(); });
        });
    }
}
