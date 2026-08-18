import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useVisualizer';
import type { Command, HeapState, VisualizerState } from '../../types';

function cmd(partial: Partial<Command> & Pick<Command, 'type' | 'target' | 'targetName'>): Command {
    return { raw: '', ...partial };
}

/** Run a list of commands through the reducer from a clean load. */
function runAll(commands: Command[], base: Partial<VisualizerState> = {}): VisualizerState {
    let state: VisualizerState = { ...initialState, ...base };
    state = reducer(state, { type: 'LOAD_COMMANDS', commands });
    for (let i = 0; i < commands.length; i++) {
        state = reducer(state, { type: 'STEP' });
    }
    return state;
}

function heapOf(state: VisualizerState, name: string): HeapState {
    const s = state.structures.find(x => x.type === 'heap' && x.name === name);
    if (!s || s.type !== 'heap') throw new Error(`no heap named ${name}`);
    return s;
}

describe('LOAD_COMMANDS', () => {
    it('preserves breakpoints set before the first compile', () => {
        let state: VisualizerState = { ...initialState };
        state = reducer(state, { type: 'TOGGLE_BREAKPOINT', line: 12 });
        expect(state.breakpoints).toEqual([12]);

        state = reducer(state, { type: 'LOAD_COMMANDS', commands: [] });
        expect(state.breakpoints).toEqual([12]);
    });

    it('preserves stdin typed into the terminal', () => {
        let state: VisualizerState = { ...initialState };
        state = reducer(state, { type: 'SET_STDIN', stdin: '5 7\n' });
        state = reducer(state, { type: 'LOAD_COMMANDS', commands: [] });
        expect(state.stdin).toBe('5 7\n');
    });

    it('preserves a warning dispatched before it', () => {
        let state: VisualizerState = { ...initialState };
        state = reducer(state, { type: 'SET_WARNING', warning: 'tracing unavailable' });
        state = reducer(state, { type: 'LOAD_COMMANDS', commands: [] });
        expect(state.warning).toBe('tracing unavailable');
        // A notice is not a failure.
        expect(state.error).toBeNull();
    });

    it('does not clobber an error dispatched before it', () => {
        let state: VisualizerState = { ...initialState };
        state = reducer(state, { type: 'SET_ERROR', error: 'compile failed' });
        state = reducer(state, { type: 'LOAD_COMMANDS', commands: [] });
        expect(state.error).toBe('compile failed');
    });

    it('still clears replay state', () => {
        let state: VisualizerState = {
            ...initialState,
            structures: [{ type: 'stack', name: 's', items: [{ id: 'a', value: 1 }] }],
            currentStep: 4,
            terminalOutput: 'old',
            callStack: ['main'],
        };
        state = reducer(state, { type: 'LOAD_COMMANDS', commands: [] });
        expect(state.structures).toEqual([]);
        expect(state.currentStep).toBe(-1);
        expect(state.terminalOutput).toBe('');
        expect(state.callStack).toEqual([]);
    });
});

describe('RESET', () => {
    it('keeps breakpoints and stdin', () => {
        let state: VisualizerState = { ...initialState };
        state = reducer(state, { type: 'TOGGLE_BREAKPOINT', line: 3 });
        state = reducer(state, { type: 'SET_STDIN', stdin: 'abc' });
        state = reducer(state, { type: 'RESET' });
        expect(state.breakpoints).toEqual([3]);
        expect(state.stdin).toBe('abc');
    });
});

describe('ERROR commands', () => {
    it('does not materialize an empty memory structure', () => {
        const state = runAll([
            cmd({ type: 'ERROR', target: 'memory', targetName: 'error', raw: 'main.cpp:3: error' }),
        ]);
        expect(state.structures).toEqual([]);
        expect(state.currentStep).toBe(0);
    });
});

describe('heap PUSH', () => {
    it('sifts a larger value up to the root of a max-heap', () => {
        const state = runAll([
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 5 }),
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 3 }),
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 9 }),
        ]);
        expect(heapOf(state, 'h').items.map(i => i.value)).toEqual([9, 3, 5]);
    });

    it('sifts a smaller value up when the data reads as a min-heap', () => {
        // [3,5] reads as a min-heap, so inserting 1 swaps it with its parent
        // (index 0), leaving 5 where it was.
        const state = runAll([
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 3 }),
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 5 }),
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 1 }),
        ]);
        expect(heapOf(state, 'h').items.map(i => i.value)).toEqual([1, 5, 3]);
    });

    it('orders numerically, not lexicographically', () => {
        // [9,2] reads as a max-heap. 10 must beat 9 for the root — a string
        // comparison would rank "10" below "9" and leave 9 on top.
        const state = runAll([
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 9 }),
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 2 }),
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 10 }),
        ]);
        expect(heapOf(state, 'h').items[0].value).toBe(10);
    });
});

