// ===== API Types =====

export interface CompileRequest {
    code: string;
    language?: string;  // default: "c++"
    options?: {
        standard?: string;   // e.g. "c++17"
        timeout?: number;    // ms, default 5000
    };
}

export interface ExecutionStep {
    step: number;
    line: number;
    type: string;        // ALLOC, SET_FIELD, SET_PTR, DELETE, PUSH, POP, etc.
    var?: string;
    field?: string;
    value?: number | string | boolean;
    addr?: string;
    target?: string;
    struct?: string;
    raw?: string;
}

export interface CompileResponse {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    compilationTime: number;
    executionTime: number;
    steps: ExecutionStep[];
    error?: {
        type: 'compilation' | 'runtime' | 'timeout';
        message: string;
        line?: number;
        column?: number;
    };
}

// Piston API types
export interface PistonExecuteRequest {
    language: string;
    version: string;
    files: { name: string; content: string }[];
    stdin?: string;
    args?: string[];
    compile_timeout?: number;
    run_timeout?: number;
    compile_memory_limit?: number;
    run_memory_limit?: number;
}

export interface PistonExecuteResponse {
    language: string;
    version: string;
    run: {
        stdout: string;
        stderr: string;
        code: number;
        signal: string | null;
        output: string;
    };
    compile?: {
        stdout: string;
        stderr: string;
        code: number;
        signal: string | null;
        output: string;
    };
}
