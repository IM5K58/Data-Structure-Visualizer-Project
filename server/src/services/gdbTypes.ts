/**
 * GDB Machine Interface (MI): the shapes a trace is made of.
 *
 * Separated from the driver so gdbMapper and the tests can name them
 * without pulling in a module that spawns processes at import time.
 */

export interface GDBLocal {
    name: string;
    type: string;
    value: string;     // stripped address (no GDB annotation)
    rawValue: string;  // original GDB value, may contain " <symbol>"
    /** True for a function parameter. Absent on the older locals-only path,
     *  which could not see parameters at all. */
    isArg?: boolean;
}

export interface GDBField {
    name: string;   // field name (e.g., "data", "next")
    type: string;   // C++ type (e.g., "int", "Node *")
    value: string;  // value as string
}

/** One frame of the call stack, as -stack-list-frames reports it. */
export interface GDBFrame {
    level: number;
    func: string;
    /** Source file, or '' where GDB has no source — libc, a PLT stub, the CRT. */
    file: string;
    fullname: string;
    line: number;
}

export interface GDBStopInfo {
    reason: string;
    line: number;
    file: string;
    func: string;
}

export type STLKind = 'stack' | 'queue' | 'priority_queue' | 'vector' | 'deque' | 'unordered_map' | 'map';

export interface STLSnapshot {
    kind: STLKind;
    size: number;
    /** Most-recently-pushed value (top() for stack/PQ, back() for vector/deque/queue). */
    pushValue?: string;
    /** For map/unordered_map: enumerated entries, captured via pretty printer. */
    entries?: { key: string; value: string }[];
}

export interface GDBSnapshot {
    line: number;
    func: string;
    locals: GDBLocal[];
    /** addr (hex string) → struct fields at that address (pointer-based nodes) */
    structData: Map<string, GDBField[]>;
    /** varName → fields (scalar + array metadata) for stack-allocated structs */
    valueStructData: Map<string, GDBField[]>;
    /** "varName.field[idx]" → element value (for array-based Stack/Queue) */
    arrayReadings: Map<string, string>;
    /** varName → STL container observation (size + most recent push value) */
    stlContainers: Map<string, STLSnapshot>;
    /** Call stack: outermost → innermost function names (e.g. ['main','solve','dfs']) */
    callStack: string[];
}

export interface GDBSessionResult {
    snapshots: GDBSnapshot[];
    programOutput: string;
    timedOut: boolean;
    error?: string;
    /** The caller asked to stop; whatever is here is a partial trace nobody
     *  is waiting for. */
    aborted?: boolean;
}
