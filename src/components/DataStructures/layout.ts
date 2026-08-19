/**
 * Pure layout and geometry for the data-structure views.
 *
 * These functions used to live inside the component files, where they were
 * unreachable from tests and where the shared constants had drifted — NODE_W,
 * NODE_H_BASE, FIELD_H and `nodeHeight` were each declared independently in
 * three files. Nothing here touches React or the DOM, so it can be tested
 * directly (see __tests__/layout.test.ts).
 */

import type { HeapState, MemoryNode } from '../../types';
import {
    NODE_CARD_W,
    RING_PAD,
    nodeCardHeight,
    ringRadius,
} from './geometry';
import {
    BACK_NAME_RE,
    classifyPointerFields,
    pointerEdgesFromNodes,
} from '../../engine/pointerTopology';

export * from './geometry';

// ── Tree layout ────────────────────────────────────────────────────────────

export const TREE_H_GAP = 32;
/**
 * Vertical breathing room between the bottom of one row's tallest card and
 * the top of the next row. Replaces a fixed row pitch, which was wrong for
 * any card taller than the pitch — and card height has no upper bound,
 * since it grows with the number of fields.
 */
export const TREE_V_GAP = 56;

export interface TreeLayoutNode {
    node: MemoryNode;
    x: number;
    y: number;
    /** Row index. Kept so callers can reason about rows without re-deriving them. */
    depth: number;
}

/** All child pointer targets that exist in the node set (supports N-ary trees). */
export function getChildIds(node: MemoryNode, allNodeIds: Set<string>): string[] {
    return Object.values(node.pointers).filter(
        (id): id is string => id !== null && id !== undefined && allNodeIds.has(id)
    );
}

/**
 * N-ary tree layout via a two-pass bucket algorithm.
 * Pass 1 (bottom-up) computes subtree widths; pass 2 (top-down) distributes
 * children across their parent's width. Nodes at the same depth share a Y.
 */
export function computeTreeLayout(nodes: MemoryNode[], rootId: string | null): TreeLayoutNode[] {
    if (nodes.length === 0 || !rootId) return [];

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const allIds = new Set(nodes.map(n => n.id));
    const positioned = new Map<string, TreeLayoutNode>();
    let orphanX = 0;

    const subtreeWidths = new Map<string, number>();
    function computeWidth(nodeId: string, visited: Set<string>): number {
        if (visited.has(nodeId)) return NODE_CARD_W + TREE_H_GAP;
        visited.add(nodeId);
        const node = nodeMap.get(nodeId);
        if (!node) return NODE_CARD_W + TREE_H_GAP;
        const children = getChildIds(node, allIds);
        if (children.length === 0) {
            subtreeWidths.set(nodeId, NODE_CARD_W + TREE_H_GAP);
            return NODE_CARD_W + TREE_H_GAP;
        }
        const total = children.reduce((sum, cid) => sum + computeWidth(cid, visited), 0);
        subtreeWidths.set(nodeId, total);
        return total;
    }
    computeWidth(rootId, new Set());

    const visitedPlace = new Set<string>();
    function placeNode(nodeId: string, depth: number, centerX: number): void {
        if (visitedPlace.has(nodeId)) return;
        visitedPlace.add(nodeId);
        const node = nodeMap.get(nodeId);
        if (!node) return;

        positioned.set(nodeId, { node, x: centerX - NODE_CARD_W / 2, y: 0, depth });

        const children = getChildIds(node, allIds);
        if (children.length === 0) return;

        const totalW = children.reduce(
            (sum, cid) => sum + (subtreeWidths.get(cid) ?? NODE_CARD_W + TREE_H_GAP), 0);
        let currentX = centerX - totalW / 2;
        for (const cid of children) {
            const cw = subtreeWidths.get(cid) ?? NODE_CARD_W + TREE_H_GAP;
            placeNode(cid, depth + 1, currentX + cw / 2);
            currentX += cw;
        }
    }
    placeNode(rootId, 0, 0);

    // Anything unreachable from the root still has to appear somewhere.
    nodes.forEach(n => {
        if (!visitedPlace.has(n.id)) {
            positioned.set(n.id, { node: n, x: orphanX, y: 0, depth: 0 });
            orphanX += NODE_CARD_W + TREE_H_GAP;
        }
    });

    // Rows are as tall as their tallest card. A constant pitch is wrong for
    // *some* node shape no matter what constant you pick, because card height
    // grows without bound in the number of fields.
    const placed = Array.from(positioned.values());
    const rowHeight: number[] = [];
    for (const ln of placed) {
        const h = nodeCardHeight(ln.node);
        rowHeight[ln.depth] = Math.max(rowHeight[ln.depth] ?? 0, h);
    }
    const rowTop: number[] = [0];
    for (let d = 0; d < rowHeight.length; d++) {
        rowTop[d + 1] = rowTop[d] + (rowHeight[d] ?? 0) + TREE_V_GAP;
    }
    for (const ln of placed) ln.y = rowTop[ln.depth];

    return placed;
}

// ── Circular list layout ───────────────────────────────────────────────────

