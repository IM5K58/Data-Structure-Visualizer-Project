import { Router } from 'express';
import { rm } from 'fs/promises';
import { executeCode, compileWithDebug } from '../services/compiler.js';
import { runGDBSession } from '../services/traceSession.js';
import { snapshotsToTraceSteps } from '../services/gdbMapper.js';
import { intFromEnv } from '../env.js';
import { Slots } from '../slots.js';
import type { CompileResponse, CompileRequest } from '../types/index.js';

const router = Router();

const USE_GDB = process.env.USE_GDB !== 'false'; // default: true
const MAX_STDIN_BYTES = intFromEnv('MAX_STDIN_BYTES', 64 * 1024);

/**
 * Concurrency ceiling for compile+trace jobs. Two at a time by default: each
 * one is a compiler, a GDB and a traced program, and the container this ships
 * in is sized at 512 MB with one CPU.
 */
const slots = new Slots(
    intFromEnv('MAX_CONCURRENT_JOBS', 2),
    intFromEnv('MAX_QUEUED_JOBS', 8),
    intFromEnv('QUEUE_WAIT_MS', 20_000),
);
const VERBOSE_STEP_LOG = process.env.VERBOSE_STEP_LOG === 'true';

/**
 * Compile and run the user's code as written, with no tracing.
 *
 * Used whenever a step trace cannot be produced. The program's real output plus
 * an honest notice is always better than a fabricated trace: an earlier version
 * rewrote the source with tracing calls, which could emit C++ that did not
 * compile, so the user saw an error for code they never wrote on a line that did
 * not exist in their file.
 */
async function respondWithPlainRun(
    code: string,
    stdin: string,
    compilationTime: number,
    notice: string,
): Promise<CompileResponse> {
    const plain = await executeCode(code, stdin);

    if (plain.compile && plain.compile.code !== 0) {
        const errorOutput = plain.compile.stderr || plain.compile.output;
        const lineMatch = errorOutput.match(/main\.cpp:(\d+):(\d+)/);
        return {
            success: false,
            stdout: '',
            stderr: errorOutput,
            exitCode: plain.compile.code,
            compilationTime,
            executionTime: 0,
            steps: [],
            error: {
                type: 'compilation',
                message: errorOutput,
                line: lineMatch ? parseInt(lineMatch[1]) : undefined,
                column: lineMatch ? parseInt(lineMatch[2]) : undefined,
            },
        };
    }

    if (plain.run.code !== 0 && plain.run.signal) {
        return {
            success: false,
            stdout: plain.run.stdout,
            stderr: plain.run.stderr,
            exitCode: plain.run.code,
            compilationTime,
            executionTime: 0,
            steps: [],
            error: {
                type: 'runtime',
                message: plain.run.stderr || `Process terminated with signal: ${plain.run.signal}`,
            },
        };
    }

    return {
        success: true,
        stdout: plain.run.stdout,
        stderr: plain.run.stderr,
        exitCode: plain.run.code,
        compilationTime,
        executionTime: 0,
        steps: [],
        notice,
    };
}

/**
 * POST /api/compile
 * C++ 코드를 받아 컴파일/실행하고 TraceStep[] 결과를 반환합니다.
 *
 * USE_GDB=true (기본값): GDB MI로 실행을 단계별 추적합니다.
 * USE_GDB=false 이거나 GDB를 찾을 수 없으면, 추적 없이 프로그램만 실행하고
 * 그 사실을 `notice`로 알립니다.
 */
