import { useReducer, useCallback, useRef } from 'react';
import type {
    VisualizerState,
    VisualizerAction,
    Command,
    DataStructureState,
    StackState,
    QueueState,
    ArrayState,
    LinkedListState,
} from '../types';
import { nextId, resetParserIds, parseCodeWithContext } from '../utils/parser';

const initialState: VisualizerState = {
    structures: [],
    commandHistory: [],
    currentStep: -1,
    isRunning: false,
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
        case 'array':
            newStructure = { type: 'array', name: targetName, items: [] };
            break;
        case 'linkedlist':
            newStructure = { type: 'linkedlist', name: targetName, nodes: [] };
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
            case 'ARRAY_DECLARE': {
                const arr = s as ArrayState;
                const items = Array.from({ length: command.size! }, (_, i) => ({
                    id: nextId(),
                    value: null as number | null,
                    index: i,
                }));
                return { ...arr, items };
            }
            case 'ARRAY_SET': {
                const arr = s as ArrayState;
                return {
                    ...arr,
                    items: arr.items.map((item) =>
                        item.index === command.index
                            ? { ...item, value: command.value! }
                            : item
                    ),
                };
            }
            case 'LIST_INSERT': {
                const list = s as LinkedListState;
                return {
                    ...list,
                    nodes: [...list.nodes, { id: nextId(), value: command.value! }],
                };
            }
            case 'LIST_REMOVE': {
                const list = s as LinkedListState;
                if (list.nodes.length === 0) return list;
                if (command.value !== undefined) {
                    const idx = list.nodes.findIndex((n) => n.value === command.value);
                    if (idx === -1) return list;
                    return {
                        ...list,
                        nodes: list.nodes.filter((_, i) => i !== idx),
                    };
                }
                // Default: remove last
                return {
                    ...list,
                    nodes: list.nodes.slice(0, -1),
                };
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
            };
        }
        case 'STEP_BACK': {
            if (state.currentStep <= -1) return state;
            const prevStep = state.currentStep - 1;
            if (prevStep < 0) {
                resetParserIds();
                return { ...state, structures: [], currentStep: -1 };
            }
            return {
                ...state,
                structures: replayToStep(state.commandHistory, prevStep),
                currentStep: prevStep,
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
            };
        case 'SET_RUNNING':
            return { ...state, isRunning: action.isRunning };
        default:
            return state;
    }
}

export function useVisualizer() {
    const [state, dispatch] = useReducer(reducer, initialState);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const speedRef = useRef(500);

    const loadCode = useCallback((code: string) => {
        stopAutoRun();
        const commands = parseCodeWithContext(code);
        dispatch({ type: 'LOAD_COMMANDS', commands });
    }, []);

    const step = useCallback(() => {
        dispatch({ type: 'STEP' });
    }, []);

    const stepBack = useCallback(() => {
        dispatch({ type: 'STEP_BACK' });
    }, []);

    const stopAutoRun = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        dispatch({ type: 'SET_RUNNING', isRunning: false });
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

    return {
        state,
        loadCode,
        step,
        stepBack,
        run,
        reset,
        stopAutoRun,
        setSpeed,
    };
}
