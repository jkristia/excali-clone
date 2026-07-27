import { describe, expect, it } from 'vitest';
import { ArrowPoints } from './arrowPoints';
import { SplineMath } from './splineMath';
import { arrow, curvedArrow } from '../test-support/shapeFactories';

describe('ArrowPoints.anchors', () => {
    it('returns world-space positions for every anchor', () => {
        const s = curvedArrow({ x: 5, y: 10 });
        expect(ArrowPoints.anchors(s)).toEqual([
            { x: 5, y: 10 }, { x: 35, y: -10 }, { x: 65, y: 30 }, { x: 95, y: 10 },
        ]);
    });
});

describe('ArrowPoints.hitTestAnchor', () => {
    it('finds the anchor within radius', () => {
        const s = arrow({ x: 0, y: 0, points: [0, 0, 100, 0] });
        expect(ArrowPoints.hitTestAnchor(s, 0, 0, 1)).toBe(0);
        expect(ArrowPoints.hitTestAnchor(s, 100, 0, 1)).toBe(1);
    });

    it('returns null when nothing is within radius', () => {
        const s = arrow({ x: 0, y: 0, points: [0, 0, 100, 0] });
        expect(ArrowPoints.hitTestAnchor(s, 50, 0, 1)).toBeNull();
    });

    it('scales the hit radius by zoom', () => {
        // Long enough that the far anchor stays out of range even zoomed out, so this
        // tests the radius rather than the last-to-first tie-break.
        const s = arrow({ x: 0, y: 0, points: [0, 0, 1000, 0] });
        // 20 world units off at zoom 1 (radius 10) misses; at zoom 0.1 (radius 100) hits.
        expect(ArrowPoints.hitTestAnchor(s, 20, 0, 1)).toBeNull();
        expect(ArrowPoints.hitTestAnchor(s, 20, 0, 0.1)).toBe(0);
    });

    it('scans last-to-first so an overlapping later anchor wins', () => {
        // Anchor 1 and 2 both sit at (50, 0) — the click should resolve to the later one.
        const s = arrow({ x: 0, y: 0, points: [0, 0, 50, 0, 50, 0, 100, 0] });
        expect(ArrowPoints.hitTestAnchor(s, 50, 0, 1)).toBe(2);
    });

    it('grabs anchors from much further than the insert dots, so shaping a curve never inserts', () => {
        // The whole point of the anchor/midpoint radius split: 8 units off an anchor is
        // a comfortable grab, while the same miss distance on a midpoint is not.
        const s = curvedArrow({ x: 0, y: 0 });
        expect(ArrowPoints.ANCHOR_HIT_RADIUS).toBeGreaterThan(ArrowPoints.MID_HIT_RADIUS * 2);
        expect(ArrowPoints.hitTestAnchor(s, 8, 0, 1)).toBe(0);
        const mid = ArrowPoints.midpoints(s)[0];
        expect(ArrowPoints.hitTestMidpoint(s, mid.x + 8, mid.y, 1)).toBeNull();
    });
});

describe('ArrowPoints.midpoints / hitTestMidpoint', () => {
    it('places one midpoint per segment, matching SplineMath.segmentMidpoint', () => {
        const s = curvedArrow({ x: 5, y: 10 });
        const mids = ArrowPoints.midpoints(s);
        expect(mids).toHaveLength(3);
        const expected = SplineMath.segmentMidpoint(s.points, 1);
        expect(mids[1]).toEqual({ x: s.x + expected.x, y: s.y + expected.y });
    });

    it('hit-tests a midpoint and returns its segment index', () => {
        const s = arrow({ x: 0, y: 0, points: [0, 0, 100, 0] });
        const mid = ArrowPoints.midpoints(s)[0];
        expect(ArrowPoints.hitTestMidpoint(s, mid.x, mid.y, 1)).toBe(0);
    });

    it('returns null away from any midpoint', () => {
        const s = arrow({ x: 0, y: 0, points: [0, 0, 100, 0] });
        expect(ArrowPoints.hitTestMidpoint(s, 0, 0, 1)).toBeNull();
    });
});

describe('ArrowPoints.validIndices', () => {
    it('keeps only in-range indices, deduped and ascending', () => {
        const s = curvedArrow(); // 4 anchors
        expect(ArrowPoints.validIndices(s, [3, 0, 0, 2])).toEqual([0, 2, 3]);
    });

    it('drops indices past the end — a peer edit can shrink points under a node selection', () => {
        const s = arrow({ points: [0, 0, 10, 0] }); // 2 anchors
        expect(ArrowPoints.validIndices(s, [0, 1, 2, 7])).toEqual([0, 1]);
    });

    it('drops negative and non-integer indices', () => {
        const s = curvedArrow();
        expect(ArrowPoints.validIndices(s, [-1, 1.5, 1])).toEqual([1]);
    });
});

describe('ArrowPoints.removeAnchors', () => {
    // 4 anchors: (0,0) (10,10) (20,20) (30,30)
    const four = [0, 0, 10, 10, 20, 20, 30, 30];

    it('removes the requested anchors', () => {
        expect(ArrowPoints.removeAnchors(four, [1])).toEqual([0, 0, 20, 20, 30, 30]);
        expect(ArrowPoints.removeAnchors(four, [1, 2])).toEqual([0, 0, 30, 30]);
    });

    it('keeps the original endpoints rather than dropping below 2 anchors', () => {
        expect(ArrowPoints.removeAnchors(four, [0, 1, 2, 3])).toEqual([0, 0, 30, 30]);
        expect(ArrowPoints.removeAnchors(four, [1, 2, 3])).toEqual([0, 0, 30, 30]);
    });

    it('returns null when a 2-anchor line would lose an anchor — nothing left to remove', () => {
        expect(ArrowPoints.removeAnchors([0, 0, 10, 0], [0])).toBeNull();
        expect(ArrowPoints.removeAnchors([0, 0, 10, 0], [0, 1])).toBeNull();
    });

    it('returns null when no index applies', () => {
        expect(ArrowPoints.removeAnchors(four, [])).toBeNull();
        expect(ArrowPoints.removeAnchors(four, [9, -1])).toBeNull();
    });

    it('ignores duplicate and out-of-range indices', () => {
        expect(ArrowPoints.removeAnchors(four, [1, 1, 99])).toEqual([0, 0, 20, 20, 30, 30]);
    });
});
