import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { childEnv } from './childEnv.js';
import type { PistonExecuteResponse } from '../types/index.js';

export interface CompileWithDebugResult {
    success: boolean;
    binaryPath: string;
    jobDir: string;
    stderr: string;
}

const GPP_PATH = process.env.GPP_PATH || (process.platform === 'win32' ? 'C:\\msys64\\ucrt64\\bin\\g++.exe' : '/usr/bin/g++');
const PISTON_URL = process.env.PISTON_URL || '';

// ─── Resource limits (Linux only) ──────────────────────────────────────────
// Wrap user code & compiler invocations with `prlimit` (util-linux) so a
// runaway program can't take down the host. No-op on Windows/macOS.
//
// All values overridable via env vars so deployers can tune per-platform.
const RLIMIT = {
    cpuSec:   parseInt(process.env.RLIMIT_CPU_SEC   ?? '8'),       // CPU seconds
    asBytes:  parseInt(process.env.RLIMIT_AS_BYTES  ?? `${256 * 1024 * 1024}`), // virtual mem
    stackBytes: parseInt(process.env.RLIMIT_STACK_BYTES ?? `${16 * 1024 * 1024}`),
    fsizeBytes: parseInt(process.env.RLIMIT_FSIZE_BYTES ?? `${8 * 1024 * 1024}`),
    nofile:   parseInt(process.env.RLIMIT_NOFILE    ?? '64'),
    nproc:    parseInt(process.env.RLIMIT_NPROC     ?? '64'),
};
const PRLIMIT_PATH = process.env.PRLIMIT_PATH ?? '/usr/bin/prlimit';
// Probe once at module load.
const PRLIMIT_AVAILABLE = process.platform === 'linux' && existsSync(PRLIMIT_PATH);
const RLIMIT_OPTED_OUT = process.env.DISABLE_RLIMIT === 'true';
const RLIMIT_ENABLED = PRLIMIT_AVAILABLE && !RLIMIT_OPTED_OUT;

// prlimit is the ONLY thing bounding CPU, memory, file size and process count
// for arbitrary user C++ on Linux. Losing it silently turns this service into an
// unbounded remote-execution endpoint, so refuse to start instead of warning.
// Set DISABLE_RLIMIT=true to acknowledge the risk explicitly (e.g. when the
// container itself is already constrained by cgroups/seccomp).
if (process.platform === 'linux' && !PRLIMIT_AVAILABLE && !RLIMIT_OPTED_OUT) {
    throw new Error(
        `prlimit not found at ${PRLIMIT_PATH}: refusing to run untrusted code without resource limits. `
        + `Install util-linux, set PRLIMIT_PATH, or set DISABLE_RLIMIT=true to override deliberately.`,
    );
}
if (RLIMIT_OPTED_OUT) {
    console.warn('  ⚠ DISABLE_RLIMIT=true — user code runs without prlimit resource caps.');
}
if (process.platform !== 'linux') {
    console.warn(`  ⚠ ${process.platform}: prlimit unavailable — resource limits are NOT enforced. Development only.`);
}

/**
 * Hard cap on how much of a child's stdout/stderr we buffer. Without it,
 * `while (1) printf(...)` grows the server's heap until it dies.
 */
const MAX_CAPTURE_BYTES = parseInt(process.env.MAX_OUTPUT_BYTES ?? `${1024 * 1024}`);

/**
 * Wrap a command in prlimit on Linux, otherwise return as-is.
 * Returns [command, args] tuple ready for spawn().
 */
export function withRlimit(cmd: string, args: string[]): [string, string[]] {
    if (!RLIMIT_ENABLED) return [cmd, args];
    return [PRLIMIT_PATH, [...rlimitFlags(), '--', cmd, ...args]];
}

/**
 * Returns the prlimit flag list (without the trailing `--`).
 * Useful for callers that need to construct an exec-wrapper string
 * (e.g., GDB's `set exec-wrapper prlimit --cpu=N ...`).
 * On non-Linux platforms returns null.
 */
