import { describe, it, expect, vi, afterEach } from 'vitest';
import { compileCode } from '../compilerApi';

function jsonResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
    return {
        ok: (init.status ?? 200) < 400,
        status: init.status ?? 200,
        statusText: init.statusText ?? 'OK',
        json: async () => body,
    } as Response;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('compileCode', () => {
    it('returns a normalized response on success', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            success: true,
            stdout: 'hi',
            steps: [{ step: 0, line: 1, type: 'ALLOC' }],
        })));

        const res = await compileCode('int main(){}');
        expect(res.success).toBe(true);
        expect(res.stdout).toBe('hi');
        expect(res.steps).toHaveLength(1);
        // Fields the server omitted must still be present with safe defaults.
        expect(res.stderr).toBe('');
        expect(res.exitCode).toBe(0);
        expect(res.truncated).toBe(false);
    });

    it('carries a notice through as a non-error field', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            success: true,
            stdout: 'hello\n',
            steps: [],
            notice: 'Step tracing is unavailable in this deployment (GDB was not found).',
        })));
        const res = await compileCode('int main(){}');
        // The run succeeded — a notice must not be mistaken for a failure.
        expect(res.success).toBe(true);
        expect(res.error).toBeUndefined();
        expect(res.notice).toMatch(/Step tracing is unavailable/);
        expect(res.stdout).toBe('hello\n');
    });

    it('drops a non-string notice', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            success: true, stdout: '', steps: [], notice: { msg: 'nope' },
        })));
        const res = await compileCode('int main(){}');
        expect(res.notice).toBeUndefined();
    });

    it('surfaces truncated traces', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            success: true, stdout: '', steps: [], truncated: true,
        })));
        const res = await compileCode('int main(){}');
        expect(res.truncated).toBe(true);
    });

    it('explains an unreachable server instead of leaking "Failed to fetch"', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
        await expect(compileCode('int main(){}')).rejects.toThrow(/Could not reach the compiler server/);
    });

    it('prefers the server error message on a non-2xx response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(
            { error: { message: 'stdin must be a string' } },
            { status: 400, statusText: 'Bad Request' },
        )));
        await expect(compileCode('int main(){}')).rejects.toThrow('stdin must be a string');
    });

    it('falls back to the status line when the error body is unusable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: false,
            status: 502,
            statusText: 'Bad Gateway',
            json: async () => { throw new SyntaxError('not json'); },
        } as unknown as Response)));
        await expect(compileCode('int main(){}')).rejects.toThrow(/502 Bad Gateway/);
    });

    it('rejects a body that is not valid JSON', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => { throw new SyntaxError('Unexpected token <'); },
        } as unknown as Response)));
        await expect(compileCode('int main(){}')).rejects.toThrow(/not valid JSON/);
    });

    it('rejects a success body with no steps array', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, stdout: '' })));
        await expect(compileCode('int main(){}')).rejects.toThrow(/without any trace steps/);
    });

    it('accepts an error body with no steps array', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            success: false,
            error: { type: 'compilation', message: 'expected ;' },
        })));
        const res = await compileCode('int main(){}');
        expect(res.success).toBe(false);
        expect(res.error?.message).toBe('expected ;');
        expect(res.steps).toEqual([]);
    });

    it('propagates a caller abort untouched', async () => {
        const controller = new AbortController();
        vi.stubGlobal('fetch', vi.fn(async () => {
            controller.abort();
            throw new DOMException('aborted', 'AbortError');
        }));
        await expect(compileCode('int main(){}', '', controller.signal))
            .rejects.toThrow(/aborted/);
    });
});
