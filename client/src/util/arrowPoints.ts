import type { ArrowShape } from '../model/shapeTypes';
import { SplineMath } from './splineMath';

const HANDLE_HIT_RADIUS = 6; // screen pixels
/** Anchors get a deliberately generous grab — far larger than the insert dots below —
 *  so a near-miss while shaping a curve moves the anchor instead of splicing in a new
 *  node. Separate from HIT_RADIUS, which box-shape resize handles also use. */
const ANCHOR_HIT_RADIUS = 10; // screen pixels
const MID_HANDLE_HIT_RADIUS = 4; // screen pixels, the smaller midpoint-insert handles

/** Anchor + midpoint hit-testing and positions for a multi-anchor arrow/line. Shared by
 *  the renderer (drawing handles) and the select tool (hit-testing them), so drawing and
 *  hit-testing can't drift apart — the same invariant `Handles.points()` gives box shapes. */
export class ArrowPoints {
    public static readonly HIT_RADIUS = HANDLE_HIT_RADIUS;
    public static readonly ANCHOR_HIT_RADIUS = ANCHOR_HIT_RADIUS;
    public static readonly MID_HIT_RADIUS = MID_HANDLE_HIT_RADIUS;

    /** World-space anchor positions. */
    public static anchors(shape: ArrowShape): { x: number; y: number }[] {
        const out: { x: number; y: number }[] = [];
        for (let i = 0; i + 1 < shape.points.length; i += 2) {
            out.push({ x: shape.x + shape.points[i], y: shape.y + shape.points[i + 1] });
        }
        return out;
    }

    /** World-space midpoint positions, one per segment (only meaningful in point-edit mode). */
    public static midpoints(shape: ArrowShape): { x: number; y: number }[] {
        const n = SplineMath.anchorCount(shape.points);
        const out: { x: number; y: number }[] = [];
        for (let i = 0; i < n - 1; i++) {
            const mid = SplineMath.segmentMidpoint(shape.points, i);
            out.push({ x: shape.x + mid.x, y: shape.y + mid.y });
        }
        return out;
    }

    /** Index of the anchor within radius of (px, py), or null. Scans last-to-first so the
     *  head wins when handles overlap (visually "on top" of earlier anchors). */
    public static hitTestAnchor(shape: ArrowShape, px: number, py: number, zoom: number): number | null {
        const r = ANCHOR_HIT_RADIUS / zoom;
        const anchors = ArrowPoints.anchors(shape);
        for (let i = anchors.length - 1; i >= 0; i--) {
            if (Math.hypot(px - anchors[i].x, py - anchors[i].y) <= r) return i;
        }
        return null;
    }

    /** Index i meaning "the midpoint between anchor i and i + 1", or null. */
    public static hitTestMidpoint(shape: ArrowShape, px: number, py: number, zoom: number): number | null {
        const r = MID_HANDLE_HIT_RADIUS / zoom;
        const mids = ArrowPoints.midpoints(shape);
        for (let i = 0; i < mids.length; i++) {
            if (Math.hypot(px - mids[i].x, py - mids[i].y) <= r) return i;
        }
        return null;
    }

    /** The subset of `indices` still addressable in `shape`, deduped and ascending.
     *  A node selection is held by index, and a peer's edit can shrink `points` under
     *  us — so filter at every read site rather than trying to remap against remote
     *  changes. */
    public static validIndices(shape: ArrowShape, indices: readonly number[]): number[] {
        const n = SplineMath.anchorCount(shape.points);
        return [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < n).sort((a, b) => a - b);
    }

    /** `points` with the given anchor indices removed. A line needs two anchors, so if
     *  the removal would leave fewer, the original first and last anchors are kept
     *  instead — the shape always survives (delete the line itself by leaving point-edit
     *  mode first). Returns null when nothing would change. */
    public static removeAnchors(points: readonly number[], indices: readonly number[]): number[] | null {
        const n = SplineMath.anchorCount(points);
        const drop = new Set([...indices].filter((i) => Number.isInteger(i) && i >= 0 && i < n));
        if (drop.size === 0) return null;

        if (n - drop.size < 2) {
            const endpoints = [points[0], points[1], points[(n - 1) * 2], points[(n - 1) * 2 + 1]];
            return n === 2 ? null : endpoints;
        }
        const kept: number[] = [];
        for (let i = 0; i < n; i++) {
            if (drop.has(i)) continue;
            kept.push(points[i * 2], points[i * 2 + 1]);
        }
        return kept;
    }
}
