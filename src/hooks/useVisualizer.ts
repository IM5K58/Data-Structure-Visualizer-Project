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
    CircularState,
    DoublyState,
    GraphState,
    HeapState,
    HashMapState,
    UnionFindState,
    LocalVar,
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
    localVars: [],
    callStack: [],
    breakpoints: [],
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
        case 'circular':
            newStructure = { type: 'circular', name: targetName, nodes: [], headId: null };
            break;
        case 'doubly':
            newStructure = { type: 'doubly', name: targetName, nodes: [], headId: null };
            break;
        case 'graph':
            newStructure = { type: 'graph', name: targetName, nodes: [] };
            break;
        case 'heap':
            newStructure = { type: 'heap', name: targetName, items: [] };
            break;
        case 'hashmap':
            newStructure = { type: 'hashmap', name: targetName, entries: [] };
            break;
        case 'unionfind':
            newStructure = { type: 'unionfind', name: targetName, parent: {}, ops: [] };
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
                if (s.type === 'heap') {
                    const heap = s as HeapState;
                    return {
                        ...heap,
                        items: [...heap.items, { id: nextId(), value: command.value! }],
                    };
                }
                const stack = s as StackState;
                return {
                    ...stack,
                    items: [...stack.items, { id: nextId(), value: command.value! }],
                };
            }
            case 'POP': {
                if (s.type === 'heap') {
                    const heap = s as HeapState;
                    if (heap.items.length === 0) return heap;
                    // Heap pop removes the root (index 0). The last element conceptually
                    // moves to root then sifts down — but we don't have full visibility
                    // into priority_queue internals, so we just remove the root and let
                    // the next snapshot fill in the new top via a fresh MAP-like read.
                    return { ...heap, items: heap.items.slice(1) };
                }
                const stack = s as StackState;
                if (stack.items.length === 0) return stack;
                return {
                    ...stack,
                    items: stack.items.slice(0, -1),
                };
            }
            case 'MAP_SET': {
                if (s.type !== 'hashmap') return s;
                const map = s as HashMapState;
                const key = command.property ?? '';
                const value = String(command.value ?? '');
                const idx = map.entries.findIndex(e => e.key === key);
                if (idx >= 0) {
                    const next = map.entries.slice();
                    next[idx] = { ...next[idx], value };
                    return { ...map, entries: next };
                }
                return { ...map, entries: [...map.entries, { id: nextId(), key, value }] };
            }
            case 'MAP_REMOVE': {
                if (s.type !== 'hashmap') return s;
                const map = s as HashMapState;
                const key = command.property ?? '';
                return { ...map, entries: map.entries.filter(e => e.key !== key) };
            }
            case 'UF_UNION': {
                if (s.type !== 'unionfind') return s;
                const uf = s as UnionFindState;
                const a = String(command.label ?? '');
                const b = String(command.pointerTo ?? '');
                if (!a || !b) return uf;
                // Materialize parent: union by making root(a)'s parent = root(b).
                const root = (x: string, parent: Record<string, string>): string => {
                    let cur = x;
                    const seen = new Set<string>();
                    while (parent[cur] && parent[cur] !== cur && !seen.has(cur)) {
                        seen.add(cur);
                        cur = parent[cur];
                    }
                    return cur;
                };
                const next = { ...uf.parent };
                if (!(a in next)) next[a] = a;
                if (!(b in next)) next[b] = b;
                const ra = root(a, next);
                const rb = root(b, next);
                if (ra !== rb) next[ra] = rb;
                const op = { id: nextId(), op: 'union' as const, a, b };
                return { ...uf, parent: next, ops: [op, ...uf.ops].slice(0, 20) };
            }
            case 'UF_FIND': {
                if (s.type !== 'unionfind') return s;
                const uf = s as UnionFindState;
                const x = String(command.label ?? '');
                if (!x) return uf;
                const next = { ...uf.parent };
                if (!(x in next)) next[x] = x;
                const op = { id: nextId(), op: 'find' as const, a: x };
                return { ...uf, parent: next, ops: [op, ...uf.ops].slice(0, 20) };
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
                const newNode = {
                    id: command.nodeId!,
                    type: command.structType || 'Node',
                    fields: {},
                    pointers: {},
                    labels: command.label ? [command.label] : []
                };
                if (s.type === 'tree') {
                    const tree = s as TreeState;
                    return {
                        ...tree,
                        nodes: [...tree.nodes, newNode],
                        rootId: tree.rootId ?? command.nodeId!,
                    };
                }
                if (s.type === 'circular') {
                    const circ = s as CircularState;
                    return {
                        ...circ,
                        nodes: [...circ.nodes, newNode],
                        headId: circ.headId ?? command.nodeId!,
                    };
                }
                if (s.type === 'doubly') {
                    const dl = s as DoublyState;
                    return {
                        ...dl,
                        nodes: [...dl.nodes, newNode],
                        headId: dl.headId ?? command.nodeId!,
                    };
                }
                if (s.type === 'graph') {
                    const g = s as GraphState;
                    return { ...g, nodes: [...g.nodes, newNode] };
                }
                if (s.type !== 'memory') return s;
                const mem = s as MemoryState;
                return { ...mem, nodes: [...mem.nodes, newNode] };
            }
            case 'SET_LABEL': {
                if (
                    s.type !== 'memory' && s.type !== 'tree' && s.type !== 'circular'
                    && s.type !== 'doubly' && s.type !== 'graph'
                ) return s;
                const label = command.label!;
                const targetNodeId = command.nodeId;
                return {
                    ...s,
                    nodes: s.nodes.map(n => {
                        const filteredLabels = n.labels.filter(l => l !== label);
                        if (n.id === targetNodeId) {
                            return { ...n, labels: [...filteredLabels, label] };
                        }
                        return { ...n, labels: filteredLabels };
                    })
                } as DataStructureState;
            }
            case 'SET_FIELD': {
                if (
                    s.type !== 'memory' && s.type !== 'tree' && s.type !== 'circular'
                    && s.type !== 'doubly' && s.type !== 'graph'
                ) return s;
                return {
                    ...s,
                    nodes: s.nodes.map(n =>
                        n.id === command.nodeId
                            ? { ...n, fields: { ...n.fields, [command.property!]: command.value as number | string | boolean } }
                            : n
                    )
                } as DataStructureState;
            }
            case 'SET_POINTER': {
                if (
                    s.type !== 'memory' && s.type !== 'tree' && s.type !== 'circular'
                    && s.type !== 'doubly' && s.type !== 'graph'
                ) return s;
                return {
                    ...s,
                    nodes: s.nodes.map(n =>
                        n.id === command.nodeId
                            ? { ...n, pointers: { ...n.pointers, [command.property!]: command.pointerTo || null } }
                            : n
                    )
                } as DataStructureState;
            }
            case 'DELETE_NODE': {
                if (
                    s.type !== 'memory' && s.type !== 'tree' && s.type !== 'circular'
                    && s.type !== 'doubly' && s.type !== 'graph'
                ) return s;
                const filtered = s.nodes.filter(n => n.id !== command.nodeId);
                if (s.type === 'tree') {
                    const tree = s as TreeState;
                    return {
                        ...tree,
                        nodes: filtered,
                        rootId: tree.rootId === command.nodeId ? (filtered.length > 0 ? filtered[0].id : null) : tree.rootId,
                    };
                }
                if (s.type === 'circular') {
                    const circ = s as CircularState;
                    return {
                        ...circ,
                        nodes: filtered,
                        headId: circ.headId === command.nodeId ? (filtered.length > 0 ? filtered[0].id : null) : circ.headId,
                    };
                }
                if (s.type === 'doubly') {
                    const dl = s as DoublyState;
                    return {
                        ...dl,
                        nodes: filtered,
                        headId: dl.headId === command.nodeId ? (filtered.length > 0 ? filtered[0].id : null) : dl.headId,
                    };
                }
                return { ...s, nodes: filtered } as DataStructureState;
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
        const t = commands[i].type;
        if (t === 'LOCAL_VAR_UPDATE' || t === 'STACK_FRAMES') continue;
        structures = executeCommand(structures, commands[i]);
    }
    return structures;
}

