import { Router } from 'express';
import { rm } from 'fs/promises';
import { executeCode, compileWithDebug } from '../services/compiler.js';
import { instrument, parseTraceOutput } from '../services/instrumenter.js';
import { analyzeCode } from '../services/codeAnalyzer.js';
import { runGDBSession } from '../services/gdbDriver.js';
import { snapshotsToTraceSteps } from '../services/gdbMapper.js';
import type { CompileRequest, CompileResponse } from '../types/index.js';

const router = Router();

const USE_GDB = process.env.USE_GDB !== 'false'; // default: true

/**
 * POST /api/compile
 * C++ 코드를 받아 컴파일/실행하고 TraceStep[] 결과를 반환합니다.
 *
 * USE_GDB=true  (기본값): GDB MI로 완전 실행 추적
 * USE_GDB=false          : 기존 instrumenter 방식 (Render ptrace 불가 시 폴백)
 */
router.post('/compile', async (req, res) => {
    const startTime = Date.now();

    try {
        const { code } = req.body as CompileRequest;
        const stdin: string = (req.body as { stdin?: string }).stdin ?? '';

        if (!code || typeof code !== 'string') {
            res.status(400).json({
                success: false,
                error: { type: 'compilation', message: 'Code is required' },
            } as CompileResponse);
            return;
        }

        // ── GDB path ─────────────────────────────────────────────────────────
        if (USE_GDB) {
            console.log('  → Using GDB MI mode');

            // 1. 디버그 빌드
            const compileResult = await compileWithDebug(code);
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
            const session = await runGDBSession(compileResult.binaryPath, stdin);
            const executionTime = Date.now() - gdbRunStart;

            await rm(compileResult.jobDir, { recursive: true, force: true }).catch(() => {});

            // GDB not found → auto-fallback to instrumenter
            if (session.error?.includes('GDB not found')) {
                console.warn('  ⚠ GDB not available, falling back to instrumenter mode');
                console.warn('    Install GDB or set USE_GDB=false to suppress this warning');
                // fall through to instrumenter path below
            } else if (session.error) {
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
            } else {
                // 3. 스냅샷 → TraceStep 변환
                const steps = snapshotsToTraceSteps(session.snapshots, session.programOutput);
                console.log('  GDB snapshots:', session.snapshots.length, '→ steps:', steps.length);
                console.log('  Steps:', JSON.stringify(steps, null, 2));

                const response: CompileResponse = {
                    success: true,
                    stdout: session.programOutput,
                    stderr: '',
                    exitCode: 0,
                    compilationTime,
                    executionTime,
                    steps,
                };
                res.json(response);
                return;
            }
        }

        // ── Instrumenter fallback path ────────────────────────────────────────
        console.log('  → Using instrumenter mode');

        let analysis = null;
        if (process.env.GROQ_API_KEY) {
            analysis = await analyzeCode(code);
        }

        const instrumentedCode = instrument(code, analysis);
        const result = await executeCode(instrumentedCode, stdin);
        const totalTime = Date.now() - startTime;

        if (result.compile && result.compile.code !== 0) {
            const errorOutput = result.compile.stderr || result.compile.output;
            const lineMatch = errorOutput.match(/main\.cpp:(\d+):(\d+)/);
            const response: CompileResponse = {
                success: false,
                stdout: '',
                stderr: errorOutput,
                exitCode: result.compile.code,
                compilationTime: totalTime,
                executionTime: 0,
                steps: [],
                error: {
                    type: 'compilation',
                    message: errorOutput,
                    line: lineMatch ? parseInt(lineMatch[1]) : undefined,
                    column: lineMatch ? parseInt(lineMatch[2]) : undefined,
                },
            };
            res.json(response);
            return;
        }

        if (result.run.code !== 0 && result.run.signal) {
            const response: CompileResponse = {
                success: false,
                stdout: result.run.stdout,
                stderr: result.run.stderr,
                exitCode: result.run.code,
                compilationTime: totalTime,
                executionTime: 0,
                steps: [],
                error: {
                    type: 'runtime',
                    message: result.run.stderr || `Process terminated with signal: ${result.run.signal}`,
                },
            };
            res.json(response);
            return;
        }

        console.log('Raw execution stdout:', result.run.stdout);
        const parsed = parseTraceOutput(result.run.stdout);
        console.log('Parsed steps length:', parsed.steps.length);

        const response: CompileResponse = {
            success: true,
            stdout: parsed.userOutput,
            stderr: result.run.stderr,
            exitCode: result.run.code,
            compilationTime: totalTime,
            executionTime: 0,
            steps: parsed.steps,
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
    }
});

/**
 * GET /api/health
 */
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), mode: USE_GDB ? 'gdb' : 'instrumenter' });
});

export default router;
