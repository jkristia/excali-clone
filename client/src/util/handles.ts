import type { Bounds } from '../model/types';

/**
 * The 8 resize handles, clockwise from top-left. Values are 0–7 by declaration
 * order so they double as indices into `Handles.points()` and the cursor table,
 * and so corner detection can stay `value % 2 === 0` (see `Handles.isCorner`).
 */
export enum Handle {
    NW, N, NE, E, SE, S, SW, W,
}

/**
 * The 8-point resize-handle layout (corners + edge midpoints, clockwise from
 * top-left). Single source of truth so drawing (render.ts) and hit-testing
 * (interaction) can never desync — they previously computed this layout
 * independently in two places.
 */
export class Handles {
    public static points(b: Bounds): [number, number][] {
        return [
            [b.x, b.y],
            [b.x + b.w / 2, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w, b.y + b.h / 2],
            [b.x + b.w, b.y + b.h],
            [b.x + b.w / 2, b.y + b.h],
            [b.x, b.y + b.h],
            [b.x, b.y + b.h / 2],
        ];
    }

    /** The handle within `radius` of (px, py), or -1 if none. */
    public static hitTest(b: Bounds, px: number, py: number, radius: number): Handle | -1 {
        const pts = Handles.points(b);
        for (let i = 0; i < pts.length; i++) {
            if (Math.abs(px - pts[i][0]) <= radius && Math.abs(py - pts[i][1]) <= radius) return i as Handle;
        }
        return -1;
    }

    /** Corner handles sit on even values in the clockwise layout; edges are odd. */
    public static isCorner(handle: Handle): boolean {
        return handle % 2 === 0;
    }

    /** Gap (screen px) between the top edge and the rotate handle circle. */
    public static readonly ROTATE_OFFSET = 24;

    /**
     * The rotate handle floats above the top edge midpoint. Kept out of the
     * `Handle` enum (which drives resize math + cursor indexing) since it is a
     * different interaction. `offset` is in world units (screen px / zoom).
     * Both the renderer and hit-testing derive the point from here.
     */
    public static rotateHandlePoint(b: Bounds, offset: number): [number, number] {
        return [b.x + b.w / 2, b.y - offset];
    }
}
