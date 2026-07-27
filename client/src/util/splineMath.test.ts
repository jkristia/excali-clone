import { describe, expect, it } from 'vitest';
import { SplineMath } from './splineMath';

describe('SplineMath.segments', () => {
    it('produces one segment per pair of consecutive anchors', () => {
        expect(SplineMath.segments([0, 0, 10, 0])).toHaveLength(1);
        expect(SplineMath.segments([0, 0, 10, 0, 20, 10])).toHaveLength(2);
        expect(SplineMath.segments([0, 0, 10, 0, 20, 10, 30, 0])).toHaveLength(3);
    });

    it('returns no segments for fewer than 2 anchors', () => {
        expect(SplineMath.segments([])).toEqual([]);
        expect(SplineMath.segments([0, 0])).toEqual([]);
    });

    it('control points match the clamped Catmull-Rom formula (RoughJS-identical)', () => {
        const pts = [0, 0, 10, 0, 20, 10, 30, 0];
        const segs = SplineMath.segments(pts);
        // Middle segment (anchor 1 -> 2): prev = anchor 0, next = anchor 3.
        expect(segs[1].c1x).toBeCloseTo(10 + (20 - 0) / 6);
        expect(segs[1].c1y).toBeCloseTo(0 + (10 - 0) / 6);
        expect(segs[1].c2x).toBeCloseTo(20 - (30 - 10) / 6);
        expect(segs[1].c2y).toBeCloseTo(10 - (0 - 0) / 6);
        // First segment clamps its "previous" neighbour to anchor 0 itself.
        expect(segs[0].c1x).toBeCloseTo(0 + (10 - 0) / 6);
        // Last segment clamps its "next" neighbour to the last anchor itself (30, 0).
        expect(segs[2].c2x).toBeCloseTo(30 - (30 - 20) / 6);
    });
});

describe('SplineMath.sample', () => {
    it('traces the straight chord for a 2-anchor line', () => {
        const pts = SplineMath.sample([0, 0, 100, 0]);
        for (let i = 0; i < pts.length; i += 2) {
            expect(pts[i + 1]).toBeCloseTo(0); // stays on y=0 the whole way
        }
        expect(pts[0]).toBeCloseTo(0);
        expect(pts[pts.length - 2]).toBeCloseTo(100);
    });

    it('returns the raw points for fewer than 2 anchors', () => {
        expect(SplineMath.sample([5, 6])).toEqual([5, 6]);
    });
});

describe('SplineMath.bounds', () => {
    it('is a zero-size box at the anchor for 0 or 1 points', () => {
        expect(SplineMath.bounds([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
        expect(SplineMath.bounds([5, 8])).toEqual({ x: 5, y: 8, w: 0, h: 0 });
    });

    it('a horizontal 2-anchor line has zero height (matches today\'s straight-line behavior)', () => {
        expect(SplineMath.bounds([0, 0, 100, 0])).toEqual({ x: 0, y: 0, w: 100, h: 0 });
    });

    it('strictly contains the control-point hull for an overshooting curve', () => {
        // A zig-zag: Catmull-Rom overshoots past the middle anchors' local extrema.
        const pts = [0, 0, 50, 40, 100, -40, 150, 0];
        const b = SplineMath.bounds(pts);
        const hullMinY = -40, hullMaxY = 40;
        expect(b.y).toBeLessThan(hullMinY);
        expect(b.y + b.h).toBeGreaterThan(hullMaxY);
    });
});

describe('SplineMath.startAngle / endAngle', () => {
    it('point along the first/last chord, not the overall chord, for an L-shaped curve', () => {
        // Overall chord (0,0)->(0,100) is straight down; the first segment goes right.
        const pts = [0, 0, 100, 0, 100, 100, 0, 100];
        expect(SplineMath.startAngle(pts)).toBeCloseTo(Math.atan2(0, 100)); // along +x
        expect(SplineMath.endAngle(pts)).toBeCloseTo(Math.atan2(0, -100)); // along -x
    });

    it('walks past coincident leading/trailing anchors', () => {
        const pts = [0, 0, 0, 0, 10, 0];
        expect(SplineMath.startAngle(pts)).toBeCloseTo(Math.atan2(0, 10));
    });

    it('falls back to 0 (not NaN) when every anchor coincides', () => {
        expect(SplineMath.startAngle([5, 5, 5, 5])).toBe(0);
        expect(SplineMath.endAngle([5, 5, 5, 5])).toBe(0);
    });
});

describe('SplineMath.segmentMidpoint', () => {
    it('lies on the sampled curve for that segment', () => {
        const pts = [0, 0, 50, 40, 100, -40, 150, 0];
        const mid = SplineMath.segmentMidpoint(pts, 1);
        const samples = SplineMath.sample(pts, 64);
        let closest = Infinity;
        for (let i = 0; i < samples.length; i += 2) {
            closest = Math.min(closest, Math.hypot(samples[i] - mid.x, samples[i + 1] - mid.y));
        }
        expect(closest).toBeLessThan(1);
    });
});

describe('SplineMath.anchorCount', () => {
    it('is half the flattened array length', () => {
        expect(SplineMath.anchorCount([0, 0, 1, 1, 2, 2])).toBe(3);
    });
});
