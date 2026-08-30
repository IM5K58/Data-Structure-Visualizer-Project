import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../useVisualizer';
import { mapTraceToCommands } from '../../engine/stepMapper';
import type { Command, LocalVar, VisualizerState } from '../../types';
import type { TraceStep } from '../../api/compilerApi';

/**
 * Locals are scoped to their frame in the panel, not just in the mapper.
 *
 * The backend already keys them per frame, so `n` in main and `n` in a callee
 * arrive as separate updates. Without the same distinction here they land in
 * the same slot and the panel shows one variable being set twice — values that
 * are individually correct and collectively a lie.
 */

function localVarStep(step: number, name: string, value: string, frames?: string[]): TraceStep {
    return {
        step, line: 10 + step, type: 'LOCAL_VAR',
        var: name, value, target: 'int', frames,
        raw: `${name} = ${value}`,
    };
}

/** Drive the reducer forward through every command, as playback does. */
function playForward(commands: Command[]): VisualizerState {
    let state: VisualizerState = { ...initialState, commandHistory: commands, currentStep: -1 };
    for (let i = 0; i < commands.length; i++) {
        state = reducer(state, { type: 'STEP' });
    }
    return state;
}

const shown = (vars: LocalVar[]) => vars.map(v => `${v.frame}:${v.name}=${v.value}`).sort();

describe('locals are scoped to their frame', () => {
    // main calls twice(n), which has its own n. Two variables, not one.
    const trace: TraceStep[] = [
        localVarStep(0, 'n', '7', ['main']),
        localVarStep(1, 'n', '7', ['main', 'twice']),
        localVarStep(2, 'r', '14', ['main', 'twice']),
        localVarStep(3, 'r', '14', ['main']),
    ];

    it('keeps a callee variable separate from a caller variable of the same name', () => {
        const state = playForward(mapTraceToCommands(trace));

        expect(shown(state.localVars)).toEqual([
            'main/twice:n=7', 'main/twice:r=14', 'main:n=7', 'main:r=14',
        ]);
    });

    it('does not let a callee overwrite the caller and lose one of them', () => {
        const state = playForward(mapTraceToCommands(trace));
        expect(state.localVars.filter(v => v.name === 'n')).toHaveLength(2);
    });

    // Stepping back replays from the start; it must land where playing forward
    // did, or the two directions disagree about what the program did.
    it('replays backwards to the same state it played forwards to', () => {
        const commands = mapTraceToCommands(trace);
        const forward = playForward(commands);

        let state: VisualizerState = { ...forward };
        state = reducer(state, { type: 'STEP_BACK' });
        state = reducer(state, { type: 'STEP' });

        expect(shown(state.localVars)).toEqual(shown(forward.localVars));
        expect(state.currentStep).toBe(forward.currentStep);
    });

    it('still updates in place when the same frame reassigns a variable', () => {
        const state = playForward(mapTraceToCommands([
            localVarStep(0, 'sum', '0', ['main']),
            localVarStep(1, 'sum', '5', ['main']),
        ]));

        expect(shown(state.localVars)).toEqual(['main:sum=5']);
    });

    // Traces recorded before the tracer could enter a function carry no frames.
    it('handles a trace with no frame information', () => {
        const state = playForward(mapTraceToCommands([
            localVarStep(0, 'x', '1'),
            localVarStep(1, 'x', '2'),
        ]));

        expect(state.localVars).toHaveLength(1);
        expect(state.localVars[0].value).toBe('2');
    });
});
