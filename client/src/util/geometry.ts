import type { Bounds } from '../model/types';

/** Pure geometric primitives shared by shape definitions and multi-shape queries. */
export class Geometry {
    /** Turn a possibly-negative w/h rectangle into a positive-extent box. */
    public static normalizeRect(x: number, y: number, w: number, h: number): Bounds {
        return {
            x: w < 0 ? x + w : x,
            y: h < 0 ? y + h : y,
            w: Math.abs(w),
            h: Math.abs(h),
        };
    }

    public static pointInBounds(px: number, py: number, b: Bounds, pad = 0): boolean {
        return px >= b.x - pad && px <= b.x + b.w + pad && py >= b.y - pad && py <= b.y + b.h + pad;
    }

    public static distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }
}
