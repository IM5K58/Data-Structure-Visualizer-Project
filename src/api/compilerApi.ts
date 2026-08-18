export interface TraceStep {
    step: number;
    line: number;
    type: string;
    var?: string;
    field?: string;
    source?: string;
    value?: number | string;
    addr?: string;
    target?: string;
    struct?: string;
    hint?: 'stack' | 'queue' | 'node' | 'tree' | 'circular' | 'heap' | 'hashmap' | 'unionfind';
    raw?: string;
    output?: string;
    /** Call stack frames (outermost → innermost) for STACK_FRAMES events */
    frames?: string[];
    /** For map operations (MAP_SET / MAP_REMOVE) */
    key?: string;
    /** For UF_UNION: the second operand */
    arg2?: string;
}

export interface CompileResponse {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    compilationTime: number;
    executionTime: number;
    steps: TraceStep[];
    /** True when the tracer hit its step or wall-clock limit and the trace is incomplete. */
    truncated?: boolean;
    /** A non-error message about how the run was served (e.g. tracing unavailable). */
    notice?: string;
    error?: {
        type: 'compilation' | 'runtime' | 'timeout';
        message: string;
        line?: number;
        column?: number;
    };
}

const API_URL = import.meta.env.VITE_COMPILER_API_URL || 'http://localhost:3001';
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Narrow an untrusted JSON body to CompileResponse. Without this a server that
 * omits `steps` (or returns an HTML error page) surfaces as a TypeError deep
 * inside the step mapper instead of a readable message.
 */
function parseCompileResponse(body: unknown): CompileResponse {
    if (typeof body !== 'object' || body === null) {
        throw new Error('The compiler server returned a malformed response.');
    }
    const raw = body as Record<string, unknown>;

    const error = typeof raw.error === 'object' && raw.error !== null
        ? raw.error as CompileResponse['error']
        : undefined;

    if (!Array.isArray(raw.steps) && !error) {
        throw new Error('The compiler server returned a response without any trace steps.');
    }

    return {
        success: raw.success === true,
        stdout: typeof raw.stdout === 'string' ? raw.stdout : '',
        stderr: typeof raw.stderr === 'string' ? raw.stderr : '',
        exitCode: typeof raw.exitCode === 'number' ? raw.exitCode : 0,
        compilationTime: typeof raw.compilationTime === 'number' ? raw.compilationTime : 0,
        executionTime: typeof raw.executionTime === 'number' ? raw.executionTime : 0,
        steps: Array.isArray(raw.steps) ? raw.steps as TraceStep[] : [],
        truncated: raw.truncated === true,
        notice: typeof raw.notice === 'string' ? raw.notice : undefined,
        error,
    };
}

export async function compileCode(
    code: string,
    stdin: string = '',
    signal?: AbortSignal
): Promise<CompileResponse> {
    // Combine the caller's abort signal with our own timeout so either can cancel.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    let response: Response;
    try {
        response = await fetch(`${API_URL}/api/compile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, stdin }),
            signal: combined,
        });
    } catch (err) {
        // The caller aborted deliberately — propagate so it can be ignored.
        if (signal?.aborted) throw err;
        if (err instanceof DOMException && err.name === 'TimeoutError') {
            throw new Error(
                `The compiler server did not respond within ${REQUEST_TIMEOUT_MS / 1000}s. `
                + 'The program may be stuck in a long-running loop.'
            );
        }
        throw new Error(
            `Could not reach the compiler server at ${API_URL}. `
            + 'Check that the backend is running and that VITE_COMPILER_API_URL points at it.'
        );
    }

    if (!response.ok) {
        // Prefer the server's own error message when it sends a JSON body.
        const detail = await response.json()
            .then((b: unknown) => {
                const e = (b as { error?: { message?: unknown } })?.error?.message;
                return typeof e === 'string' ? e : null;
            })
            .catch(() => null);
        throw new Error(
            detail ?? `Compiler server error: ${response.status} ${response.statusText}`
        );
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new Error('The compiler server returned a response that was not valid JSON.');
    }

    return parseCompileResponse(body);
}
