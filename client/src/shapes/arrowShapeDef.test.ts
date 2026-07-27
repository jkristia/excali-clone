import { describe, expect, it } from 'vitest';
import { ArrowShapeDef } from './arrowShapeDef';
import { arrow, curvedArrow } from '../test-support/shapeFactories';
import { SplineMath } from '../util/splineMath';
import { Geometry } from '../util/geometry';

const def = new ArrowShapeDef();

describe('ArrowShapeDef.getBounds', () => {
    it('a straight 2-anchor arrow bounds to its normalized chord', () => {
        expect(def.getBounds(arrow({ x: 5, y: 5, points: [0, 0, -10, 20] }))).toEqual({ x: -5, y: 5, w: 10, h: 20 });
    });

    it('a curved arrow\'s bounds include the overshoot beyond the anchor chord', () => {
        const s = curvedArrow({ x: 0, y: 0 }); // anchors at y: 0, -20, 20, 0
        const b = def.getBounds(s);
        // The chord through anchors alone spans y -20..20; the curve overshoots past that.
        expect(b.y).toBeLessThan(-20);
        expect(b.y + b.h).toBeGreaterThan(20);
    });
});

describe('ArrowShapeDef.hitTest', () => {
    it('hits near a straight 2-anchor segment', () => {
        const s = arrow({ x: 0, y: 0, points: [0, 0, 100, 0], strokeWidth: 2 });
        expect(def.hitTest(s, 50, 0, 6)).toBe(true);
        expect(def.hitTest(s, 50, 20, 6)).toBe(false);
    });

    it('hits a point on the curve that sits well off the anchor-to-anchor chords', () => {
        // Anchors (0,0)-(30,-20)-(60,20)-(90,0). The curve overshoots past its anchors
        // (verified by getBounds above), so sample a point on the actual curve and prove
        // it's far from every anchor-to-anchor chord — hitTest must still find it, meaning
        // it's testing the sampled curve, not the naive anchor polyline.
        const s = curvedArrow({ x: 0, y: 0, strokeWidth: 2 });
        const samples = SplineMath.sample(s.points);
        const anchors = s.points;
        let farthestPoint = { x: samples[0], y: samples[1] };
        let farthestDist = -Infinity;
        for (let i = 0; i < samples.length; i += 2) {
            const px = samples[i], py = samples[i + 1];
            let distToChords = Infinity;
            for (let a = 0; a + 3 < anchors.length; a += 2) {
                distToChords = Math.min(distToChords, Geometry.distToSegment(
                    px, py, anchors[a], anchors[a + 1], anchors[a + 2], anchors[a + 3],
                ));
            }
            if (distToChords > farthestDist) { farthestDist = distToChords; farthestPoint = { x: px, y: py }; }
        }
        expect(farthestDist).toBeGreaterThan(1); // confirms the curve really leaves the chords
        expect(def.hitTest(s, farthestPoint.x, farthestPoint.y, 1)).toBe(true);
    });

    it('misses a point well outside tolerance of the curve', () => {
        const s = curvedArrow({ x: 0, y: 0, strokeWidth: 2 });
        expect(def.hitTest(s, 200, 200, 6)).toBe(false);
    });
});

describe('ArrowShapeDef.draw', () => {
    it('does nothing for a degenerate single-anchor shape', () => {
        const calls: string[] = [];
        const ctx = new Proxy({}, {
            get: (_t, prop: string) => (...args: unknown[]) => calls.push(`${prop}(${args.join(',')})`),
        }) as unknown as CanvasRenderingContext2D;
        const s = arrow({ points: [0, 0] });
        def.draw(ctx, s);
        expect(calls).toEqual([]);
    });
});
