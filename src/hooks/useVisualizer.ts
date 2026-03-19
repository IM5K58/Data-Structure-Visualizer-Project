import { useReducer, useCallback, useRef } from 'react';
import type {
    VisualizerState,
    VisualizerAction,
    Command,
    DataStructureState,
    StackState,
    QueueState,
    MemoryState,
    TreeState,
} from '../types';
import { nextId, resetParserIds } from '../utils/ids';
import { compileCode } from '../api/compilerApi';
import { mapTraceToCommands } from '../engine/stepMapper';
const initialState: VisualizerState = {
    structures: [],
    commandHistory: [],
    currentStep: -1,
    isRunning: false,
    isLoading: false,
    error: null,
    stdout: '',
    terminalOutput: '',
    stdin: '',
};

function findOrCreateStructure(
    structures: DataStructureState[],
    target: Command['target'],
    targetName: string
): DataStructureState[] {
    const exists = structures.find(
        (s) => s.type === target && s.name === targetName
    );
    if (exists) return structures;

    let newStructure: DataStructureState;
    switch (target) {
        case 'stack':
            newStructure = { type: 'stack', name: targetName, items: [] };
            break;
        case 'queue':
            newStructure = { type: 'queue', name: targetName, items: [] };
            break;
        case 'memory':
            newStructure = { type: 'memory', name: targetName, nodes: [] };
            break;
        case 'tree':
            newStructure = { type: 'tree', name: targetName, nodes: [], rootId: null };
            break;
    }
    return [...structures, newStructure];
}

function executeCommand(
    structures: DataStructureState[],
    command: Command
): DataStructureState[] {
    structures = findOrCreateStructure(structures, command.target, command.targetName);

    return structures.map((s) => {
        if (s.name !== command.targetName || s.type !== command.target) return s;

        switch (command.type) {
            case 'PUSH': {
                const stack = s as StackState;
                return {
                    ...stack,
                    items: [...stack.items, { id: nextId(), value: command.value! }],
                };
            }
            case 'POP': {
                const stack = s as StackState;
                if (stack.items.length === 0) return stack;
                return {
                    ...stack,
                    items: stack.items.slice(0, -1),
                };
            }
            case 'ENQUEUE': {
                const queue = s as QueueState;
                return {
                    ...queue,
                    items: [...queue.items, { id: nextId(), value: command.value! }],
                };
            }
            case 'DEQUEUE': {
                const queue = s as QueueState;
                if (queue.items.length === 0) return queue;
                return {
                    ...queue,
                    items: queue.items.slice(1),
                };
            }
            case 'ALLOCATE_NODE': {
                if (s.type === 'tree') {
                    const tree = s as TreeState;
                    const newNode = {
                        id: command.nodeId!,
                        type: command.structType || 'Node',
                        fields: {},
                        pointers: {},
                        labels: command.label ? [command.label] : []
                    };
                    return {
                        ...tree,
                        nodes: [...tree.nodes, newNode],
                        rootId: tree.rootId ?? command.nodeId!,
                    };
                }
                if (s.type !== 'memory') return s;
                const mem = s as MemoryState;
                return {
                    ...mem,
                    nodes: [...mem.nodes, {
                        id: command.nodeId!,
                        type: command.structType || 'Node',
                        fields: {},
                        pointers: {},
                        labels: command.label ? [command.label] : []
                    }]
                };
            }
            case 'SET_LABEL': {
                if (s.type !== 'memory' && s.type !== 'tree') return s;
                const state = s as MemoryState | TreeState;
                const label = command.label!;
                const targetNodeId = command.nodeId;

                return {
                    ...state,
                    nodes: state.nodes.map(n => {
                        const filteredLabels = n.labels.filter(l => l !== label);
                        if (n.id === targetNodeId) {
                            return { ...n, labels: [...filteredLabels, label] };
                        }
                        return { ...n, labels: filteredLabels };
                    })
                };
            }
            case 'SET_FIELD': {
                if (s.type !== 'memory' && s.type !== 'tree') return s;
                const state = s as MemoryState | TreeState;
                return {
                    ...state,
                    nodes: state.nodes.map(n =>
                        n.id === command.nodeId
                            ? { ...n, fields: { ...n.fields, [command.property!]: command.value as number | string | boolean } }
                            : n
                    )
                };
            }
            case 'SET_POINTER': {
                if (s.type !== 'memory' && s.type !== 'tree') return s;
                const state = s as MemoryState | TreeState;
                return {
                    ...state,
                    nodes: state.nodes.map(n =>
                        n.id === command.nodeId
                            ? { ...n, pointers: { ...n.pointers, [command.property!]: command.pointerTo || null } }
                            : n
                    )
                };
            }
            case 'DELETE_NODE': {
                if (s.type !== 'memory' && s.type !== 'tree') return s;
                const state = s as MemoryState | TreeState;
                const filtered = state.nodes.filter(n => n.id !== command.nodeId);
                if (s.type === 'tree') {
                    const tree = state as TreeState;
                    return {
                        ...tree,
                        nodes: filtered,
                        rootId: tree.rootId === command.nodeId ? (filtered.length > 0 ? filtered[0].id : null) : tree.rootId,
                    };
                }
                return { ...state, nodes: filtered };
            }
            default:
                return s;
        }
    });
}