describe('heap POP', () => {
    it('moves the last element to the root and sifts down, preserving the invariant', () => {
        const state = runAll([
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 10 }),
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 8 }),
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 6 }),
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 4 }),
            cmd({ type: 'POP', target: 'heap', targetName: 'h' }),
        ]);
        const values = heapOf(state, 'h').items.map(i => Number(i.value));
        expect(values).toHaveLength(3);
        expect(values).not.toContain(10);
        // Every parent must still dominate its children.
        for (let i = 1; i < values.length; i++) {
            expect(values[Math.floor((i - 1) / 2)]).toBeGreaterThanOrEqual(values[i]);
        }
    });

    it('empties a single-element heap', () => {
        const state = runAll([
            cmd({ type: 'PUSH', target: 'heap', targetName: 'h', value: 1 }),
            cmd({ type: 'POP', target: 'heap', targetName: 'h' }),
        ]);
        expect(heapOf(state, 'h').items).toEqual([]);
    });
});

describe('stack and queue routing', () => {
    it('does not let a PUSH mutate a same-named queue', () => {
        const state = runAll([
            cmd({ type: 'ENQUEUE', target: 'queue', targetName: 'q', value: 1 }),
            cmd({ type: 'PUSH', target: 'stack', targetName: 'q', value: 2 }),
        ]);
        const queue = state.structures.find(s => s.type === 'queue');
        const stack = state.structures.find(s => s.type === 'stack');
        expect(queue && queue.type === 'queue' && queue.items).toHaveLength(1);
        expect(stack && stack.type === 'stack' && stack.items).toHaveLength(1);
    });

    it('pops from the end of a stack and the front of a queue', () => {
        const state = runAll([
            cmd({ type: 'PUSH', target: 'stack', targetName: 's', value: 1 }),
            cmd({ type: 'PUSH', target: 'stack', targetName: 's', value: 2 }),
            cmd({ type: 'POP', target: 'stack', targetName: 's' }),
            cmd({ type: 'ENQUEUE', target: 'queue', targetName: 'q', value: 1 }),
            cmd({ type: 'ENQUEUE', target: 'queue', targetName: 'q', value: 2 }),
            cmd({ type: 'DEQUEUE', target: 'queue', targetName: 'q' }),
        ]);
        const stack = state.structures.find(s => s.type === 'stack');
        const queue = state.structures.find(s => s.type === 'queue');
        expect(stack?.type === 'stack' && stack.items.map(i => i.value)).toEqual([1]);
        expect(queue?.type === 'queue' && queue.items.map(i => i.value)).toEqual([2]);
    });
});

describe('STEP_BACK', () => {
    it('replays to an identical state, with stable item ids', () => {
        const commands = [
            cmd({ type: 'PUSH', target: 'stack', targetName: 's', value: 1 }),
            cmd({ type: 'PUSH', target: 'stack', targetName: 's', value: 2 }),
            cmd({ type: 'PUSH', target: 'stack', targetName: 's', value: 3 }),
        ];
        const forward = runAll(commands.slice(0, 2));
        const rewound = reducer(runAll(commands), { type: 'STEP_BACK' });

        const a = forward.structures.find(s => s.type === 'stack');
        const b = rewound.structures.find(s => s.type === 'stack');
        expect(a?.type === 'stack' && a.items).toEqual(b?.type === 'stack' && b.items);
    });
});

describe('malformed commands', () => {
    it('ignores SET_FIELD without a property name', () => {
        const state = runAll([
            cmd({ type: 'ALLOCATE_NODE', target: 'memory', targetName: 'heap', nodeId: 'n1' }),
            cmd({ type: 'SET_FIELD', target: 'memory', targetName: 'heap', nodeId: 'n1', value: 7 }),
        ]);
        const mem = state.structures.find(s => s.type === 'memory');
        expect(mem?.type === 'memory' && mem.nodes[0].fields).toEqual({});
    });

    it('ignores ALLOCATE_NODE without a node id', () => {
        const state = runAll([
            cmd({ type: 'ALLOCATE_NODE', target: 'memory', targetName: 'heap' }),
        ]);
        const mem = state.structures.find(s => s.type === 'memory');
        expect(mem?.type === 'memory' && mem.nodes).toEqual([]);
    });
});
