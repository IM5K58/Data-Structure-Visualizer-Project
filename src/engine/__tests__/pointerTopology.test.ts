import { describe, it, expect } from 'vitest';
import type { MemoryNode } from '../../types';
import {
    classifyPointerFields,
    pointerEdgesFromNodes,
    type PointerEdgeMap,
} from '../pointerTopology';

function node(id: string, pointers: Record<string, string | null>): MemoryNode {
    return { id, type: 'Node', fields: {}, pointers, labels: [] };
}

/** Build the edge map directly, controlling the order fields were first seen. */
function edges(spec: Record<string, Record<string, string>>): PointerEdgeMap {
    const m: PointerEdgeMap = new Map();
    for (const [field, pairs] of Object.entries(spec)) {
        m.set(field, new Map(Object.entries(pairs)));
    }
    return m;
}

describe('classifyPointerFields', () => {
    it('picks prev on a doubly linked list', () => {
        const dll = [
            node('a', { next: 'b', prev: null }),
            node('b', { next: 'c', prev: 'a' }),
            node('c', { next: null, prev: 'b' }),
        ];
        const t = classifyPointerFields(pointerEdgesFromNodes(dll));
        expect(t.back).toBe('prev');
        expect([...t.forward]).toEqual(['next']);
    });

    // Without the name tiebreak, `next` and `prev` tie on mutual count and the
    // winner is whichever field GDB reported first — which would make the view
    // draw the list backwards.
    it('picks prev regardless of the order the fields were recorded', () => {
        const nextFirst = edges({ next: { a: 'b', b: 'c' }, prev: { b: 'a', c: 'b' } });
        const prevFirst = edges({ prev: { b: 'a', c: 'b' }, next: { a: 'b', b: 'c' } });
        expect(classifyPointerFields(nextFirst).back).toBe('prev');
        expect(classifyPointerFields(prevFirst).back).toBe('prev');
    });

    // left/right each have exactly one mutual edge, so they are candidates too.
    // Only the count ordering (parent=2 vs 1) rejects them.
    it('picks parent on a parent-pointer tree, not a child field', () => {
        const tree = [
            node('root', { left: 'l', right: 'r', parent: null }),
            node('l', { left: null, right: null, parent: 'root' }),
            node('r', { left: null, right: null, parent: 'root' }),
        ];
        const t = classifyPointerFields(pointerEdgesFromNodes(tree));
        expect(t.back).toBe('parent');
        expect([...t.forward].sort()).toEqual(['left', 'right']);
    });

    it('strips nothing from a singly linked list', () => {
        const sll = [
            node('a', { next: 'b' }),
            node('b', { next: 'c' }),
            node('c', { next: null }),
        ];
        const t = classifyPointerFields(pointerEdgesFromNodes(sll));
        expect(t.back).toBeNull();
        expect([...t.forward]).toEqual(['next']);
    });

    it('strips nothing from a general graph with one-way edges', () => {
        const graph = [
            node('a', { to: 'b', alt: 'c' }),
            node('b', { to: 'c', alt: null }),
            node('c', { to: null, alt: null }),
        ];
        const t = classifyPointerFields(pointerEdgesFromNodes(graph));
        expect(t.back).toBeNull();
    });

    it('keeps a field that carries even one one-way edge', () => {
        // b.prev = a is mutual with a.next = b, but c.prev = a has no reverse,
        // so `prev` still carries information the primary graph needs and must
        // survive. (`next` is fully mutual here, so it is the one stripped.)
        const t = classifyPointerFields(edges({
            next: { a: 'b' },
            prev: { b: 'a', c: 'a' },
        }));
        expect(t.forward.has('prev')).toBe(true);
        expect(t.back).not.toBe('prev');
    });

    it('strips nothing when only one field exists', () => {
        // A two-node cycle through a single field is mutual, but removing the
        // only field would leave no graph at all.
        const t = classifyPointerFields(edges({ next: { a: 'b', b: 'a' } }));
        expect(t.back).toBeNull();
        expect([...t.forward]).toEqual(['next']);
    });

    it('reports mutual counts per field', () => {
        const t = classifyPointerFields(edges({
            next: { a: 'b', b: 'c' },
            prev: { b: 'a', c: 'b' },
        }));
        expect(t.bidirCount.get('next')).toBe(2);
        expect(t.bidirCount.get('prev')).toBe(2);
    });

    it('handles an empty graph', () => {
        const t = classifyPointerFields(new Map());
        expect(t.back).toBeNull();
        expect(t.forward.size).toBe(0);
    });
});

describe('pointerEdgesFromNodes', () => {
    it('drops null pointers', () => {
        const m = pointerEdgesFromNodes([node('a', { next: null, prev: null })]);
        expect(m.size).toBe(0);
    });

    it('keeps one target per source per field', () => {
        const m = pointerEdgesFromNodes([
            node('a', { next: 'b' }),
            node('b', { next: 'c' }),
        ]);
        expect(m.get('next')!.get('a')).toBe('b');
        expect(m.get('next')!.get('b')).toBe('c');
    });
});
