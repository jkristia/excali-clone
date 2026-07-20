import type { Bounds } from '../model/types';

/** Rotation is stored per shape as radians about its bounds center. These pure
 *  helpers convert between world and a shape's local (un-rotated) frame so that
 *  rendering, hit-testing, and resize can all reuse the same transform. */
export class RotationMath {
    /** Snap step for Shift-constrained rotation: 5 degrees, in radians. */
    public static readonly SNAP_STEP = (5 * Math.PI) / 180;

    public static center(b: Bounds): { x: number; y: number } {
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }

    /** Rotate (px, py) about pivot (cx, cy) by `angle` radians (clockwise). */
    public static rotatePoint(px: number, py: number, cx: number, cy: number, angle: number): { x: number; y: number } {
        if (!angle) return { x: px, y: py };
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dx = px - cx;
        const dy = py - cy;
        return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    }

    public static snap(angle: number, step = RotationMath.SNAP_STEP): number {
        return Math.round(angle / step) * step;
    }
}
