/**
 * One trace session: drive GDB through a program and collect a snapshot per
 * line.
 *
 * Split out of the driver because it is a different job. The driver speaks MI
 * to one process; this decides what to ask for, when to stop asking, and how to
 * leave things when it does.
 */

import { rm, stat, open, writeFile } from 'fs/promises';
import { GDBDriver } from './gdbDriver.js';
import { intFromEnv } from '../env.js';
import { isPointerType, isNullPointer, isStructType, isIntegralType, detectSTL } from './gdbValues.js';
import type { GDBSnapshot, GDBStopInfo, GDBField, STLSnapshot } from './gdbTypes.js';

const MAX_STEPS = 500;
/** Wall-clock budget for one whole trace session, independent of the step cap. */
const SESSION_BUDGET_MS = intFromEnv('GDB_SESSION_BUDGET_MS', 45_000);
/** Cap on how much of the traced program's stdout we read back. */
const MAX_OUTPUT_BYTES = intFromEnv('MAX_OUTPUT_BYTES', 1024 * 1024);
/**
 * Largest container size treated as real. Anything past this is uninitialised
 * memory being read as a size, not a container anyone is visualising — nothing
 * on screen can show thousands of elements usefully anyway.
 */
const MAX_CONTAINER_ELEMENTS = intFromEnv('MAX_CONTAINER_ELEMENTS', 4096);

export interface GDBSessionResult {
    snapshots: GDBSnapshot[];
    programOutput: string;
    timedOut: boolean;
    error?: string;
    /** The caller asked to stop; whatever is here is a partial trace nobody
     *  is waiting for. */
    aborted?: boolean;
}

function delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

function isTerminalReason(reason: string): boolean {
    return reason.startsWith('exited') || reason === 'signal-received';
}

/**
 * GDB 세션을 실행하여 라인별 변수 스냅샷을 수집합니다.
 */