export function rlimitWrapperPrefix(): string | null {
    if (!RLIMIT_ENABLED) return null;
    return [PRLIMIT_PATH, ...rlimitFlags()].join(' ');
}

function rlimitFlags(): string[] {
    return [
        `--cpu=${RLIMIT.cpuSec}`,
        `--as=${RLIMIT.asBytes}`,
        `--stack=${RLIMIT.stackBytes}`,
        `--fsize=${RLIMIT.fsizeBytes}`,
        `--nofile=${RLIMIT.nofile}`,
        `--nproc=${RLIMIT.nproc}`,
    ];
}

// Linux에서는 RAM 기반 /dev/shm을 사용해 디스크 I/O 절감
function getTempBase(): string {
    return process.platform === 'linux' ? '/dev/shm' : tmpdir();
}

/**
 * GDB용 디버그 심볼이 포함된 바이너리를 컴파일합니다.
 * jobDir와 binaryPath를 반환하므로 호출자가 정리해야 합니다.
 */
export async function compileWithDebug(code: string): Promise<CompileWithDebugResult> {
    const jobId = randomUUID();
    const jobDir = join(getTempBase(), `vierasion-gdb-${jobId}`);
    const srcFile = join(jobDir, 'main.cpp').replace(/\\/g, '/');
    const outFile = join(jobDir, process.platform === 'win32' ? 'main.exe' : 'main').replace(/\\/g, '/');

    await mkdir(jobDir, { recursive: true });
    await writeFile(srcFile, code, 'utf-8');

    const [cmd, args] = withRlimit(
        GPP_PATH,
        [srcFile, '-o', outFile, '-g', '-O0', '-std=c++17', '-pipe'],
    );
    const result = await runProcess(cmd, args, jobDir, 15000);

    return {
        success: result.code === 0,
        binaryPath: outFile,
        jobDir,
        stderr: result.stderr,
    };
}

/**
 * 로컬 g++로 코드를 컴파일하고 실행합니다.
 */
export async function executeLocal(code: string, stdin: string = ''): Promise<PistonExecuteResponse> {
    const jobId = randomUUID();
    const jobDir = join(getTempBase(), `vierasion-${jobId}`);
    const srcFile = join(jobDir, 'main.cpp');
    const outFile = join(jobDir, 'main.exe');

    await mkdir(jobDir, { recursive: true });
    await writeFile(srcFile, code, 'utf-8');

    // 1. 컴파일 — 사용자 소스를 그대로 컴파일합니다(주입 헤더 없음).
    const [compileCmd, compileArgs] = withRlimit(
        GPP_PATH,
        [srcFile, '-o', outFile, '-std=c++17', '-pipe'],
    );
    const compileResult = await runProcess(compileCmd, compileArgs, jobDir, 10000);
    console.log('  Compile result:', JSON.stringify(compileResult));

    if (compileResult.code !== 0) {
        // 컴파일 에러
        await cleanup(jobDir);
        return {
            language: 'c++',
            version: 'local',
            compile: {
                stdout: compileResult.stdout,
                stderr: compileResult.stderr,
                code: compileResult.code,
                signal: null,
                output: compileResult.stderr || compileResult.stdout,
            },
            run: { stdout: '', stderr: '', code: 0, signal: null, output: '' },
        };
    }

    // 2. 실행
    const [runCmd, runArgs] = withRlimit(outFile, []);
    const runResult = await runProcess(runCmd, runArgs, jobDir, 5000, stdin);

    await cleanup(jobDir);

    return {
        language: 'c++',
        version: 'local',
        compile: {
            stdout: compileResult.stdout,
            stderr: compileResult.stderr,
            code: 0,
            signal: null,
            output: '',
        },
        run: {
            stdout: runResult.stdout,
            stderr: runResult.stderr,
            code: runResult.code,
            signal: runResult.signal,
            output: runResult.stdout + runResult.stderr,
        },
    };
}