export interface CircularLayoutNode {
    node: MemoryNode;
    x: number;
    y: number;
    cx: number;
    cy: number;
}

/** Follow the pointer chain from headId; returns node ids in traversal order. */
export function getCircularOrder(nodes: MemoryNode[], headId: string | null): string[] {
    if (!headId || nodes.length === 0) return nodes.map(n => n.id);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const order: string[] = [];
    const visited = new Set<string>();
    let current: string | null = headId;
    while (current && !visited.has(current) && nodeMap.has(current)) {
        visited.add(current);
        order.push(current);
        const node: MemoryNode = nodeMap.get(current)!;
        const nextPtr: string | null = (Object.values(node.pointers) as (string | null)[])
            .find((p): p is string => !!p && !visited.has(p)) ?? null;
        current = nextPtr ?? null;
    }
    nodes.forEach(n => { if (!visited.has(n.id)) order.push(n.id); });
    return order;
}

export function computeCircularLayout(
    nodes: MemoryNode[],
    headId: string | null,
): { nodes: CircularLayoutNode[]; W: number; H: number } {
    if (nodes.length === 0) return { nodes: [], W: 0, H: 0 };
    const order = getCircularOrder(nodes, headId);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const N = order.length;
    const R = Math.max(150, N * 50);
    const padding = NODE_CARD_W;
    const svgCx = R + padding;
    const svgCy = R + padding;

    const placed = order.map((id, i) => {
        const node = nodeMap.get(id)!;
        const angle = (2 * Math.PI * i) / N - Math.PI / 2; // start at top
        const cx = svgCx + R * Math.cos(angle);
        const cy = svgCy + R * Math.sin(angle);
        return { node, x: cx - NODE_CARD_W / 2, y: cy - nodeCardHeight(node) / 2, cx, cy };
    });

    return { nodes: placed, W: svgCx * 2, H: svgCy * 2 };
}

// ── General graph ring layout ──────────────────────────────────────────────

/**
 * Place nodes on a ring sized to the cards it carries, and report the canvas
 * that contains them. Returning W/H here is what stops the caller re-deriving
 * the same numbers — that duplication is exactly how the constant radius
 * survived long enough to overlap cards from seven nodes on.
 */
export function computeRingLayout(
    nodes: MemoryNode[],
): { nodes: LayoutPoint[]; W: number; H: number; R: number } {
    if (nodes.length === 0) return { nodes: [], W: 0, H: 0, R: 0 };

    const maxCardH = Math.max(...nodes.map(nodeCardHeight));
    const R = ringRadius(nodes.length, maxCardH);
    const W = 2 * (R + NODE_CARD_W / 2 + RING_PAD);
    const H = 2 * (R + maxCardH / 2 + RING_PAD);

    return { nodes: radialLayout(nodes, W / 2, H / 2, R), W, H, R };
}

// ── Doubly linked list ordering ────────────────────────────────────────────

/**
 * Split pointer fields into forward (next-like) and back (prev-like).
 *
 * A field is a back-edge candidate when every edge it contributes has a reverse
 * counterpart somewhere in the graph.
 */
export function classifyFields(nodes: MemoryNode[]): { forward: Set<string>; back: Set<string> } {
    const { back, forward } = classifyPointerFields(pointerEdgesFromNodes(nodes));
    const b = new Set<string>(back ? [back] : []);
    const f = new Set(forward);

    // Display-only fallback, so a half-built trace with no mutual pairs still
    // renders as a chain. The engine must NOT apply this: it would leave
    // backFields non-empty for a plain singly linked list and misclassify it
    // as 'doubly'.
    if (b.size === 0 && f.size >= 2) {
        for (const field of f) {
            if (BACK_NAME_RE.test(field)) { b.add(field); f.delete(field); break; }
        }
    }

    return { forward: f, back: b };
}

/** Order nodes head-to-tail by following the forward field(s). */
export function orderChain(nodes: MemoryNode[], forward: Set<string>): MemoryNode[] {
    if (nodes.length === 0) return [];
    const byId = new Map(nodes.map(n => [n.id, n]));
    const indeg = new Map<string, number>();
    for (const n of nodes) indeg.set(n.id, 0);
    for (const n of nodes) {
        for (const [field, tgt] of Object.entries(n.pointers)) {
            if (!tgt || !forward.has(field) || !indeg.has(tgt)) continue;
            indeg.set(tgt, (indeg.get(tgt) ?? 0) + 1);
        }
    }

    const head = nodes.find(n => indeg.get(n.id) === 0) ?? nodes[0];

    const ordered: MemoryNode[] = [];
    const visited = new Set<string>();
    let cur: MemoryNode | undefined = head;
    while (cur && !visited.has(cur.id)) {
        visited.add(cur.id);
        ordered.push(cur);
        let nextId: string | undefined;
        for (const [field, tgt] of Object.entries(cur.pointers)) {
            if (forward.has(field) && tgt && !visited.has(tgt)) {
                nextId = tgt;
                break;
            }
        }
        cur = nextId ? byId.get(nextId) : undefined;
    }
    for (const n of nodes) if (!visited.has(n.id)) ordered.push(n);
    return ordered;
}

