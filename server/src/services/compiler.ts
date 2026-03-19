import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import type { PistonExecuteResponse } from '../types/index.js';

const GPP_PATH = process.env.GPP_PATH || (process.platform === 'win32' ? 'C:\\msys64\\ucrt64\\bin\\g++.exe' : '/usr/bin/g++');
const PISTON_URL = process.env.PISTON_URL || '';

/**
 * 로컬 g++로 코드를 컴파일하고 실행합니다.
 */
export async function executeLocal(code: string, stdin: string = ''): Promise<PistonExecuteResponse> {
    const jobId = randomUUID();
    const jobDir = join(tmpdir(), `vierasion-${jobId}`);
    const srcFile = join(jobDir, 'main.cpp');
    const outFile = join(jobDir, 'main.exe');

    await mkdir(jobDir, { recursive: true });
    await writeFile(srcFile, code, 'utf-8');

    // 1. 컴파일
    const includeDir = join(process.cwd(), 'sandbox');
    const compileResult = await runProcess(GPP_PATH, [srcFile, '-o', outFile, '-std=c++17', '-Wall', '-I', includeDir], jobDir, 10000);
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
    const runResult = await runProcess(outFile, [], jobDir, 5000, stdin);

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
        const proc = spawn(command, args, { cwd, timeout, env });
        let stdout = '';
        let stderr = '';

        if (stdin) {
            proc.stdin.write(stdin);
            proc.stdin.end();
        }

        proc.stdout.on('data', (data) => { stdout += data.toString(); });
        proc.stderr.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code, signal) => {
            resolve({ stdout, stderr, code: code ?? 1, signal: signal?.toString() ?? null });
        });

        proc.on('error', (err) => {
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