/**
 * 프로세스를 실행하고 결과를 반환합니다.
 */
function runProcess(
    command: string,
    args: string[],
    cwd: string,
    timeout: number,
    stdin: string = ''
): Promise<{ stdout: string; stderr: string; code: number; signal: string | null }> {
    return new Promise((resolve) => {
        // An allowlist, not process.env: this spawns the user's own code, and
        // dotenv has loaded server/.env by now. childEnv() also adds the MSYS2
        // DLL directory to PATH on Windows.
        const env = childEnv();
        // spawn의 timeout 옵션은 Windows에서 실제로 프로세스를 종료하지 않으므로 직접 구현.
        // detached on POSIX so the whole process group can be signalled — a killed
        // parent otherwise leaves forked children orphaned and still running.
        const detached = process.platform !== 'win32';
        const proc = spawn(command, args, { cwd, env, detached });
        let stdout = '';
        let stderr = '';
        let truncated = false;

        const capture = (buf: string, chunk: Buffer): string => {
            if (buf.length >= MAX_CAPTURE_BYTES) {
                truncated = true;
                return buf;
            }
            const next = buf + chunk.toString();
            if (next.length > MAX_CAPTURE_BYTES) {
                truncated = true;
                return next.slice(0, MAX_CAPTURE_BYTES);
            }
            return next;
        };

        const killTree = (signal: NodeJS.Signals) => {
            try {
                if (detached && proc.pid) process.kill(-proc.pid, signal);
                else proc.kill(signal);
            } catch { /* already gone */ }
        };

        const timer = setTimeout(() => {
            killTree('SIGTERM');
            setTimeout(() => killTree('SIGKILL'), 500);
        }, timeout);

        if (stdin) {
            // A program that exits without reading stdin makes this pipe emit
            // EPIPE. `proc.on('error')` does NOT cover stream errors, so without
            // this handler the rejection is an uncaught exception that kills the
            // whole server.
            proc.stdin.on('error', () => { /* child closed stdin early */ });
            proc.stdin.write(stdin);
            proc.stdin.end();
        }

        proc.stdout.on('data', (data: Buffer) => { stdout = capture(stdout, data); });
        proc.stderr.on('data', (data: Buffer) => { stderr = capture(stderr, data); });

        proc.on('close', (code, signal) => {
            clearTimeout(timer);
            if (truncated) {
                stderr += `\n[output truncated at ${MAX_CAPTURE_BYTES} bytes]`;
            }
            resolve({ stdout, stderr, code: code ?? 1, signal: signal?.toString() ?? null });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            resolve({ stdout, stderr: err.message, code: 1, signal: null });
        });
    });
}

/**
 * 임시 파일 정리
 */
async function cleanup(dir: string) {
    try {
        const { rm } = await import('fs/promises');
        await rm(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
}

/**
 * Piston API를 통해 코드를 실행합니다 (배포 환경용).
 */
async function executePiston(code: string, stdin: string = ''): Promise<PistonExecuteResponse> {
    const response = await fetch(`${PISTON_URL}/api/v2/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            language: 'c++',
            version: '10.2.0',
            files: [{ name: 'main.cpp', content: code }],
            stdin,
            compile_timeout: 10000,
            run_timeout: 5000,
        }),
    });

    if (!response.ok) {
        throw new Error(`Piston API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as PistonExecuteResponse;
}

/**
 * 코드를 실행합니다. PISTON_URL이 설정되어 있으면 Piston을, 아니면 로컬 g++을 사용합니다.
 */
export async function executeCode(code: string, stdin: string = ''): Promise<PistonExecuteResponse> {
    if (PISTON_URL) {
        console.log('  → Using Piston API');
        return executePiston(code, stdin);
    } else {
        console.log('  → Using local g++ compiler');
        return executeLocal(code, stdin);
    }
}