export async function runGDBSession(
    binaryPath: string,
    stdinContent: string,
    /** Checked once per step. Return true to stop early — used to drop the work
     *  when the client that asked for it has gone away. */
    shouldAbort: () => boolean = () => false,
): Promise<GDBSessionResult> {
    const stdinFile = `${binaryPath}.stdin`;
    const stdoutFile = `${binaryPath}.stdout`;

    await writeFile(stdinFile, stdinContent, 'utf-8');
    await writeFile(stdoutFile, '', 'utf-8');

    const driver = new GDBDriver();
    let timedOut = false;
    let aborted = false;

    try {
        console.log('  [GDB] starting with binary:', binaryPath);
        await driver.start(binaryPath);
        console.log('  [GDB] started OK, setting breakpoint at main');
        await driver.setBreakpoint('main');
        await driver.applyExecWrapper();
        console.log('  [GDB] breakpoint set, running with redirect');

        let stop: GDBStopInfo;
        try {
            stop = await driver.runWithRedirect(stdinFile, stdoutFile);
            console.log('  [GDB] initial stop:', stop.reason, 'at line', stop.line, 'func', stop.func);
        } catch (e) {
            console.error('  [GDB] runWithRedirect failed:', e);
            // GDB is already running by this point, and the finally below only
            // deletes the redirect files — without this the process was leaked
            // on every failed start.
            await driver.quit().catch(() => {});
            const detail = e instanceof Error ? e.message : String(e);
            return { snapshots: [], programOutput: '', timedOut: false, error: `GDB failed to start the program: ${detail}` };
        }

        // Remember the user's source file path from the first stop
        const userSrcFile = stop.file; // e.g. "C:/Temp/.../main.cpp"

        const snapshots: GDBSnapshot[] = [];
        let steps = 0;
        // MAX_STEPS alone does not bound wall-clock time: each step issues one
        // `exec-next` plus up to ~50 pointer inspections and per-container
        // evaluations, each with its own MI timeout. Without a deadline a single
        // request can hold a GDB process for many minutes.
        const deadline = Date.now() + SESSION_BUDGET_MS;

        while (steps < MAX_STEPS) {
            if (isTerminalReason(stop.reason)) break;

            // Nobody is waiting for this any more. Stop stepping; the teardown
            // below still runs, so GDB and the program are cleaned up properly.
            if (shouldAbort()) {
                console.log(`  [GDB] abandoning trace after ${steps} steps — caller gave up`);
                aborted = true;
                break;
            }

            // Execution has left the user's code for good. Stepping off the end
            // of main lands in libc, which has no source and no debug info, and
            // exec-next fails there — so this used to run on until the step
            // failed and the whole trace got reported as truncated, when in fact
            // every line of the user's program had been captured.
            //
            // Safe because the loop steps with exec-next, which steps OVER
            // calls: a stop can only lack a source file once main has returned.
            // Revisit if this ever moves to exec-step.
            if (!stop.file && snapshots.length > 0) break;

            if (Date.now() > deadline) {
                console.warn(`  [GDB] session budget of ${SESSION_BUDGET_MS}ms exhausted after ${steps} steps`);
                timedOut = true;
                break;
            }

            // Skip CRT/runtime frames — only collect snapshots inside user source
            if (stop.file && userSrcFile && stop.file !== userSrcFile) {
                const nextStop = await driver.next();
                if (!nextStop) { timedOut = true; break; }
                stop = nextStop;
                steps++;
                continue;
            }

            // Capture local variables at this line
            const locals = await driver.getLocals();

            // BFS traversal of the pointer graph starting from local pointer variables.
            // This discovers nodes reachable only via struct fields (e.g. head->next->next)
            // in addition to nodes directly pointed to by locals.
            const structData = new Map<string, GDBField[]>();
            {
                const visited = new Set<string>();
                const bfsQueue: Array<{ expr: string; addr: string }> = [];
                const MAX_NODES = 50;

                for (const local of locals) {
                    if (isPointerType(local.type) && !isNullPointer(local.value) && !visited.has(local.value)) {
                        bfsQueue.push({ expr: local.name, addr: local.value });
                    }
                }

                while (bfsQueue.length > 0 && visited.size < MAX_NODES) {
                    const item = bfsQueue.shift()!;
                    if (visited.has(item.addr)) continue;
                    visited.add(item.addr);

                    const fields = await driver.inspectPointer(item.expr);
                    if (fields.length === 0) continue;
                    structData.set(item.addr, fields);

                    for (const f of fields) {
                        if (isPointerType(f.type) && !isNullPointer(f.value) && !visited.has(f.value)) {
                            bfsQueue.push({ expr: `${item.expr}->${f.name}`, addr: f.value });
                        }
                    }
                }
            }

            // Detect STL containers (std::stack / queue / priority_queue / vector / deque)
            // by evaluating .size() and the most-recently-pushed element.
            const stlContainers = new Map<string, STLSnapshot>();
            for (const local of locals) {
                if (isPointerType(local.type)) continue;
                const kind = detectSTL(local.type);
                if (!kind) continue;

                const sizeStr = await driver.evaluateExpression(`${local.name}.size()`);
                const size = parseInt(sizeStr);
                if (isNaN(size) || size < 0) continue;

                // A container is only "constructed" once its constructor has
                // run, and the first stop in a function is its prologue — so
                // size() there reads whatever was on the stack. Measured in the
                // deployment container: a three-line program that merely
                // declares `std::vector<int> v` reported size 27,767,532,377,092,
                // and the mapper builds one command per element. That is how a
                // vector, the most common container there is, killed the server.
                if (size > MAX_CONTAINER_ELEMENTS) {
                    console.warn(`  [GDB] ignoring ${local.name}: size ${size} is not a real container`);
                    continue;
                }

                let pushValue: string | undefined;
                let entries: { key: string; value: string }[] | undefined;

                if (kind === 'unordered_map' || kind === 'map') {
                    // Map containers — enumerate entries via pretty printer.
                    if (size > 0) {
                        entries = await driver.enumerateMapEntries(local.name);
                    } else {
                        entries = [];
                    }
                } else if (size > 0) {
                    if (kind === 'stack' || kind === 'priority_queue') {
                        pushValue = await driver.evaluateExpression(`${local.name}.top()`);
                    } else if (kind === 'queue') {
                        // back() reflects the most recently enqueued element.
                        pushValue = await driver.evaluateExpression(`${local.name}.back()`);
                    } else {
                        // vector / deque
                        pushValue = await driver.evaluateExpression(`${local.name}.back()`);
                    }
                    if (pushValue === '') pushValue = undefined;
                }
                stlContainers.set(local.name, { kind, size, pushValue, entries });
            }

            // Inspect stack-allocated struct locals (array-based Stack/Queue)
            const valueStructData = new Map<string, GDBField[]>();
            const arrayReadings   = new Map<string, string>();
            for (const local of locals) {
                if (isPointerType(local.type)) continue;
                // Skip STL containers — we already handled them above.
                if (detectSTL(local.type)) continue;
                if (!isStructType(local.type))  continue;
                const fields = await driver.inspectValueStruct(local.name);
                if (fields.length === 0) continue;
                valueStructData.set(local.name, fields);

                // For each pair of (array field, integer field), read the element
                // at index [curr] and [curr-1] so gdbMapper can detect push/pop.
                const arrFields = fields.filter(f => f.type.includes('['));
                const idxFields = fields.filter(f => isIntegralType(f.type));
                for (const arr of arrFields) {
                    for (const idx of idxFields) {
                        const iv = parseInt(idx.value);
                        if (isNaN(iv)) continue;
                        for (const ri of [iv, iv - 1].filter(i => i >= 0)) {
                            const key = `${local.name}.${arr.name}[${ri}]`;
                            const val = await driver.evaluateExpression(
                                `${local.name}.${arr.name}[${ri}]`
                            );
                            if (val) arrayReadings.set(key, val);
                        }
                    }
                }
            }

            const callStack = await driver.getCallStack();
            snapshots.push({ line: stop.line, func: stop.func, locals, structData, valueStructData, arrayReadings, stlContainers, callStack });

            // next() returns null only when the step failed — it swallows its own
            // 6s stop timeout. A program that simply ended produces a *stopped
            // with a terminal reason instead, and breaks at the top of the loop.
            // So this branch means GDB stopped responding, and the trace is a
            // prefix. It used to break with timedOut still false, which sent a
            // truncated trace back as HTTP 200 success, indistinguishable from a
            // program that ran to completion.
            const nextStop = await driver.next();
            if (!nextStop) { timedOut = true; break; }
            stop = nextStop;
            steps++;
        }

        if (steps >= MAX_STEPS) timedOut = true;

        // The loop can end with the program still running — stepping off the end
        // of main, the step budget, a failed step. Let it finish before tearing
        // GDB down, or its buffered stdout dies with it and programOutput below
        // reads an empty file.
        if (!isTerminalReason(stop.reason)) {
            await driver.finishInferior();
        }

        await driver.quit();

        // The redirect file lives in /dev/shm (RAM-backed) on Linux, so a program
        // printing in a tight loop can fill memory. Read at most MAX_OUTPUT_BYTES.
        let programOutput = '';
        try {
            const { size } = await stat(stdoutFile);
            const handle = await open(stdoutFile, 'r');
            try {
                const length = Math.min(size, MAX_OUTPUT_BYTES);
                const buf = Buffer.alloc(length);
                await handle.read(buf, 0, length, 0);
                programOutput = buf.toString('utf-8');
                if (size > MAX_OUTPUT_BYTES) {
                    programOutput += `\n[output truncated at ${MAX_OUTPUT_BYTES} bytes]`;
                }
            } finally {
                await handle.close();
            }
        } catch { /* no output */ }

        return { snapshots, programOutput, timedOut, aborted };

    } catch (err) {
        await driver.quit().catch(() => {});
        return {
            snapshots: [],
            programOutput: '',
            timedOut: false,
            error: err instanceof Error ? err.message : 'GDB session failed',
        };
    } finally {
        await delay(200); // let GDB release file handles before deleting
        await rm(stdinFile, { force: true }).catch(() => {});
        await rm(stdoutFile, { force: true }).catch(() => {});
    }
}
