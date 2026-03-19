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
    | 'ERROR'
    | 'UNKNOWN';

export type TargetType = 'stack' | 'queue' | 'memory' | 'tree';

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

export type DataStructureState =
    | StackState
    | QueueState
    | MemoryState
    | TreeState;

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
    | { type: 'LOAD_COMMANDS'; commands: Command[] };