function replayLocalVarsToStep(commands: Command[], targetStep: number): LocalVar[] {
    const vars: LocalVar[] = [];
    for (let i = 0; i <= targetStep; i++) {
        const cmd = commands[i];
        if (cmd.type !== 'LOCAL_VAR_UPDATE') continue;
        const name = cmd.label ?? '';
        const value = String(cmd.value ?? '');
        const type = cmd.property ?? '';
        const isLast = i === targetStep;
        const idx = vars.findIndex(v => v.name === name);
        const entry: LocalVar = { name, type, value, changed: isLast };
        if (idx >= 0) vars[idx] = entry;
        else vars.push(entry);
    }
    return vars;
}

function replayCallStackToStep(commands: Command[], targetStep: number): string[] {
    let stack: string[] = [];
    for (let i = 0; i <= targetStep; i++) {
        const cmd = commands[i];
        if (cmd.type === 'STACK_FRAMES' && cmd.frames) stack = cmd.frames;
    }
    return stack;
}

function reducer(state: VisualizerState, action: VisualizerAction): VisualizerState {
    switch (action.type) {
        case 'LOAD_COMMANDS':
            resetParserIds();
            return {
                ...initialState,
                commandHistory: action.commands,
                currentStep: -1,
                localVars: [],
            };
        case 'STEP': {
            const nextStep = state.currentStep + 1;
            if (nextStep >= state.commandHistory.length) {
                return { ...state, isRunning: false };
            }
            const command = state.commandHistory[nextStep];

            // LOCAL_VAR_UPDATE: update localVars, skip executeCommand
            if (command.type === 'LOCAL_VAR_UPDATE') {
                const name = command.label ?? '';
                const value = String(command.value ?? '');
                const type = command.property ?? '';
                const cleared: LocalVar[] = state.localVars.map(v => ({ ...v, changed: false }));
                const idx = cleared.findIndex(v => v.name === name);
                const entry: LocalVar = { name, type, value, changed: true };
                if (idx >= 0) cleared[idx] = entry;
                else cleared.push(entry);
                return {
                    ...state,
                    currentStep: nextStep,
                    localVars: cleared,
                    terminalOutput: state.terminalOutput + (command.output || ''),
                };
            }

            // STACK_FRAMES: just refresh the call stack
            if (command.type === 'STACK_FRAMES') {
                return {
                    ...state,
                    currentStep: nextStep,
                    callStack: command.frames ?? [],
                    terminalOutput: state.terminalOutput + (command.output || ''),
                };
            }

            return {
                ...state,
                structures: executeCommand(state.structures, command),
                currentStep: nextStep,
                localVars: state.localVars.map(v => ({ ...v, changed: false })),
                terminalOutput: state.terminalOutput + (command.output || ''),
            };
        }
        case 'STEP_BACK': {
            if (state.currentStep <= -1) return state;
            const prevStep = state.currentStep - 1;

            let newTerminalOutput = '';
            for (let i = 0; i <= prevStep; i++) {
                newTerminalOutput += (state.commandHistory[i].output || '');
            }

            if (prevStep < 0) {
                resetParserIds();
                return { ...state, structures: [], localVars: [], callStack: [], currentStep: -1, terminalOutput: '' };
            }
            return {
                ...state,
                structures: replayToStep(state.commandHistory, prevStep),
                localVars: replayLocalVarsToStep(state.commandHistory, prevStep),
                callStack: replayCallStackToStep(state.commandHistory, prevStep),
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
                stdin: state.stdin,
                localVars: [],
                callStack: [],
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
        case 'SET_LOCAL_VARS':
            return { ...state, localVars: action.localVars };
        case 'TOGGLE_BREAKPOINT': {
            const has = state.breakpoints.includes(action.line);
            return {
                ...state,
                breakpoints: has
                    ? state.breakpoints.filter(l => l !== action.line)
                    : [...state.breakpoints, action.line].sort((a, b) => a - b),
            };
        }
        case 'CLEAR_BREAKPOINTS':
            return { ...state, breakpoints: [] };
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

    // Refs for the run-loop to read latest values without re-creating the interval.
    const breakpointsRef = useRef<number[]>(state.breakpoints);
    breakpointsRef.current = state.breakpoints;
    const commandHistoryRef = useRef<Command[]>(state.commandHistory);
    commandHistoryRef.current = state.commandHistory;
    const currentStepRef = useRef<number>(state.currentStep);
    currentStepRef.current = state.currentStep;

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


    /**
     * Step the run loop, then check whether we just *transitioned into* a
     * breakpoint line. We pause only on transition (line A → line B where B is
     * a breakpoint), not while we sit on the same breakpoint line — otherwise
     * a single breakpoint would never let execution continue past it.
     */
    const tickRunLoop = useCallback(() => {
        const beforeStep = currentStepRef.current;
        // Pre-step current line
        const before = beforeStep >= 0 ? commandHistoryRef.current[beforeStep]?.line ?? null : null;

        dispatch({ type: 'STEP' });

        // Inspect the step we just landed on (currentStepRef updates next render,
        // so peek directly at the next index).
        const after = beforeStep + 1;
        const nextLine = commandHistoryRef.current[after]?.line ?? null;
        if (
            nextLine !== null &&
            nextLine !== before &&
            breakpointsRef.current.includes(nextLine)
        ) {
            stopAutoRun();
        }
    }, [stopAutoRun]);

    const run = useCallback(() => {
        stopAutoRun();
        dispatch({ type: 'SET_RUNNING', isRunning: true });
        intervalRef.current = setInterval(tickRunLoop, speedRef.current);
    }, [stopAutoRun, tickRunLoop]);

    const reset = useCallback(() => {
        stopAutoRun();
        dispatch({ type: 'RESET' });
    }, [stopAutoRun]);

    const setSpeed = useCallback((ms: number) => {
        speedRef.current = ms;
        if (state.isRunning) {
            stopAutoRun();
            dispatch({ type: 'SET_RUNNING', isRunning: true });
            intervalRef.current = setInterval(tickRunLoop, ms);
        }
    }, [state.isRunning, stopAutoRun, tickRunLoop]);

    const setStdin = useCallback((stdin: string) => {
        dispatch({ type: 'SET_STDIN', stdin });
    }, []);

    const toggleBreakpoint = useCallback((line: number) => {
        dispatch({ type: 'TOGGLE_BREAKPOINT', line });
    }, []);

    const clearBreakpoints = useCallback(() => {
        dispatch({ type: 'CLEAR_BREAKPOINTS' });
    }, []);

    // Source line of the most recently executed command, if any.
    // Used to highlight the corresponding line in the editor.
    const currentLine: number | null = (() => {
        if (state.currentStep < 0) return null;
        // Walk backwards: the latest command may be a LOCAL_VAR_UPDATE without
        // a useful `line`, in which case fall back to the prior command's line.
        for (let i = state.currentStep; i >= 0; i--) {
            const ln = state.commandHistory[i]?.line;
            if (typeof ln === 'number' && ln > 0) return ln;
        }
        return null;
    })();

    // Most recent visual change — used by visualizers to pulse/highlight
    // the node or field that just got mutated.
    const lastChange: LastChange | null = (() => {
        if (state.currentStep < 0) return null;
        const cmd = state.commandHistory[state.currentStep];
        if (!cmd) return null;
        switch (cmd.type) {
            case 'ALLOCATE_NODE':
            case 'SET_FIELD':
            case 'SET_POINTER':
            case 'DELETE_NODE':
            case 'SET_LABEL':
                return {
                    target: cmd.target,
                    targetName: cmd.targetName,
                    nodeId: cmd.nodeId ?? null,
                    property: cmd.property ?? null,
                    kind: cmd.type,
                };
            case 'PUSH':
            case 'POP':
            case 'ENQUEUE':
            case 'DEQUEUE':
                return {
                    target: cmd.target,
                    targetName: cmd.targetName,
                    nodeId: null,
                    property: null,
                    kind: cmd.type,
                };
            default:
                return null;
        }
    })();

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
        currentLine,
        lastChange,
        toggleBreakpoint,
        clearBreakpoints,
    };
}

export interface LastChange {
    target: Command['target'];
    targetName: string;
    nodeId: string | null;
    property: string | null;
    kind: Command['type'];
}
