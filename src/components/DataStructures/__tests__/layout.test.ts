import { describe, it, expect } from 'vitest';
import type { MemoryNode } from '../../../types';
import {
    NODE_CARD_W, nodeCardHeight, computeTreeLayout,
    getCircularOrder, computeCircularLayout,
    classifyFields, orderChain,
    heapLayout, radialLayout, buildEdges, buildForest, computeRingLayout,
} from '../layout';

/**
 * Safety net for the view-layer refactor.
 *
 * These assert geometric and ordering INVARIANTS, not pixel values, so they
 * survive the move to shared layout modules. The existing component tests only
 * check `container.textContent`, which cannot see any of this.
 *
 * Tests marked `it.fails` document a confirmed bug: they pass today *because*
 * the assertion fails. Fixing the bug turns them red, which is the signal to
 * flip them back to `it`.
 */

function node(
    id: string,
    fields: Record<string, number | string | boolean> = {},
    pointers: Record<string, string | null> = {},
): MemoryNode {
    return { id, type: 'Node', fields, pointers, labels: [] };
}

/** The canonical BST node: one data field, two child pointers. */
const bst = (id: string, left: string | null = null, right: string | null = null) =>
    node(id, { data: 1 }, { left, right });

/** A node carrying an extra field, e.g. an AVL height or a parent pointer. */
const fat = (id: string, left: string | null = null, right: string | null = null) =>
    node(id, { data: 1, height: 2 }, { left, right, parent: null });

// ── TreeChart ──────────────────────────────────────────────────────────────

describe('TreeChart layout', () => {
    it('sizes a node from its field and pointer counts', () => {
        // 36 base + 1 field * 28 + 2 pointers * 28
        expect(nodeCardHeight(bst('a'))).toBe(120);
        // 36 + 2 * 28 + 3 * 28
        expect(nodeCardHeight(fat('a'))).toBe(176);
    });

    it('places every child on a deeper row than its parent', () => {
        const nodes = [bst('a', 'b', 'c'), bst('b'), bst('c')];
        const layout = computeTreeLayout(nodes, 'a');
        const byId = new Map(layout.map(l => [l.node.id, l]));
        expect(byId.get('b')!.y).toBeGreaterThan(byId.get('a')!.y);
        expect(byId.get('c')!.y).toBeGreaterThan(byId.get('a')!.y);
    });

    it('centers the root on the origin', () => {
        const layout = computeTreeLayout([bst('a')], 'a');
        expect(layout[0].x).toBe(-NODE_CARD_W / 2);
        expect(layout[0].y).toBe(0);
    });

    it('does not overlap siblings horizontally', () => {
        const nodes = [bst('a', 'b', 'c'), bst('b'), bst('c')];
        const layout = computeTreeLayout(nodes, 'a');
        const byId = new Map(layout.map(l => [l.node.id, l]));
        const gap = Math.abs(byId.get('b')!.x - byId.get('c')!.x);
        expect(gap).toBeGreaterThanOrEqual(NODE_CARD_W);
    });

    it('keeps every node when the graph has a cycle', () => {
        // A malformed "tree" must not drop nodes or hang.
        const nodes = [bst('a', 'b'), bst('b', 'a')];
        expect(computeTreeLayout(nodes, 'a')).toHaveLength(2);
    });

    it('places orphans not reachable from the root', () => {
        const nodes = [bst('a'), bst('orphan')];
        const ids = computeTreeLayout(nodes, 'a').map(l => l.node.id);
        expect(ids).toContain('orphan');
    });

    // BUG (a): row pitch is a constant LEVEL_HEIGHT = 120, but nodeCardHeight() for
    // the canonical BST node is also exactly 120, so levels touch with zero gap;
    // any extra field pushes the node past the pitch and children overlap it
    // while parent→child edges run backwards (y1 > y2).
    it('leaves a visible gap between a parent and its children', () => {
        const nodes = [bst('a', 'b'), bst('b')];
        const byId = new Map(computeTreeLayout(nodes, 'a').map(l => [l.node.id, l]));
        const parent = byId.get('a')!;
        const child = byId.get('b')!;
        expect(child.y).toBeGreaterThan(parent.y + nodeCardHeight(parent.node));
    });

    it('does not overlap rows when nodes carry extra fields', () => {
        const nodes = [fat('a', 'b'), fat('b')];
        const byId = new Map(computeTreeLayout(nodes, 'a').map(l => [l.node.id, l]));
        const parent = byId.get('a')!;
        const child = byId.get('b')!;
        expect(child.y).toBeGreaterThanOrEqual(parent.y + nodeCardHeight(parent.node));
    });
});

