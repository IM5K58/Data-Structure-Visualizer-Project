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
    | 'UNKNOWN';

export type TargetType = 'stack' | 'queue' | 'array' | 'linkedlist';

export interface Command {
    type: CommandType;
    target: TargetType;
    targetName: string;
    value?: number | string | boolean;
    index?: number;
    size?: number;
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

export type DataStructureState =
    | StackState
    | QueueState
    | ArrayState
    | LinkedListState;

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
