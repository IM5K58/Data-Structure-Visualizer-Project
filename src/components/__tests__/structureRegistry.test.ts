import { describe, it, expect } from 'vitest';
import type { TargetType } from '../../types';
import { STRUCTURES, accentFor, defaultPanelHeight } from '../structureRegistry';

/**
 * The registry replaced four places where a missing structure type failed
 * silently. These tests pin the contract; the compiler covers the rest
 * (omitting a key is TS2741, mismatching a view is TS2345).
 */

const ALL_TYPES: TargetType[] = [
    'stack', 'queue', 'memory', 'tree', 'circular',
    'doubly', 'graph', 'heap', 'hashmap', 'unionfind',
];

describe('structure registry', () => {
    it('covers every target type exactly once, keyed by its own type', () => {
        expect(Object.keys(STRUCTURES).sort()).toEqual([...ALL_TYPES].sort());
        for (const t of ALL_TYPES) {
            expect(STRUCTURES[t].type).toBe(t);
        }
    });

    it('gives every type a panel border, with no silent fallback', () => {
        for (const t of ALL_TYPES) {
            expect(accentFor(t).panelBorder).toMatch(/^border-/);
            expect(accentFor(t).heading).toMatch(/^text-/);
        }
    });

    it('sizes flat structures compactly and node-graph structures tall', () => {
        expect(defaultPanelHeight('stack')).toBe(300);
        expect(defaultPanelHeight('queue')).toBe(300);
        for (const t of ['memory', 'tree', 'circular', 'doubly', 'graph'] as TargetType[]) {
            expect(defaultPanelHeight(t)).toBe(450);
        }
    });

    // REGRESSION: the default height used to be computed twice with different
    // type lists. The render path listed eight types, but the drag-start path
    // substring-matched the panel id against only memory/tree/doubly/graph/
    // circular — so these three rendered at 450 and snapped to 300 as soon as
    // the user grabbed a resize handle.
    it('keeps heap, hashmap and unionfind tall on the drag path too', () => {
        expect(defaultPanelHeight('heap')).toBe(450);
        expect(defaultPanelHeight('hashmap')).toBe(450);
        expect(defaultPanelHeight('unionfind')).toBe(450);
    });

    // REGRESSION: the drag path matched substrings of `${type}-${name}`, so a
    // stack *named* "graph" took the 450 branch. Height must depend on the type
    // alone; the registry has no access to the name, which is the fix.
    it('derives height from the type, never from the structure name', () => {
        expect(defaultPanelHeight('stack')).toBe(300);
        expect(defaultPanelHeight('queue')).toBe(300);
    });

    it('declares SVG edge colours only for views that draw edges', () => {
        for (const t of ['memory', 'tree', 'circular', 'graph', 'heap'] as TargetType[]) {
            expect(accentFor(t).edgeStroke).not.toBe('');
        }
        for (const t of ['stack', 'queue', 'doubly', 'hashmap', 'unionfind'] as TargetType[]) {
            expect(accentFor(t).edgeStroke).toBe('');
        }
    });
});
