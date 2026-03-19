import { Router } from 'express';
import { executeCode } from '../services/compiler.js';
import { instrument, parseTraceOutput } from '../services/instrumenter.js';
import type { CompileRequest, CompileResponse } from '../types/index.js';

const router = Router();

/**
 * POST /api/compile
 * C++ 코드를 받아 Piston으로 컴파일/실행하고 결과를 반환합니다.
 */
router.post('/compile', async (req, res) => {
    const startTime = Date.now();

    try {
        const { code, language, options } = req.body as CompileRequest;

        if (!code || typeof code !== 'string') {
            res.status(400).json({
                success: false,
                error: { type: 'compilation', message: 'Code is required' },
            } as CompileResponse);
            return;
        }

        // 계측 코드 삽입
        const instrumentedCode = instrument(code);

        // Piston 또는 로컬 g++로 코드 실행
        const stdin = (req.body as any).stdin || '';
        const result = await executeCode(instrumentedCode, stdin);

        const totalTime = Date.now() - startTime;

        // 컴파일 에러 체크
        if (result.compile && result.compile.code !== 0) {
            const errorOutput = result.compile.stderr || result.compile.output;

            // GCC 에러 메시지에서 라인 번호 추출
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

        // 런타임 에러 체크
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

        // 성공 시 출력 파싱
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
 * 서버 상태 체크
 */
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