// ── DoublyListView ─────────────────────────────────────────────────────────

describe('DoublyListView field classification', () => {
    /** a ⇄ b ⇄ c, the shape this view exists to render. */
    const dll = () => [
        node('a', { v: 1 }, { next: 'b', prev: null }),
        node('b', { v: 2 }, { next: 'c', prev: 'a' }),
        node('c', { v: 3 }, { next: null, prev: 'b' }),
    ];

    // BUG (b): classifyFields marks EVERY fully-bidirectional field as a back
    // edge, so on a well-formed list both next and prev land in `back` and
    // `forward` is empty. src/engine/stepMapper.ts already has the correct rule:
    // sort by bidirectional count and take only the first field, then break.
    it('puts exactly one field forward and one back', () => {
        const { forward, back } = classifyFields(dll());
        expect(forward.size).toBe(1);
        expect(back.size).toBe(1);
    });

    it('orders the chain from head to tail, not by allocation order', () => {
        // Nodes handed over in reverse allocation order, as an insert-at-head
        // build produces.
        const reversed = [...dll()].reverse();
        const { forward } = classifyFields(reversed);
        expect(orderChain(reversed, forward).map(n => n.id)).toEqual(['a', 'b', 'c']);
    });

    it('keeps every node regardless of how fields are classified', () => {
        const nodes = dll();
        const { forward } = classifyFields(nodes);
        expect(orderChain(nodes, forward)).toHaveLength(3);
    });

    it('does not hang on a cyclic list', () => {
        const cyclic = [
            node('a', {}, { next: 'b', prev: 'c' }),
            node('b', {}, { next: 'c', prev: 'a' }),
            node('c', {}, { next: 'a', prev: 'b' }),
        ];
        const { forward } = classifyFields(cyclic);
        expect(orderChain(cyclic, forward)).toHaveLength(3);
    });
});

// ── GraphChart ─────────────────────────────────────────────────────────────

describe('GraphChart radial layout', () => {
    // The component's own dimensions: W = 720, H = 520, radius = min(W,H) * 0.35.
    const RADIUS = Math.min(720, 520) * 0.35;
    const ring = (n: number) => Array.from({ length: n }, (_, i) => node(`n${i}`));

    it('puts a single node at the centre', () => {
        const [p] = radialLayout(ring(1), 360, 260, RADIUS);
        expect(p.cx).toBe(360);
        expect(p.cy).toBe(260);
    });

    it('spaces nodes evenly on the circle', () => {
        const pts = radialLayout(ring(4), 360, 260, RADIUS);
        const dists = pts.map(p => Math.hypot(p.cx - 360, p.cy - 260));
        for (const d of dists) expect(d).toBeCloseTo(RADIUS, 5);
    });

    it('marks a mutual pair as bidirectional', () => {
        const nodes = [
            node('a', {}, { to: 'b' }),
            node('b', {}, { to: 'a' }),
        ];
        expect(buildEdges(nodes).every(e => e.isBidir)).toBe(true);
    });

    it('ignores pointers that leave the node set', () => {
        const nodes = [node('a', {}, { to: 'missing' })];
        expect(buildEdges(nodes)).toHaveLength(0);
    });

    // Was BUG (c): the radius used to be a constant regardless of node count,
    // so cards overlapped from seven nodes on. The ring now grows with the cards
    // it carries, and the bound is on *every* pair, not just neighbours.
    it('keeps cards from overlapping at any size', () => {
        for (const n of [2, 7, 8, 12, 24]) {
            const { nodes: pts } = computeRingLayout(ring(n));
            for (let i = 0; i < pts.length; i++) {
                for (let j = i + 1; j < pts.length; j++) {
                    const dx = Math.abs(pts[i].cx - pts[j].cx);
                    const dy = Math.abs(pts[i].cy - pts[j].cy);
                    // Boxes overlap only when both axes overlap.
                    expect(dx >= NODE_CARD_W || dy >= nodeCardHeight(pts[i].node)).toBe(true);
                }
            }
        }
    });

    it('sizes the canvas to contain the ring', () => {
        const { nodes: pts, W, H } = computeRingLayout(ring(8));
        for (const p of pts) {
            expect(p.cx - NODE_CARD_W / 2).toBeGreaterThanOrEqual(0);
            expect(p.cx + NODE_CARD_W / 2).toBeLessThanOrEqual(W);
            expect(p.cy).toBeGreaterThanOrEqual(0);
            expect(p.cy).toBeLessThanOrEqual(H);
        }
    });

    it('centres a lone node on its canvas', () => {
        const { nodes: pts, W, H } = computeRingLayout(ring(1));
        expect(pts[0].cx).toBeCloseTo(W / 2, 5);
        expect(pts[0].cy).toBeCloseTo(H / 2, 5);
    });
});

