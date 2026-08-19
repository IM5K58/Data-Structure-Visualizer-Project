import type { MemoryNode } from '../types';

/**
 * Which pointer field is the "back" pointer of a structure.
 *
 * Two places need this answer and they used to compute it differently. The
 * engine (stepMapper) used it to decide whether a node graph is a tree, a
 * doubly linked list or a general graph. DoublyListView used its own copy to
 * decide which pointer column to draw as a back edge — and that copy marked
 * EVERY fully-mutual field as a back edge, so on a well-formed `a ⇄ b ⇄ c` both
 * `next` and `prev` were stripped, the forward set came out empty, and the view
 * fell back to rendering nodes in allocation order.
 *
 * This module is the single rule. It lives under engine/ so the dependency
 * direction stays components → engine → types; a view importing stepMapper
 * would drag the whole Command pipeline into the view bundle.
 */

/** field → (source id → target id). Both call sites reduce to this losslessly. */
export type PointerEdgeMap = Map<string, Map<string, string>>;

/** Names that conventionally denote a back pointer. Used only as a tiebreak. */
export const BACK_NAME_RE = /^(prev|previous|back|parent)$/i;

export interface PointerTopology {
    /** At most one field is stripped as the back pointer. */
    back: string | null;
    /** Every other field that carries edges. */
    forward: Set<string>;
    /** Per field, how many of its edges are half of a mutual pair. */
    bidirCount: ReadonlyMap<string, number>;
    /** The union of all fields' edges. */
    fullOut: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Adapter for the view side. It belongs here rather than in the view, because
 * a second place turning nodes into edges is how the rule drifted in the first
 * place.
 */
export function pointerEdgesFromNodes(nodes: readonly MemoryNode[]): PointerEdgeMap {
    const edges: PointerEdgeMap = new Map();
    for (const n of nodes) {
        for (const [field, target] of Object.entries(n.pointers)) {
            if (!target) continue;
            let bySource = edges.get(field);
            if (!bySource) {
                bySource = new Map();
                edges.set(field, bySource);
            }
            bySource.set(n.id, target);
        }
    }
    return edges;
}

/**
 * Pick the back-pointer field, if there is one.
 *
 * A field is a candidate only when every one of its edges is half of a mutual
 * pair — a field carrying any one-way edge holds information the primary graph
 * needs. Among candidates the winner is decided by, in order:
 *
 *   1. mutual-edge count, descending
 *   2. a conventional back-pointer name
 *   3. first appearance
 *
 * All three matter. On a symmetric doubly linked list `next` and `prev` tie on
 * count, so without (2) the winner would be decided by the order GDB happened
 * to report the fields — and picking `next` makes the view draw the list
 * backwards. On a parent-pointer tree, `left` and `right` each have exactly one
 * mutual edge and so are candidates too; only the count ordering (parent=2,
 * left=1, right=1) rejects them, so (2) alone is not enough either.
 */
export function classifyPointerFields(edges: PointerEdgeMap): PointerTopology {
    const fullOut = new Map<string, Set<string>>();
    const ensure = (id: string) => {
        let s = fullOut.get(id);
        if (!s) { s = new Set(); fullOut.set(id, s); }
        return s;
    };
    for (const [, bySource] of edges) {
        for (const [src, tgt] of bySource) {
            ensure(src).add(tgt);
            ensure(tgt);
        }
    }

    let mutualPairs = 0;
    const seenPair = new Set<string>();
    for (const [u, targets] of fullOut) {
        for (const v of targets) {
            if (!fullOut.get(v)?.has(u)) continue;
            const key = u < v ? `${u}|${v}` : `${v}|${u}`;
            if (!seenPair.has(key)) { seenPair.add(key); mutualPairs++; }
        }
    }

    const bidirCount = new Map<string, number>();
    for (const [field, bySource] of edges) {
        let c = 0;
        for (const [src, tgt] of bySource) {
            if (fullOut.get(tgt)?.has(src)) c++;
        }
        bidirCount.set(field, c);
    }

    const order = [...edges.keys()];
    let back: string | null = null;

    // Needs at least two fields: stripping the only field would empty the graph.
    if (mutualPairs > 0 && edges.size >= 2) {
        const candidates = order.filter(field => {
            const total = edges.get(field)!.size;
            return total > 0 && total === (bidirCount.get(field) ?? 0);
        });

        candidates.sort((a, b) => {
            const byCount = (bidirCount.get(b) ?? 0) - (bidirCount.get(a) ?? 0);
            if (byCount !== 0) return byCount;
            const named = Number(BACK_NAME_RE.test(b)) - Number(BACK_NAME_RE.test(a));
            if (named !== 0) return named;
            return order.indexOf(a) - order.indexOf(b);
        });

        back = candidates[0] ?? null;
    }

    const forward = new Set(order.filter(f => f !== back));
    return { back, forward, bidirCount, fullOut };
}
