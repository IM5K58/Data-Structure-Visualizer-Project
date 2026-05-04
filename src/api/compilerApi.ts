

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
    error?: {
        type: 'compilation' | 'runtime' | 'timeout';
        message: string;
        line?: number;
        column?: number;
    };
}

const API_URL = import.meta.env.VITE_COMPILER_API_URL || 'http://localhost:3001';

export async function compileCode(code: string, stdin: string = ''): Promise<CompileResponse> {
    const response = await fetch(`${API_URL}/api/compile`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, stdin }),
        // Set a reasonable timeout (e.g., 15s) for the fetch request
        signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}