// ── CircularListView ───────────────────────────────────────────────────────

describe('CircularListView order and layout', () => {
    const ringList = () => [
        node('a', {}, { next: 'b' }),
        node('b', {}, { next: 'c' }),
        node('c', {}, { next: 'a' }),
    ];

    it('walks the chain from the head', () => {
        expect(getCircularOrder(ringList(), 'a')).toEqual(['a', 'b', 'c']);
        expect(getCircularOrder(ringList(), 'b')).toEqual(['b', 'c', 'a']);
    });

    it('appends nodes unreachable from the head', () => {
        const nodes = [...ringList(), node('lost')];
        expect(getCircularOrder(nodes, 'a')).toContain('lost');
    });

    it('falls back to input order without a head', () => {
        expect(getCircularOrder(ringList(), null)).toEqual(['a', 'b', 'c']);
    });

    it('places nodes on a circle in chain order', () => {
        const { nodes: layout } = computeCircularLayout(ringList(), 'a');
        expect(layout.map(l => l.node.id)).toEqual(['a', 'b', 'c']);
        const cx = layout.reduce((s, l) => s + l.cx, 0) / 3;
        const cy = layout.reduce((s, l) => s + l.cy, 0) / 3;
        const radii = layout.map(l => Math.hypot(l.cx - cx, l.cy - cy));
        for (const r of radii) expect(r).toBeCloseTo(radii[0], 5);
    });

    it('returns nothing for an empty list', () => {
        expect(computeCircularLayout([], null).nodes).toEqual([]);
    });
});

// ── HeapView ───────────────────────────────────────────────────────────────

describe('HeapView layout', () => {
    const items = (n: number) =>
        Array.from({ length: n }, (_, i) => ({ id: `i${i}`, value: i }));

    it('has no size for an empty heap', () => {
        const { nodes } = heapLayout([]);
        expect(nodes).toHaveLength(0);
    });

    it('places each child below and beside its parent', () => {
        const { nodes } = heapLayout(items(7));
        for (let i = 1; i < nodes.length; i++) {
            const parent = nodes[Math.floor((i - 1) / 2)];
            expect(nodes[i].cy).toBeGreaterThan(parent.cy);
        }
    });

    it('centres a parent between its two children', () => {
        const { nodes } = heapLayout(items(3));
        expect(nodes[0].cx).toBeCloseTo((nodes[1].cx + nodes[2].cx) / 2, 5);
    });

    it('grows wide enough that the deepest row does not overlap', () => {
        const { nodes, W } = heapLayout(items(15));
        const deepest = nodes.filter(n => n.arrayIndex >= 7).sort((a, b) => a.cx - b.cx);
        for (let i = 1; i < deepest.length; i++) {
            expect(deepest[i].cx - deepest[i - 1].cx).toBeGreaterThanOrEqual(48);
        }
        expect(W).toBeGreaterThan(0);
    });
});

// ── UnionFindView ──────────────────────────────────────────────────────────

describe('UnionFindView forest', () => {
    it('treats self-parented elements as roots', () => {
        const { roots } = buildForest({ a: 'a', b: 'a', c: 'c' });
        expect(roots.sort()).toEqual(['a', 'c']);
    });

    it('records children and depths', () => {
        const { tree } = buildForest({ a: 'a', b: 'a', c: 'b' });
        expect(tree.get('a')!.children).toEqual(['b']);
        expect(tree.get('b')!.depth).toBe(1);
        expect(tree.get('c')!.depth).toBe(2);
    });

    it('handles an empty map', () => {
        const { roots, tree } = buildForest({});
        expect(roots).toEqual([]);
        expect(tree.size).toBe(0);
    });
});
