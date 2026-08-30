import { useReducer, useCallback, useEffect, useMemo, useRef } from 'react';
import type {
    VisualizerState,
    VisualizerAction,
    Command,
    DataStructureState,
    HeapState,
    LocalVar,
} from '../types';
import { nextId, resetParserIds } from '../utils/ids';
import { compileCode } from '../api/compilerApi';
import { mapTraceToCommands } from '../engine/stepMapper';

export const initialState: VisualizerState = {
    structures: [],
    commandHistory: [],
    currentStep: -1,
    isRunning: false,
    isLoading: false,
    error: null,
    warning: null,
    stdout: '',
    terminalOutput: '',
    stdin: '',
    localVars: [],
    callStack: [],
    breakpoints: [],
};

/**
 * Commands that carry diagnostics or scalar state rather than a data-structure
 * mutation. They must never reach `findOrCreateStructure`, or they materialize
 * an empty panel for a structure that doesn't exist (e.g. an `ERROR` command
 * conjuring a blank "memory" box while showing a compile failure).
 */
const NON_STRUCTURAL_COMMANDS: ReadonlySet<Command['type']> = new Set([
    'LOCAL_VAR_UPDATE',
    'STACK_FRAMES',
    'ERROR',
    'UNKNOWN',
]);

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
        default:
            // Unknown target from a malformed trace — ignore rather than pushing
            // `undefined` into the structure list.
            return structures;
    }
    return [...structures, newStructure];
}

/**
 * Compare two heap values. Numeric when both sides parse as numbers, so that
 * 10 sorts above 9 instead of below it lexicographically.
 */
function compareValues(a: number | string | boolean, b: number | string | boolean): number {
    const na = typeof a === 'boolean' ? Number(a) : Number(a);
    const nb = typeof b === 'boolean' ? Number(b) : Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
}

/**
 * Infer whether the array currently models a max-heap or a min-heap by counting
 * parent/child order violations under each interpretation. We can't see the
 * comparator the user's code uses, so we read it off the data itself; ties
 * (including the trivial 1-element heap) default to max-heap.
 */
function inferHeapIsMax(items: HeapState['items']): boolean {
    let maxViolations = 0;
    let minViolations = 0;
    for (let i = 1; i < items.length; i++) {
        const parent = items[Math.floor((i - 1) / 2)];
        const cmp = compareValues(parent.value, items[i].value);
        if (cmp < 0) maxViolations++;
        if (cmp > 0) minViolations++;
    }
    return maxViolations <= minViolations;
}

/**
 * Remove the root the way a real binary heap does: move the last element to
 * index 0, then sift it down. Plain `items.slice(1)` shifts every element left
 * by one, which reassigns every parent/child relationship and leaves the tree
 * view showing a heap the program never had.
 */
function heapPop(items: HeapState['items']): HeapState['items'] {
    if (items.length <= 1) return [];
    const isMax = inferHeapIsMax(items);
    const next = items.slice(0, -1);
    next[0] = items[items.length - 1];

    let i = 0;
    for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let best = i;
        if (left < next.length && (isMax ? compareValues(next[left].value, next[best].value) > 0
                                         : compareValues(next[left].value, next[best].value) < 0)) {
            best = left;
        }
        if (right < next.length && (isMax ? compareValues(next[right].value, next[best].value) > 0
                                          : compareValues(next[right].value, next[best].value) < 0)) {
            best = right;
        }
        if (best === i) break;
        [next[i], next[best]] = [next[best], next[i]];
        i = best;
    }
    return next;
}

/**
 * Restore the heap invariant after appending to the end of the array.
 */
function heapPush(items: HeapState['items'], entry: HeapState['items'][number]): HeapState['items'] {
    const next = [...items, entry];
    if (next.length === 1) return next;
    const isMax = inferHeapIsMax(items.length > 1 ? items : next);

    let i = next.length - 1;
    while (i > 0) {
        const parent = Math.floor((i - 1) / 2);
        const cmp = compareValues(next[i].value, next[parent].value);
        if (isMax ? cmp <= 0 : cmp >= 0) break;
        [next[i], next[parent]] = [next[parent], next[i]];
        i = parent;
    }
    return next;
}

