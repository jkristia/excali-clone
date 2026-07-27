import type { ArrowShape } from '../model/shapeTypes';

/** Minimum on-commit span (world units) for a 2-anchor line — matches the drag-to-create
 *  threshold, so clicking twice in nearly the same spot doesn't leave a zero-length arrow. */
const MIN_TWO_ANCHOR_SPAN = 4;

/**
 * The pending state of a multi-point line/arrow being placed click-by-click. Lives
 * inside the `arrow-multi` Interaction, which — uniquely among interactions — survives
 * pointer-up: the gesture is a sequence of clicks, not a single drag.
 */
export class MultiPointBuilder {
    private readonly placed: ArrowShape;
    private cursorX: number;
    private cursorY: number;

    /** `draft` starts with exactly one anchor `points: [0, 0]` — the click that entered
     *  multi-point mode. `cursorX/cursorY` are that same click's world position. */
    constructor(draft: ArrowShape, cursorX: number, cursorY: number) {
        this.placed = draft;
        this.cursorX = cursorX;
        this.cursorY = cursorY;
    }

    /** World position of the last *placed* anchor (not the live cursor anchor). */
    public lastAnchor(): { x: number; y: number } {
        const pts = this.placed.points;
        const n = pts.length;
        return { x: this.placed.x + pts[n - 2], y: this.placed.y + pts[n - 1] };
    }

    /** True when (px, py) is within `radius` of the last placed anchor — the
     *  "click the last point to finish" gesture (and, for free, a double-click's
     *  second click). */
    public isOnLastAnchor(px: number, py: number, radius: number): boolean {
        const last = this.lastAnchor();
        return Math.hypot(px - last.x, py - last.y) <= radius;
    }

    public appendAnchor(px: number, py: number): void {
        this.placed.points.push(px - this.placed.x, py - this.placed.y);
        this.cursorX = px;
        this.cursorY = py;
    }

    public moveCursor(px: number, py: number): void {
        this.cursorX = px;
        this.cursorY = py;
    }

    /** The shape to render this frame: the placed anchors plus a live anchor at the
     *  cursor, so the preview segment bends the same spline it would commit as. */
    public preview(): ArrowShape {
        return {
            ...this.placed,
            points: [...this.placed.points, this.cursorX - this.placed.x, this.cursorY - this.placed.y],
        };
    }

    /** World-space placed anchors, flattened `[x, y, ...]` — what the renderer draws
     *  handles on while placing. */
    public placedAnchors(): number[] {
        const pts = this.placed.points;
        const out: number[] = [];
        for (let i = 0; i + 1 < pts.length; i += 2) out.push(this.placed.x + pts[i], this.placed.y + pts[i + 1]);
        return out;
    }

    /** The committable shape, or null when there's nothing worth keeping (a single
     *  placed anchor, or two anchors too close together to matter). */
    public finish(): ArrowShape | null {
        const pts = this.placed.points;
        const n = pts.length / 2;
        if (n < 2) return null;
        if (n === 2) {
            const span = Math.hypot(pts[2] - pts[0], pts[3] - pts[1]);
            if (span <= MIN_TWO_ANCHOR_SPAN) return null;
        }
        return this.placed;
    }
}
