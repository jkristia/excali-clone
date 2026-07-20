/** Grid geometry shared by the renderer (drawing the grid) and the interaction
 *  layer (snapping shapes to it) so the two can never drift apart. Minor lines are
 *  the snap unit; every `DIVISIONS`th line is a major line. */
export class GridMath {
    /** Snap unit and dashed sub-line spacing, in world px. */
    public static readonly MINOR = 20;
    /** Minor divisions per major (solid) line. */
    public static readonly DIVISIONS = 5;
    /** Solid major-line spacing, in world px. */
    public static readonly MAJOR = GridMath.MINOR * GridMath.DIVISIONS;

    /** Round a world coordinate to the nearest minor grid line. */
    public static snap(value: number): number {
        return Math.round(value / GridMath.MINOR) * GridMath.MINOR;
    }
}
