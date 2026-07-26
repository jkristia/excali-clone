import type { Bounds } from '../model/shapeTypes';

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

    /** The handle within `radius` of (px, py), or -1 if none. `allowed`, when given, restricts
     *  the test to that subset (e.g. horizontal-only resize exposes just E/W). */
    public static hitTest(b: Bounds, px: number, py: number, radius: number, allowed?: readonly Handle[]): Handle | -1 {
        const pts = Handles.points(b);
        for (let i = 0; i < pts.length; i++) {
            if (allowed && !allowed.includes(i as Handle)) continue;
            if (Math.abs(px - pts[i][0]) <= radius && Math.abs(py - pts[i][1]) <= radius) return i as Handle;
        }
        return -1;
    }

    /** Which handles a shape exposes for its resize axis: 'x' → left/right only, else all 8.
     *  Single source shared by drawing and hit-testing so the two never disagree. */
    public static activeHandles(axis: 'both' | 'x' | undefined): readonly Handle[] {
        return axis === 'x' ? [Handle.E, Handle.W] : Handles.ALL;
    }

    private static readonly ALL: readonly Handle[] = [Handle.NW, Handle.N, Handle.NE, Handle.E, Handle.SE, Handle.S, Handle.SW, Handle.W];

    /** Corner handles sit on even values in the clockwise layout; edges are odd. */
    public static isCorner(handle: Handle): boolean {
        return handle % 2 === 0;
    }

    /**
     * Base resize-axis angle (degrees, mod 180) per handle before the shape's
     * rotation is applied: E/W = 0 (horizontal), N/S = 90 (vertical),
     * NW/SE = 45 ("\"), NE/SW = 135 ("/"). Indexed by `Handle`.
     */
    private static readonly HANDLE_AXIS = [45, 90, 135, 0, 45, 90, 135, 0];
    /** CSS resize cursor per 45° bucket: 0->ew, 45->nwse, 90->ns, 135->nesw. */
    private static readonly AXIS_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

    /**
     * The CSS resize cursor for `handle` on a shape rotated `rotation` radians
     * (clockwise). The handle's axis is rotated with the shape and snapped to the
     * nearest of the four resize cursors, so a rotated frame's cursors track it.
     */
    public static cursor(handle: Handle, rotation: number): string {
        const deg = Handles.HANDLE_AXIS[handle] + (rotation * 180) / Math.PI;
        const axis = ((deg % 180) + 180) % 180; // normalize into [0, 180)
        return Handles.AXIS_CURSORS[Math.round(axis / 45) % 4];
    }

    /** Gap (screen px) between the top edge and the rotate handle circle. */
    public static readonly ROTATE_OFFSET = 24;

    /** Padding (screen px) between a multi-selection's union bounds and its drawn
     *  dashed box. Shared so the renderer's box and the tool's rotate-handle
     *  hit-test derive from the same padded frame and never desync. */
    public static readonly SELECTION_PAD = 4;

    /** Grow `b` outward by `pad` on all sides (pad in world units: screen px / zoom). */
    public static padBounds(b: Bounds, pad: number): Bounds {
        return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
    }

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