// ── Heap layout ────────────────────────────────────────────────────────────

export const HEAP_NODE_RADIUS = 24;
export const HEAP_NODE_SIZE = HEAP_NODE_RADIUS * 2;
export const HEAP_LEVEL_HEIGHT = 80;
export const HEAP_TOP_PAD = 36;
/** Deepest nodes carry an index label below the circle, so clear radius + label. */
export const HEAP_BOT_PAD = 44;
export const HEAP_MIN_W = 480;
export const HEAP_SLOT_MIN = 56;

export interface HeapNodeLayout {
    id: string;
    value: number | string | boolean;
    cx: number;
    cy: number;
    arrayIndex: number;
}

/**
 * Lay heap items out as a complete binary tree by array index. Depth d holds
 * 2^d slots, so each child sits centred under its parent. Width scales with the
 * deepest level so circles never overlap.
 */
export function heapLayout(
    items: HeapState['items'],
): { nodes: HeapNodeLayout[]; W: number; H: number } {
    const N = items.length;
    if (N === 0) return { nodes: [], W: HEAP_MIN_W, H: HEAP_TOP_PAD + HEAP_BOT_PAD };

    const maxDepth = Math.floor(Math.log2(N));
    const slotsAtMax = Math.pow(2, maxDepth);
    const W = Math.max(HEAP_MIN_W, slotsAtMax * HEAP_SLOT_MIN);
    const H = HEAP_TOP_PAD + maxDepth * HEAP_LEVEL_HEIGHT + HEAP_BOT_PAD;

    const nodes = items.map((item, i) => {
        const depth = Math.floor(Math.log2(i + 1));
        const offsetInLevel = (i + 1) - Math.pow(2, depth);
        const slotsAtDepth = Math.pow(2, depth);
        return {
            id: item.id,
            value: item.value,
            cx: ((offsetInLevel + 0.5) / slotsAtDepth) * W,
            cy: HEAP_TOP_PAD + depth * HEAP_LEVEL_HEIGHT,
            arrayIndex: i,
        };
    });

    return { nodes, W, H };
}

// ── General graph layout ───────────────────────────────────────────────────

export interface LayoutPoint {
    node: MemoryNode;
    cx: number;
    cy: number;
}

export interface EdgeRender {
    id: string;
    sourceId: string;
    targetId: string;
    field: string;
    isBidir: boolean;
}

/**
 * Place N nodes evenly on a circle. Deterministic: the order comes from
 * data.nodes, which the reducer keeps in allocation order.
 */
export function radialLayout(
    nodes: MemoryNode[],
    cx: number,
    cy: number,
    radius: number,
): LayoutPoint[] {
    if (nodes.length === 0) return [];
    if (nodes.length === 1) return [{ node: nodes[0], cx, cy }];
    return nodes.map((node, i) => {
        const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2; // start at top
        return {
            node,
            cx: cx + radius * Math.cos(angle),
            cy: cy + radius * Math.sin(angle),
        };
    });
}

/** Build the edge list, marking edges that are half of a mutual pair. */
export function buildEdges(nodes: MemoryNode[]): EdgeRender[] {
    const ids = new Set(nodes.map(n => n.id));
    const fullOut = new Map<string, Set<string>>();
    for (const n of nodes) {
        fullOut.set(n.id, new Set());
        for (const t of Object.values(n.pointers)) {
            if (t && ids.has(t)) fullOut.get(n.id)!.add(t);
        }
    }
    const edges: EdgeRender[] = [];
    for (const n of nodes) {
        for (const [field, target] of Object.entries(n.pointers)) {
            if (!target || !ids.has(target)) continue;
            edges.push({
                id: `${n.id}-${field}-${target}`,
                sourceId: n.id,
                targetId: target,
                field,
                isBidir: fullOut.get(target)?.has(n.id) ?? false,
            });
        }
    }
    return edges;
}

// ── Union-find forest ──────────────────────────────────────────────────────

export interface UFNode {
    id: string;
    children: string[];
    depth: number;
}

/** Build a forest from a parent map. Roots are elements that parent themselves. */
export function buildForest(
    parent: Record<string, string>,
): { roots: string[]; tree: Map<string, UFNode> } {
    const tree = new Map<string, UFNode>();
    for (const k of Object.keys(parent)) {
        tree.set(k, { id: k, children: [], depth: 0 });
    }
    const roots: string[] = [];
    for (const [k, p] of Object.entries(parent)) {
        if (k === p) roots.push(k);
        else if (tree.has(p)) tree.get(p)!.children.push(k);
    }
    for (const r of roots) {
        const q: { id: string; d: number }[] = [{ id: r, d: 0 }];
        while (q.length) {
            const { id, d } = q.shift()!;
            const node = tree.get(id);
            if (!node) continue;
            node.depth = d;
            for (const c of node.children) q.push({ id: c, d: d + 1 });
        }
    }
    return { roots, tree };
}
