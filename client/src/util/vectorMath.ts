const SNAP_ANGLE = Math.PI / 36; // 5 degrees

/** Vector/angle-snap math for arrow/line endpoints, extracted from Whiteboard.tsx. */
export class VectorMath {
    /** Snap a vector's direction to the nearest 5° step, preserving its length. */
    public static snapAngle(dx: number, dy: number, step: number = SNAP_ANGLE): { dx: number; dy: number } {
        const len = Math.hypot(dx, dy);
        if (len === 0) return { dx, dy };
        const angle = Math.round(Math.atan2(dy, dx) / step) * step;
        return { dx: Math.cos(angle) * len, dy: Math.sin(angle) * len };
    }
}
