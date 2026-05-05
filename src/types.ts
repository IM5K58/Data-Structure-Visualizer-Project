// ===== Local Variables =====
export interface LocalVar {
    name: string;
    type: string;
    value: string;
    changed?: boolean; // true if changed since previous step
}

// ===== Command Types =====
export type CommandType =
    | 'PUSH'
    | 'POP'
    | 'ENQUEUE'
    | 'DEQUEUE'
    | 'ALLOCATE_NODE'
    | 'SET_FIELD'
    | 'SET_POINTER'
    | 'DELETE_NODE'
    | 'SET_LABEL'
    | 'LOCAL_VAR_UPDATE'
    | 'STACK_FRAMES'
    | 'MAP_SET'
    | 'MAP_REMOVE'
    | 'UF_UNION'
    | 'UF_FIND'
    | 'ERROR'
    | 'UNKNOWN';

export type TargetType = 'stack' | 'queue' | 'memory' | 'tree' | 'circular' | 'doubly' | 'graph' | 'heap' | 'hashmap' | 'unionfind';

export interface Command {
    type: CommandType;
    target: TargetType;
    targetName: string;
    value?: number | string | boolean | null;
    index?: number;
    size?: number;
    nodeId?: string;
    property?: string;
    pointerTo?: string | null;
    structType?: string;
    label?: string;
    raw: string;
    output?: string;
    /** Source line where this command originated (1-based) */
    line?: number;
    /** Call stack frames for STACK_FRAMES events (outermost → innermost) */
    frames?: string[];
}

// ===== Data Structure States =====
export interface StackState {
    type: 'stack';
    name: string;
    items: { id: string; value: number | string | boolean }[];
}

export interface QueueState {
    type: 'queue';
    name: string;
    items: { id: string; value: number | string | boolean }[];
}


export interface MemoryNode {
    id: string;
    type: string; // e.g., "Node"
    fields: Record<string, number | string | boolean>;
    pointers: Record<string, string | null>;
    labels: string[]; // e.g., variable names pointing to it
}

export interface MemoryState {
    type: 'memory';
    name: string;
    nodes: MemoryNode[];
}

export interface TreeState {
    type: 'tree';
    name: string;
    nodes: MemoryNode[];
    rootId: string | null;
}

export interface CircularState {
    type: 'circular';
    name: string;
    nodes: MemoryNode[];
    headId: string | null;
}

export interface DoublyState {
    type: 'doubly';
    name: string;
    nodes: MemoryNode[];
    headId: string | null;
}

export interface GraphState {
    type: 'graph';
    name: string;
    nodes: MemoryNode[];
}

export interface HeapState {
    type: 'heap';
    name: string;
    /** Items in heap-array order. items[0] is the root (max for max-heap, min for min-heap). */
    items: { id: string; value: number | string | boolean }[];
}

export interface HashMapEntry {
    id: string;
    key: string;
    value: string;
}

export interface HashMapState {
    type: 'hashmap';
    name: string;
    entries: HashMapEntry[];
}

export interface UnionFindOp {
    id: string;
    /** 'union' (combine two sets) or 'find' (lookup root); 'makeSet' is the implicit creation */
    op: 'union' | 'find' | 'makeSet';
    a: string;
    b?: string;
}

export interface UnionFindState {
    type: 'unionfind';
    name: string;
    /** parent[x] = representative element. We materialize this from union ops. */
    parent: Record<string, string>;
    /** Recent op log (newest first), bounded for display */
    ops: UnionFindOp[];
}

export type DataStructureState =
    | StackState
    | QueueState
    | MemoryState
    | TreeState
    | CircularState
    | DoublyState
    | GraphState
    | HeapState
    | HashMapState
    | UnionFindState;

// ===== Visualizer State =====
export interface VisualizerState {
    structures: DataStructureState[];
    commandHistory: Command[];
    currentStep: number;
    isRunning: boolean;
    isLoading: boolean;
    error: string | null;
    stdout: string; // Total output from backend
    terminalOutput: string; // Synchronized output shown in terminal
    stdin: string;
    localVars: LocalVar[]; // Current local variable snapshot
    callStack: string[]; // Current call-stack frames (outermost → innermost)
    breakpoints: number[]; // Source lines (1-based) where execution should pause
}

export type VisualizerAction =
    | { type: 'EXECUTE_COMMAND'; command: Command }
    | { type: 'STEP' }
    | { type: 'STEP_BACK' }
    | { type: 'RESET' }
    | { type: 'SET_RUNNING'; isRunning: boolean }
    | { type: 'SET_LOADING'; isLoading: boolean }
    | { type: 'SET_ERROR'; error: string | null }
    | { type: 'SET_STDOUT'; stdout: string }
    | { type: 'SET_STDIN'; stdin: string }
    | { type: 'LOAD_COMMANDS'; commands: Command[] }
    | { type: 'SET_LOCAL_VARS'; localVars: LocalVar[] }
    | { type: 'TOGGLE_BREAKPOINT'; line: number }
    | { type: 'CLEAR_BREAKPOINTS' };
