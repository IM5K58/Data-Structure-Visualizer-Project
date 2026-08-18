// ===== API Types =====

export interface CompileRequest {
    code: string;
    /** Standard input piped to the traced program. */
    stdin?: string;
    language?: string;  // default: "c++"
    options?: {
        standard?: string;   // e.g. "c++17"
        timeout?: number;    // ms, default 5000
    };
}

/** Data-structure classification hint attached to an allocation event. */
export type StructureHint =
    | 'stack' | 'queue' | 'node' | 'tree' | 'circular' | 'heap' | 'hashmap' | 'unionfind';

/**
 * One traced execution event. This is the single source of truth for the wire
 * format: the GDB mapper produces these, and the frontend's copy in
 * src/api/compilerApi.ts must match.
 */
export interface TraceStep {
    step: number;
    line: number;
    type: string;        // ALLOC, SET_FIELD, SET_PTR, DELETE, PUSH, POP, etc.
    var?: string;
    field?: string;
    source?: string;
    value?: number | string;
    addr?: string;
    target?: string;
    struct?: string;
    hint?: StructureHint;
    raw?: string;
    output?: string;
    /** Call stack (outermost→innermost) for STACK_FRAMES events */
    frames?: string[];
    /** For map operations (MAP_SET / MAP_REMOVE) */
    key?: string;
    /** For UF_UNION: the second operand */
    arg2?: string;
}

/** @deprecated Kept as an alias while callers migrate to TraceStep. */
export type ExecutionStep = TraceStep;

export interface CompileResponse {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
    compilationTime: number;
    executionTime: number;
    steps: TraceStep[];
    /** True when the tracer hit its step or wall-clock limit; `steps` is a prefix. */
    truncated?: boolean;
    /**
     * A non-error message about how the request was served — e.g. the program ran
     * but could not be traced. The run still succeeded; this is not `error`.
     */
    notice?: string;
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