function executeCommand(
    structures: DataStructureState[],
    command: Command
): DataStructureState[] {
    if (NON_STRUCTURAL_COMMANDS.has(command.type)) return structures;
    structures = findOrCreateStructure(structures, command.target, command.targetName);

    return structures.map((s) => {
        if (s.name !== command.targetName || s.type !== command.target) return s;

        switch (command.type) {
            case 'PUSH': {
                if (s.type === 'heap') {
                    return {
                        ...s,
                        items: heapPush(s.items, { id: nextId(), value: command.value ?? '' }),
                    };
                }
                if (s.type !== 'stack') return s;
                return {
                    ...s,
                    items: [...s.items, { id: nextId(), value: command.value ?? '' }],
                };
            }
            case 'POP': {
                if (s.type === 'heap') {
                    if (s.items.length === 0) return s;
                    return { ...s, items: heapPop(s.items) };
                }
                if (s.type !== 'stack') return s;
                if (s.items.length === 0) return s;
                return {
                    ...s,
                    items: s.items.slice(0, -1),
                };
            }
            case 'MAP_SET': {
                if (s.type !== 'hashmap') return s;
                const key = command.property ?? '';
                const value = String(command.value ?? '');
                const idx = s.entries.findIndex(e => e.key === key);
                if (idx >= 0) {
                    const next = s.entries.slice();
                    next[idx] = { ...next[idx], value };
                    return { ...s, entries: next };
                }
                return { ...s, entries: [...s.entries, { id: nextId(), key, value }] };
            }
            case 'MAP_REMOVE': {
                if (s.type !== 'hashmap') return s;
                const key = command.property ?? '';
                return { ...s, entries: s.entries.filter(e => e.key !== key) };
            }
            case 'UF_UNION': {
                if (s.type !== 'unionfind') return s;
                const uf = s;
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
                const uf = s;
                const x = String(command.label ?? '');
                if (!x) return uf;
                const next = { ...uf.parent };
                if (!(x in next)) next[x] = x;
                const op = { id: nextId(), op: 'find' as const, a: x };
                return { ...uf, parent: next, ops: [op, ...uf.ops].slice(0, 20) };
            }
            case 'ENQUEUE': {
                if (s.type !== 'queue') return s;
                return {
                    ...s,
                    items: [...s.items, { id: nextId(), value: command.value ?? '' }],
                };
            }
            case 'DEQUEUE': {
                if (s.type !== 'queue') return s;
                if (s.items.length === 0) return s;
                return {
                    ...s,
                    items: s.items.slice(1),
                };
            }
            case 'ALLOCATE_NODE': {
                if (!command.nodeId) return s;
                const newNode = {
                    id: command.nodeId,
                    type: command.structType || 'Node',
                    fields: {},
                    pointers: {},
                    labels: command.label ? [command.label] : []
                };
                if (s.type === 'tree') {
                    return {
                        ...s,
                        nodes: [...s.nodes, newNode],
                        rootId: s.rootId ?? command.nodeId,
                    };
                }
                if (s.type === 'circular' || s.type === 'doubly') {
                    return {
                        ...s,
                        nodes: [...s.nodes, newNode],
                        headId: s.headId ?? command.nodeId,
                    };
                }
                if (s.type === 'graph' || s.type === 'memory') {
                    return { ...s, nodes: [...s.nodes, newNode] };
                }
                return s;
            }
            case 'SET_LABEL': {
                if (
                    s.type !== 'memory' && s.type !== 'tree' && s.type !== 'circular'
                    && s.type !== 'doubly' && s.type !== 'graph'
                ) return s;
                if (!command.label) return s;
                const label = command.label;
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
                if (!command.property) return s;
                const property = command.property;
                return {
                    ...s,
                    nodes: s.nodes.map(n =>
                        n.id === command.nodeId
                            ? { ...n, fields: { ...n.fields, [property]: command.value ?? '' } }
                            : n
                    )
                } as DataStructureState;
            }
            case 'SET_POINTER': {
                if (
                    s.type !== 'memory' && s.type !== 'tree' && s.type !== 'circular'
                    && s.type !== 'doubly' && s.type !== 'graph'
                ) return s;
                if (!command.property) return s;
                const property = command.property;
                return {
                    ...s,
                    nodes: s.nodes.map(n =>
                        n.id === command.nodeId
                            ? { ...n, pointers: { ...n.pointers, [property]: command.pointerTo || null } }
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
                const fallbackId = filtered.length > 0 ? filtered[0].id : null;
                if (s.type === 'tree') {
                    return {
                        ...s,
                        nodes: filtered,
                        rootId: s.rootId === command.nodeId ? fallbackId : s.rootId,
                    };
                }
                if (s.type === 'circular' || s.type === 'doubly') {
                    return {
                        ...s,
                        nodes: filtered,
                        headId: s.headId === command.nodeId ? fallbackId : s.headId,
                    };
                }
                return { ...s, nodes: filtered };
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

/**
 * Fold one LOCAL_VAR_UPDATE into a list of locals.
 *
 * Shared by the forward reducer and the replay used for stepping backwards.
 * They have to agree: if one matched on name and the other on name-and-frame,
 * stepping back would land somewhere stepping forward never was.
 *
 * A variable is identified by its name AND its frame. Once the tracer steps
 * into functions, main's `n` and a callee's `n` are different variables, and
 * recursion gives one function several live frames at once — matching on the
 * name alone made every crossing look like a change, and the value flickered.
 */
function applyLocalVar(vars: LocalVar[], cmd: Command, changed: boolean): LocalVar[] {
    const entry: LocalVar = {
        name: cmd.label ?? '',
        type: cmd.property ?? '',
        value: String(cmd.value ?? ''),
        frame: cmd.frames?.join('/'),
        changed,
    };
    const idx = vars.findIndex(v => v.name === entry.name && v.frame === entry.frame);
    if (idx >= 0) {
        const next = vars.slice();
        next[idx] = entry;
        return next;
    }
    return [...vars, entry];
}

function replayLocalVarsToStep(commands: Command[], targetStep: number): LocalVar[] {
    let vars: LocalVar[] = [];
    for (let i = 0; i <= targetStep; i++) {
        const cmd = commands[i];
        if (cmd.type !== 'LOCAL_VAR_UPDATE') continue;
        vars = applyLocalVar(vars, cmd, i === targetStep);
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

/** Exported for tests — the hook is the only production caller. */
export function reducer(state: VisualizerState, action: VisualizerAction): VisualizerState {
    switch (action.type) {
        case 'LOAD_COMMANDS':
            // Reset only the replay state. Spreading `initialState` here would also
            // wipe `breakpoints` (set by the user in the editor gutter before the
            // first Run), `stdin` (typed in the terminal), and the `error`/`stdout`
            // that `loadCode` dispatches immediately before this action.
            resetParserIds();
            return {
                ...state,
                structures: [],
                commandHistory: action.commands,
                currentStep: -1,
                isRunning: false,
                terminalOutput: '',
                localVars: [],
                callStack: [],
            };
        case 'STEP': {
            const nextStep = state.currentStep + 1;
            if (nextStep >= state.commandHistory.length) {
                return { ...state, isRunning: false };
            }
            const command = state.commandHistory[nextStep];

            // LOCAL_VAR_UPDATE: update localVars, skip executeCommand
            if (command.type === 'LOCAL_VAR_UPDATE') {
                const cleared = state.localVars.map(v => ({ ...v, changed: false }));
                return {
                    ...state,
                    currentStep: nextStep,
                    localVars: applyLocalVar(cleared, command, true),
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
                breakpoints: state.breakpoints,
                localVars: [],
                callStack: [],
            };
        case 'SET_RUNNING':
            return { ...state, isRunning: action.isRunning };
        case 'SET_LOADING':
            return { ...state, isLoading: action.isLoading };
        case 'SET_ERROR':
            return { ...state, error: action.error };
        case 'SET_WARNING':
            return { ...state, warning: action.warning };
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

    // Guards against overlapping compiles: a second Run aborts the first, and
    // only the newest request is allowed to write its result into state.
    const requestGenRef = useRef(0);
    const inFlightRef = useRef<AbortController | null>(null);

    const loadCode = useCallback(async (code: string) => {
        stopAutoRun();
        inFlightRef.current?.abort();
        const controller = new AbortController();
        inFlightRef.current = controller;
        const gen = ++requestGenRef.current;
        const isStale = () => gen !== requestGenRef.current;

        dispatch({ type: 'SET_LOADING', isLoading: true });
        dispatch({ type: 'SET_ERROR', error: null });
        dispatch({ type: 'SET_WARNING', warning: null });
        dispatch({ type: 'SET_STDOUT', stdout: '' });

        try {
            const response = await compileCode(code, stdinRef.current, controller.signal);
            if (isStale()) return false;

            if (!response.success && response.error) {
                // Command log first, then the error — LOAD_COMMANDS resets replay
                // state, so anything dispatched before it that LOAD_COMMANDS also
                // touches would be lost.
                const errorCommands: Command[] = response.error.message
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => ({
                        type: 'ERROR',
                        target: 'memory',
                        targetName: 'error',
                        raw: line.trim(),
                    }));
                dispatch({ type: 'LOAD_COMMANDS', commands: errorCommands });
                dispatch({ type: 'SET_ERROR', error: response.error.message });
                return false;
            }

            const commands = mapTraceToCommands(response.steps);
            dispatch({ type: 'LOAD_COMMANDS', commands });
            dispatch({ type: 'SET_STDOUT', stdout: response.stdout });

            // The run succeeded — these go to the warning channel, not `error`.
            // Showing a truncated-but-valid trace in the same red box as a compile
            // failure told the user their program was broken when it wasn't.
            const notices: string[] = [];
            if (response.notice) notices.push(response.notice);
            if (response.truncated) {
                notices.push(
                    'Trace was truncated: the program exceeded the tracer\'s step or time limit. '
                    + 'The visualization below is incomplete.'
                );
            }
            if (notices.length > 0) {
                dispatch({ type: 'SET_WARNING', warning: notices.join('\n\n') });
            }
            return true;
        } catch (err) {
            if (isStale() || (err instanceof DOMException && err.name === 'AbortError')) return false;
            dispatch({ type: 'LOAD_COMMANDS', commands: [] });
            dispatch({
                type: 'SET_ERROR',
                error: err instanceof Error ? err.message : 'Failed to compile/execute code.',
            });
            return false;
        } finally {
            if (!isStale()) {
                inFlightRef.current = null;
                dispatch({ type: 'SET_LOADING', isLoading: false });
            }
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

    // Tear down the run-loop timer and any in-flight compile on unmount so they
    // don't keep dispatching into a dead reducer.
    useEffect(() => () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        inFlightRef.current?.abort();
    }, []);

    // Source line of the most recently executed command, if any.
    // Used to highlight the corresponding line in the editor.
    const currentLine: number | null = useMemo(() => {
        if (state.currentStep < 0) return null;
        // Walk backwards: the latest command may be a LOCAL_VAR_UPDATE without
        // a useful `line`, in which case fall back to the prior command's line.
        for (let i = state.currentStep; i >= 0; i--) {
            const ln = state.commandHistory[i]?.line;
            if (typeof ln === 'number' && ln > 0) return ln;
        }
        return null;
    }, [state.currentStep, state.commandHistory]);

    // Most recent visual change — used by visualizers to pulse/highlight
    // the node or field that just got mutated. Memoized so its identity is
    // stable across unrelated re-renders (panel drags, resizes); the views key
    // their pulse timers off this object.
    const lastChange: LastChange | null = useMemo(() => {
        if (state.currentStep < 0) return null;
        const cmd = state.commandHistory[state.currentStep];
        if (!cmd) return null;
        switch (cmd.type) {
            case 'ALLOCATE_NODE':
            case 'SET_FIELD':
            case 'SET_POINTER':
            case 'DELETE_NODE':
            case 'SET_LABEL':
            case 'MAP_SET':
            case 'MAP_REMOVE':
                return {
                    target: cmd.target,
                    targetName: cmd.targetName,
                    nodeId: cmd.nodeId ?? null,
                    property: cmd.property ?? null,
                    kind: cmd.type,
                };
            case 'UF_UNION':
            case 'UF_FIND':
                return {
                    target: cmd.target,
                    targetName: cmd.targetName,
                    nodeId: cmd.label ?? null,
                    property: cmd.pointerTo ?? null,
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
    }, [state.currentStep, state.commandHistory]);

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
