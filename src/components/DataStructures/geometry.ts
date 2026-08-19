/**
 * Node-card metrics — the single source of truth for how big a card is.
 *
 * Layout algorithms and the card markup must agree on this. When they did not,
 * TreeChart's fixed row pitch of 120px happened to equal the height of a
 * canonical BST node, so every parent card touched its children and every
 * parent→child edge had zero vertical extent.
 *
 * Kept separate from layout.ts so the card component can import metrics without
 * dragging in tree/ring/heap layout code.
 */

import type { MemoryNode } from '../../types';

/** Card width. Every view that draws a node card uses this. */
export const NODE_CARD_W = 144;

/** The type header strip at the top of a card. */
export const HEADER_H = 36;
/** One field row or one pointer row. */
export const ROW_H = 28;
/** Border between header and body. */
export const BODY_BORDER_H = 0;
/** Body height when a node has neither fields nor pointers. */
export const EMPTY_BODY_H = 0;

/** How many rows a card shows: one per field plus one per pointer. */
export function cardRowCount(node: MemoryNode): number {
    return Object.keys(node.fields).length + Object.keys(node.pointers).length;
}

/** Rendered height of a node card, in px. */
export function nodeCardHeight(node: MemoryNode): number {
    const rows = cardRowCount(node);
    const body = rows === 0 ? EMPTY_BODY_H : rows * ROW_H;
    return HEADER_H + body + BODY_BORDER_H;
}

/**
 * A pointer target shown on a card: `*b2c0`, or `null`.
 * The single spelling — the five card copies had two, differing on synthetic ids.
 */
export function abbreviatePointer(targetId: string | null | undefined): string {
    if (!targetId) return 'null';
    return `*${targetId.includes('-') ? targetId.split('-')[1] : targetId.slice(-4)}`;
}

// ── Ring placement ─────────────────────────────────────────────────────────

/** Smallest ring, so a 2-node graph does not collapse onto itself. */
export const RING_MIN_R = 150;
/** Clearance between neighbouring cards on the ring. */
export const RING_GAP = 24;
/** Margin between the outermost card edge and the canvas edge. */
export const RING_PAD = 32;
/** Space left between an arrowhead and the card it points at. */
export const ARROW_GAP = 6;

/**
 * Radius that guarantees no two cards on the ring overlap.
 *
 * Two axis-aligned boxes overlap only when |dx| < W AND |dy| < H, so a centre
 * distance of at least hypot(W, H) makes overlap impossible. The smallest
 * centre distance on a ring of n points is the adjacent chord 2R·sin(π/n), so
 * solving for R gives the expression below — and because it bounds the *minimum*
 * pair distance, every pair clears, not just neighbours.
 *
 * The obvious alternative, spacing by arc length (R = n·pitch/2π), still
 * overlaps around n=12: the binding direction is the card's diagonal, not its
 * width.
 */
export function ringRadius(count: number, maxCardH: number): number {
    if (count < 2) return 0;
    const need = Math.hypot(NODE_CARD_W + RING_GAP, maxCardH + RING_GAP);
    return Math.max(RING_MIN_R, need / (2 * Math.sin(Math.PI / count)));
}

/**
 * Distance from a card's centre to where a ray leaving at (ux, uy) crosses its
 * bounding box, plus a small gap. Replaces a constant trim that was blind to
 * both direction and card size, so arrowheads landed inside the card.
 */
export function trimToBox(ux: number, uy: number, halfW: number, halfH: number): number {
    const tx = Math.abs(ux) > 1e-6 ? (halfW + ARROW_GAP) / Math.abs(ux) : Infinity;
    const ty = Math.abs(uy) > 1e-6 ? (halfH + ARROW_GAP) / Math.abs(uy) : Infinity;
    return Math.min(tx, ty);
}
