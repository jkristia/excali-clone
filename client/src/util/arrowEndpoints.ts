import type { ArrowShape } from '../model/types';

const HANDLE_HIT_RADIUS = 6; // screen pixels

/** Hit-testing for an arrow/line shape's two draggable endpoints. */
export class ArrowEndpoints {
    public static readonly HIT_RADIUS = HANDLE_HIT_RADIUS;

    /** Which endpoint (0 = tail, 1 = head) is within radius of (px, py), or null. */
    public static hitTest(shape: ArrowShape, px: number, py: number, zoom: number): 0 | 1 | null {
        const r = HANDLE_HIT_RADIUS / zoom;
        // Check head first — visually "on top" of the tail when they overlap.
        if (Math.hypot(px - (shape.x + shape.dx), py - (shape.y + shape.dy)) <= r) return 1;
        if (Math.hypot(px - shape.x, py - shape.y) <= r) return 0;
        return null;
    }
}