function replayToStep(commands: Command[], targetStep: number): DataStructureState[] {
    resetParserIds();
    let structures: DataStructureState[] = [];
    for (let i = 0; i <= targetStep; i++) {
        structures = executeCommand(structures, commands[i]);
    }
    return structures;
}

function reducer(state: VisualizerState, action: VisualizerAction): VisualizerState {
    switch (action.type) {
        case 'LOAD_COMMANDS':
            resetParserIds();
            return {
                ...initialState,
                commandHistory: action.commands,
                currentStep: -1,
            };
        case 'STEP': {
            const nextStep = state.currentStep + 1;
            if (nextStep >= state.commandHistory.length) {
                return { ...state, isRunning: false };
            }
            const command = state.commandHistory[nextStep];
            return {
                ...state,
                structures: executeCommand(state.structures, command),
                currentStep: nextStep,
                terminalOutput: state.terminalOutput + (command.output || ''),
            };
        }
        case 'STEP_BACK': {
            if (state.currentStep <= -1) return state;
            const prevStep = state.currentStep - 1;
            
            // Re-calculate terminal output up to prevStep
            let newTerminalOutput = '';
            for (let i = 0; i <= prevStep; i++) {
                newTerminalOutput += (state.commandHistory[i].output || '');
            }

            if (prevStep < 0) {
                resetParserIds();
                return { ...state, structures: [], currentStep: -1, terminalOutput: '' };
            }
            return {
                ...state,
                structures: replayToStep(state.commandHistory, prevStep),
                currentStep: prevStep,
                terminalOutput: newTerminalOutput,
            };
        }
        case 'EXECUTE_COMMAND':
            return {
                ...state,
                structures: executeCommand(state.structures, action.command),
            };
        case 'RESET':
            resetParserIds();
            return {
                ...initialState,
                commandHistory: state.commandHistory,
                stdin: state.stdin, // Keep stdin
            };
        case 'SET_RUNNING':
            return { ...state, isRunning: action.isRunning };
        case 'SET_LOADING':
            return { ...state, isLoading: action.isLoading };
        case 'SET_ERROR':
            return { ...state, error: action.error };
        case 'SET_STDOUT':
            return { ...state, stdout: action.stdout };
        case 'SET_STDIN':
            return { ...state, stdin: action.stdin };
        default:
            return state;
    }
}

export function useVisualizer() {
    const [state, dispatch] = useReducer(reducer, initialState);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const speedRef = useRef(500);

    const stopAutoRun = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        dispatch({ type: 'SET_RUNNING', isRunning: false });
    }, []);

    const stdinRef = useRef(state.stdin);
    stdinRef.current = state.stdin;

    const loadCode = useCallback(async (code: string) => {
        stopAutoRun();
        dispatch({ type: 'SET_LOADING', isLoading: true });
        dispatch({ type: 'SET_ERROR', error: null });
        dispatch({ type: 'SET_STDOUT', stdout: '' });

        try {
            const response = await compileCode(code, stdinRef.current);
            if (!response.success && response.error) {
                dispatch({ type: 'SET_ERROR', error: response.error.message });

                // Create virtual error commands to show in the Command Log as requested
                const errorCommands: Command[] = response.error.message.split('\n').filter(line => line.trim()).map(line => ({
                    type: 'ERROR',
                    target: 'memory',
                    targetName: 'error',
                    raw: line.trim()
                }));

                dispatch({ type: 'LOAD_COMMANDS', commands: errorCommands });
                return false;
            }

            const commands = mapTraceToCommands(response.steps);
            dispatch({ type: 'SET_STDOUT', stdout: response.stdout });
            dispatch({ type: 'LOAD_COMMANDS', commands });
            return true;
        } catch (err: any) {
            dispatch({ type: 'SET_ERROR', error: err.message || 'Failed to compile/execute code.' });
            dispatch({ type: 'LOAD_COMMANDS', commands: [] });
            return false;
        } finally {
            dispatch({ type: 'SET_LOADING', isLoading: false });
        }
    }, [stopAutoRun]);

    const step = useCallback(() => {
        dispatch({ type: 'STEP' });
    }, []);

    const stepBack = useCallback(() => {
        dispatch({ type: 'STEP_BACK' });
    }, []);


    const run = useCallback(() => {
        stopAutoRun();
        dispatch({ type: 'SET_RUNNING', isRunning: true });
        intervalRef.current = setInterval(() => {
            dispatch({ type: 'STEP' });
        }, speedRef.current);
    }, [stopAutoRun]);

    const reset = useCallback(() => {
        stopAutoRun();
        dispatch({ type: 'RESET' });
    }, [stopAutoRun]);

    const setSpeed = useCallback((ms: number) => {
        speedRef.current = ms;
        if (state.isRunning) {
            stopAutoRun();
            dispatch({ type: 'SET_RUNNING', isRunning: true });
            intervalRef.current = setInterval(() => {
                dispatch({ type: 'STEP' });
            }, ms);
        }
    }, [state.isRunning, stopAutoRun]);

    const setStdin = useCallback((stdin: string) => {
        dispatch({ type: 'SET_STDIN', stdin });
    }, []);

    return {
        state,
        loadCode,
        step,
        stepBack,
        run,
        reset,
        stopAutoRun,
        setSpeed,
        setStdin,
    };
}
