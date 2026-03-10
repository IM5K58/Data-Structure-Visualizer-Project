// ===== Command Types =====
export type CommandType =
    | 'PUSH'
    | 'POP'
    | 'ENQUEUE'
    | 'DEQUEUE'
    | 'ARRAY_DECLARE'
    | 'ARRAY_SET'
    | 'LIST_INSERT'
    | 'LIST_REMOVE'
    | 'TREE_INSERT'
    | 'TREE_DELETE'
    | 'ALLOCATE_NODE'
    | 'SET_FIELD'
    | 'SET_POINTER'
    | 'DELETE_NODE'
    | 'UNKNOWN';

export type TargetType = 'stack' | 'queue' | 'array' | 'linkedlist' | 'tree' | 'memory';

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
    raw: string;
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

export interface ArrayState {
    type: 'array';
    name: string;
    items: { id: string; value: number | string | boolean | null; index: number }[];
}

export interface LinkedListNode {
    id: string;
    value: number | string | boolean;
}

export interface LinkedListState {
    type: 'linkedlist';
    name: string;
    nodes: LinkedListNode[];
}

export interface TreeNode {
    id: string;
    value: number;
    left: TreeNode | null;
    right: TreeNode | null;
}

export interface TreeState {
    type: 'tree';
    name: string;
    root: TreeNode | null;
}

export interface MemoryNode {
    id: string;
    type: string; // e.g., "Node"
    fields: Record<string, number | string | boolean>;
    pointers: Record<string, string | null>;
    label?: string; // e.g., variable name pointing to it
}

export interface MemoryState {
    type: 'memory';
    name: string;
    nodes: MemoryNode[];
}

export type DataStructureState =
    | StackState
    | QueueState
    | ArrayState
    | LinkedListState
    | TreeState
    | MemoryState;

// ===== Visualizer State =====
export interface VisualizerState {
    structures: DataStructureState[];
    commandHistory: Command[];
    currentStep: number;
    isRunning: boolean;
}

export type VisualizerAction =
    | { type: 'EXECUTE_COMMAND'; command: Command }
    | { type: 'STEP' }
    | { type: 'STEP_BACK' }
    | { type: 'RESET' }
    | { type: 'SET_RUNNING'; isRunning: boolean }
    | { type: 'LOAD_COMMANDS'; commands: Command[] };