router.post('/compile', async (req, res) => {
    const startTime = Date.now();
    let release: (() => void) | undefined;

    try {
        const { code, stdin: rawStdin } = req.body as CompileRequest;

        if (!code || typeof code !== 'string') {
            res.status(400).json({
                success: false,
                error: { type: 'compilation', message: 'Code is required' },
            } as CompileResponse);
            return;
        }

        // `stdin` is written straight to a file that the traced program reads.
        // A non-string here (array, object, number) would reach writeFile and
        // throw deep inside the driver, so reject it at the boundary.
        if (rawStdin !== undefined && typeof rawStdin !== 'string') {
            res.status(400).json({
                success: false,
                error: { type: 'compilation', message: 'stdin must be a string' },
            } as CompileResponse);
            return;
        }
        const stdin: string = rawStdin ?? '';

        if (stdin.length > MAX_STDIN_BYTES) {
            res.status(400).json({
                success: false,
                error: { type: 'compilation', message: `stdin exceeds ${MAX_STDIN_BYTES} bytes` },
            } as CompileResponse);
            return;
        }

        // ── Tracing disabled by configuration ────────────────────────────────
        if (!USE_GDB) {
            console.log('  → USE_GDB=false: running without step tracing');
            res.json(await respondWithPlainRun(
                code, stdin, Date.now() - startTime,
                'Step tracing is disabled on this server (USE_GDB=false). '
                + 'The program ran normally — its output is shown in the terminal.',
            ));
            return;
        }

        // ── GDB path ─────────────────────────────────────────────────────────
        // Everything below spawns processes, so it runs under a ceiling. The
        // rate limiter caps requests per minute; it does nothing about how many
        // are in flight at once, and each job is a compiler plus GDB plus the
        // traced program.
        try {
            release = await slots.acquire();
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Server is busy.';
            console.warn(`  → refused: ${message} (in flight ${slots.inFlight}, queued ${slots.queued})`);
            res.status(503).json({
                success: false,
                error: { type: 'runtime', message },
            } as CompileResponse);
            return;
        }

        // A client that navigates away should not leave a GDB session running to
        // completion. It has to be `res`, not `req`: express.json() has already
        // drained the request body by this point, so req's own 'close' has
        // fired at 0ms for every request, disconnect or not — measured. res
        // closes early only when the socket really went away, and writableEnded
        // separates that from our own normal reply.
        let clientGone = false;
        res.on('close', () => { if (!res.writableEnded) clientGone = true; });

        console.log('  → Using GDB MI mode');

        // 1. 디버그 빌드
        const compileResult = await compileWithDebug(code);

        if (clientGone) {
            console.log('  → client disconnected during compile; dropping the job');
            await rm(compileResult.jobDir, { recursive: true, force: true }).catch(() => {});
            return;
        }
        const compilationTime = Date.now() - startTime;

        if (!compileResult.success) {
            const lineMatch = compileResult.stderr.match(/main\.cpp:(\d+):(\d+)/);
            const response: CompileResponse = {
                success: false,
                stdout: '',
                stderr: compileResult.stderr,
                exitCode: 1,
                compilationTime,
                executionTime: 0,
                steps: [],
                error: {
                    type: 'compilation',
                    message: compileResult.stderr,
                    line: lineMatch ? parseInt(lineMatch[1]) : undefined,
                    column: lineMatch ? parseInt(lineMatch[2]) : undefined,
                },
            };
            res.json(response);
            await rm(compileResult.jobDir, { recursive: true, force: true }).catch(() => {});
            return;
        }

        // 2. GDB 세션 실행
        const gdbRunStart = Date.now();
        const session = await runGDBSession(compileResult.binaryPath, stdin, () => clientGone);

        if (session.aborted) {
            console.log('  → client disconnected mid-trace; dropping the job');
            return;
        }
        const executionTime = Date.now() - gdbRunStart;

        await rm(compileResult.jobDir, { recursive: true, force: true }).catch(() => {});

        // GDB binary absent → run the program plainly rather than failing.
        if (session.error?.includes('GDB not found')) {
            console.warn('  ⚠ GDB not available — running without step tracing');
            res.json(await respondWithPlainRun(
                code, stdin, compilationTime,
                'Step tracing is unavailable in this deployment (GDB was not found). '
                + 'The program ran normally — its output is shown in the terminal.',
            ));
            return;
        }

        if (session.error) {
            const response: CompileResponse = {
                success: false,
                stdout: session.programOutput,
                stderr: session.error,
                exitCode: 1,
                compilationTime,
                executionTime,
                steps: [],
                error: { type: 'runtime', message: session.error },
            };
            res.json(response);
            return;
        }

        // 3. 스냅샷 → TraceStep 변환
        const steps = snapshotsToTraceSteps(session.snapshots, session.programOutput);
        console.log('  GDB snapshots:', session.snapshots.length, '→ steps:', steps.length);
        if (VERBOSE_STEP_LOG) {
            console.log('  Steps:', JSON.stringify(steps, null, 2));
        }
        if (session.timedOut) {
            console.warn('  ⚠ trace truncated: tracer hit its step or time limit');
        }

        const response: CompileResponse = {
            success: true,
            stdout: session.programOutput,
            stderr: '',
            exitCode: 0,
            compilationTime,
            executionTime,
            steps,
            // The trace is a prefix of the real execution — tell the client
            // rather than presenting a cut-off run as a complete one.
            truncated: session.timedOut,
        };
        res.json(response);

    } catch (error) {
        console.error('Compile route error:', error);
        res.status(500).json({
            success: false,
            error: {
                type: 'runtime',
                message: error instanceof Error ? error.message : 'Internal server error',
            },
        } as CompileResponse);
    } finally {
        // Every exit from the GDB path goes through here, including the early
        // returns. A slot that is not given back is gone for the life of the
        // process, and the ceiling ratchets down to zero.
        release?.();
    }
});

/**
 * GET /api/health
 */
router.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mode: USE_GDB ? 'gdb' : 'plain',
    });
});

export default router;
