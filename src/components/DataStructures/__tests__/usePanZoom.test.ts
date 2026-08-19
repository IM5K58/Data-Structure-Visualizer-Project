import { describe, it, expect } from 'vitest';
import { clampScale, fitOffset, type Bounds } from '../usePanZoom';

/**
 * The pure half of the pan/zoom hook. These are the two formulas that were
 * duplicated across four views — twelve scattered clamp literals and two
 * different fit expressions that disagreed on the Y axis.
 */

describe('clampScale', () => {
    it('holds a value inside the range', () => {
        expect(clampScale(1.5, 0.5, 2)).toBe(1.5);
    });

    it('clamps both ends', () => {
        expect(clampScale(0.1, 0.5, 2)).toBe(0.5);
        expect(clampScale(9, 0.5, 2)).toBe(2);
    });

    it('is exact at the boundaries', () => {
        expect(clampScale(0.5, 0.5, 2)).toBe(0.5);
        expect(clampScale(2, 0.5, 2)).toBe(2);
    });

    it('respects per-view ranges rather than one shared range', () => {
        // A tree zooms out further than a small graph; both must be honoured.
        expect(clampScale(0.35, 0.3, 2.5)).toBe(0.35);
        expect(clampScale(0.35, 0.5, 2)).toBe(0.5);
    });
});

describe('fitOffset', () => {
    const box = (minX: number, minY: number, maxX: number, maxY: number): Bounds =>
        ({ minX, minY, maxX, maxY });

    it('centres content in the viewport at scale 1', () => {
        const o = fitOffset(box(0, 0, 100, 100), { w: 300, h: 300 }, 1);
        expect(o).toEqual({ x: 100, y: 100 });
    });

    it('is symmetric in the two axes', () => {
        // Swapping the x and y components of every input must swap the output.
        const a = fitOffset(box(10, 40, 110, 240), { w: 300, h: 500 }, 1);
        const b = fitOffset(box(40, 10, 240, 110), { w: 500, h: 300 }, 1);
        expect(a.x).toBeCloseTo(b.y, 10);
        expect(a.y).toBeCloseTo(b.x, 10);
    });

    it('centres content whose bounds start negative', () => {
        // Tree layout puts the root at x = -NODE_CARD_W / 2, so minX is negative.
        const o = fitOffset(box(-160, 0, 160, 100), { w: 320, h: 300 }, 1);
        const left = o.x + -160;
        const right = o.x + 160;
        expect(left).toBeCloseTo(320 - right, 10);
    });

    it('scales the content extent, not the viewport', () => {
        const o = fitOffset(box(0, 0, 100, 100), { w: 300, h: 300 }, 2);
        expect(o).toEqual({ x: 50, y: 50 });
    });

    it('treats padding as a smaller viewport', () => {
        const none = fitOffset(box(0, 0, 100, 100), { w: 300, h: 300 }, 1);
        const padded = fitOffset(box(0, 0, 100, 100), { w: 300, h: 300 }, 1,
            { left: 40, top: 20 });
        expect(padded.x).toBe(none.x + 20);   // half of the 40px left inset
        expect(padded.y).toBe(none.y + 10);
    });

    it('still produces a finite offset when content is larger than the viewport', () => {
        const o = fitOffset(box(0, 0, 1000, 800), { w: 300, h: 300 }, 1);
        expect(Number.isFinite(o.x)).toBe(true);
        expect(Number.isFinite(o.y)).toBe(true);
        expect(o.x).toBeLessThan(0);
    });
});
