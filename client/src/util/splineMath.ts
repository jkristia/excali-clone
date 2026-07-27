import type { Bounds } from '../model/shapeTypes';

/** One cubic-Bezier segment of a spline, in whatever frame its input points were in. */
export interface SplineSegment {
    x0: number;
    y0: number;
    c1x: number;
    c1y: number;
    c2x: number;
    c2y: number;
    x1: number;
    y1: number;
}

/**
 * Clamped, uniform Catmull-Rom spline through a flattened `[x, y, ...]` anchor list —
 * the geometry a multi-point line/arrow curves through. The control-point formula here
 * is deliberately identical to RoughJS's own `_curve`/`_curveWithOffset` (verified against
 * `roughjs/bin/renderer.js` at `curveTightness: 0`), so what gets drawn and what gets
 * hit-tested/bounded never drift apart. 2 anchors degenerate to a straight segment: with
 * only two points the clamped end condition makes both control points colinear with the
 * endpoints, so the "curve" is geometrically a straight line.
 */
export class SplineMath {
    public static readonly SAMPLES_PER_SEGMENT = 16;

    /** Number of anchors in a flattened points array. */
    public static anchorCount(points: readonly number[]): number {
        return points.length / 2;
    }

    /** One cubic-Bezier segment per pair of consecutive anchors. Empty for < 2 anchors. */
    public static segments(points: readonly number[]): SplineSegment[] {
        const n = SplineMath.anchorCount(points);
        if (n < 2) return [];
        const segs: SplineSegment[] = [];
        for (let k = 0; k < n - 1; k++) {
            const p0x = points[k * 2], p0y = points[k * 2 + 1];
            const p1x = points[(k + 1) * 2], p1y = points[(k + 1) * 2 + 1];
            const prevIdx = k >= 1 ? k - 1 : 0;
            const nextIdx = k <= n - 3 ? k + 2 : n - 1;
            const prevX = points[prevIdx * 2], prevY = points[prevIdx * 2 + 1];
            const nextX = points[nextIdx * 2], nextY = points[nextIdx * 2 + 1];
            segs.push({
                x0: p0x, y0: p0y,
                c1x: p0x + (p1x - prevX) / 6, c1y: p0y + (p1y - prevY) / 6,
                c2x: p1x - (nextX - p0x) / 6, c2y: p1y - (nextY - p0y) / 6,
                x1: p1x, y1: p1y,
            });
        }
        return segs;
    }

    /** Flattened `[x, y, ...]` polyline approximating the curve, for hit-testing. */
    public static sample(points: readonly number[], perSegment = SplineMath.SAMPLES_PER_SEGMENT): number[] {
        const segs = SplineMath.segments(points);
        if (segs.length === 0) return [...points];
        const out: number[] = [segs[0].x0, segs[0].y0];
        for (const seg of segs) {
            for (let i = 1; i <= perSegment; i++) {
                const t = i / perSegment;
                const pt = SplineMath.evaluate(seg, t);
                out.push(pt.x, pt.y);
            }
        }
        return out;
    }

    /** Tight AABB of the curve, from exact per-segment Bezier extrema (not sampled,
     *  not the control-point hull — Catmull-Rom overshoots its hull). */
    public static bounds(points: readonly number[]): Bounds {
        const n = SplineMath.anchorCount(points);
        if (n === 0) return { x: 0, y: 0, w: 0, h: 0 };
        if (n === 1) return { x: points[0], y: points[1], w: 0, h: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const seg of SplineMath.segments(points)) {
            for (const [x, y] of SplineMath.segmentExtrema(seg)) {
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    /** Forward tangent angle (radians) at the first anchor — where the start cap points
     *  *back* from (callers add PI, as ArrowShapeDef does). Walks forward past coincident
     *  anchors; falls back to 0 (not NaN) if every anchor coincides. */
    public static startAngle(points: readonly number[]): number {
        const n = SplineMath.anchorCount(points);
        for (let k = 1; k < n; k++) {
            const dx = points[k * 2] - points[0];
            const dy = points[k * 2 + 1] - points[1];
            if (dx !== 0 || dy !== 0) return Math.atan2(dy, dx);
        }
        return 0;
    }

    /** Forward tangent angle (radians) at the last anchor — the end cap's direction. */
    public static endAngle(points: readonly number[]): number {
        const n = SplineMath.anchorCount(points);
        const lastX = points[(n - 1) * 2], lastY = points[(n - 1) * 2 + 1];
        for (let k = n - 2; k >= 0; k--) {
            const dx = lastX - points[k * 2];
            const dy = lastY - points[k * 2 + 1];
            if (dx !== 0 || dy !== 0) return Math.atan2(dy, dx);
        }
        return 0;
    }

    /** Point at t=0.5 on the segment between anchor `index` and `index + 1` — where the
     *  point-edit "insert anchor here" handle sits. */
    public static segmentMidpoint(points: readonly number[], index: number): { x: number; y: number } {
        const segs = SplineMath.segments(points);
        return SplineMath.evaluate(segs[index], 0.5);
    }

    private static evaluate(seg: SplineSegment, t: number): { x: number; y: number } {
        const mt = 1 - t;
        const a = mt * mt * mt;
        const b = 3 * mt * mt * t;
        const c = 3 * mt * t * t;
        const d = t * t * t;
        return {
            x: a * seg.x0 + b * seg.c1x + c * seg.c2x + d * seg.x1,
            y: a * seg.y0 + b * seg.c1y + c * seg.c2y + d * seg.y1,
        };
    }

    /** The segment's own endpoints plus any interior extrema (roots of B'(t) = 0 in (0, 1)). */
    private static segmentExtrema(seg: SplineSegment): [number, number][] {
        const pts: [number, number][] = [[seg.x0, seg.y0], [seg.x1, seg.y1]];
        for (const t of SplineMath.axisRoots(seg.x0, seg.c1x, seg.c2x, seg.x1)) {
            pts.push([SplineMath.evaluate(seg, t).x, SplineMath.evaluate(seg, t).y]);
        }
        for (const t of SplineMath.axisRoots(seg.y0, seg.c1y, seg.c2y, seg.y1)) {
            pts.push([SplineMath.evaluate(seg, t).x, SplineMath.evaluate(seg, t).y]);
        }
        return pts;
    }

    /** Roots in (0, 1) of the derivative of a cubic Bezier's single axis. */
    private static axisRoots(p0: number, p1: number, p2: number, p3: number): number[] {
        const a = -p0 + 3 * p1 - 3 * p2 + p3;
        const b = 2 * (p0 - 2 * p1 + p2);
        const c = p1 - p0;
        const roots: number[] = [];
        if (Math.abs(a) < 1e-9) {
            if (Math.abs(b) > 1e-9) {
                const t = -c / b;
                if (t > 0 && t < 1) roots.push(t);
            }
            return roots;
        }
        const disc = b * b - 4 * a * c;
        if (disc < 0) return roots;
        const sqrtDisc = Math.sqrt(disc);
        const t1 = (-b + sqrtDisc) / (2 * a);
        const t2 = (-b - sqrtDisc) / (2 * a);
        if (t1 > 0 && t1 < 1) roots.push(t1);
        if (t2 > 0 && t2 < 1) roots.push(t2);
        return roots;
    }
}
