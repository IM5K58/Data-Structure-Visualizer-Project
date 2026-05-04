import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import type { PistonExecuteResponse } from '../types/index.js';

export interface CompileWithDebugResult {
    success: boolean;
    binaryPath: string;
    jobDir: string;
    stderr: string;
}

const GPP_PATH = process.env.GPP_PATH || (process.platform === 'win32' ? 'C:\\msys64\\ucrt64\\bin\\g++.exe' : '/usr/bin/g++');
const PISTON_URL = process.env.PISTON_URL || '';
const SANDBOX_DIR = join(process.cwd(), 'sandbox');

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
// Probe once at module load. If prlimit isn't on the system (e.g. minimal
// container without util-linux, or non-Linux platform), we silently degrade
// to running without resource limits rather than crashing every request.
const PRLIMIT_AVAILABLE = process.platform === 'linux' && existsSync(PRLIMIT_PATH);
const RLIMIT_ENABLED =
    PRLIMIT_AVAILABLE
    && process.env.DISABLE_RLIMIT !== 'true';

if (process.platform === 'linux' && !PRLIMIT_AVAILABLE) {
    console.warn(
        `  ⚠ prlimit not found at ${PRLIMIT_PATH} — resource limits disabled. ` +
        `Install util-linux or set PRLIMIT_PATH.`,
    );
}

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
 * 서버 시작 시 __tracer.h 를 미리 컴파일하여 PCH(.gch) 생성.
 * 이후 매 요청에서 헤더 파싱을 스킵하므로 컴파일 시간이 단축됩니다.
 */
export async function initializePCH(): Promise<void> {
    if (PISTON_URL) return; // Piston 사용 시 불필요
    try {
        const tracerH = join(SANDBOX_DIR, '__tracer.h');
        const result = await runProcess(
            GPP_PATH,
            ['-std=c++17', '-pipe', '-x', 'c++-header', tracerH],
            SANDBOX_DIR,
            30000
        );
        if (result.code === 0) {
            console.log('  ✓ PCH compiled: __tracer.h.gch');
        } else {
            console.warn('  ⚠ PCH compilation failed (will compile without PCH):', result.stderr.slice(0, 200));
        }
    } catch (e) {
        console.warn('  ⚠ PCH init error (skipped):', e);
    }
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

    // 1. 컴파일
    const includeDir = join(process.cwd(), 'sandbox');
    const [compileCmd, compileArgs] = withRlimit(
        GPP_PATH,
        [srcFile, '-o', outFile, '-std=c++17', '-pipe', '-I', includeDir],
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
        const env = { ...process.env };
        // Windows: MSYS2 g++ 런타임 DLL 경로 추가
        if (process.platform === 'win32') {
            const msysBin = 'C:\\msys64\\ucrt64\\bin';
            env.PATH = `${msysBin};${env.PATH}`;
        }
        // spawn의 timeout 옵션은 Windows에서 실제로 프로세스를 종료하지 않으므로 직접 구현
        const proc = spawn(command, args, { cwd, env });
        let stdout = '';
        let stderr = '';

        const timer = setTimeout(() => {
            try { proc.kill('SIGTERM'); } catch { /* ignore */ }
            setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* ignore */ } }, 500);
        }, timeout);

        if (stdin) {
            proc.stdin.write(stdin);
            proc.stdin.end();
        }

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code, signal) => {
            clearTimeout(timer);
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
