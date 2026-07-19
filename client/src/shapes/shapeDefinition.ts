import type { Bounds, Shape } from '../model/types';

/** Which style sections in the properties panel apply to a shape type. */
export interface ShapeCapabilities {
    stroke: boolean;
    fill: boolean;
    width: boolean;
    ends: boolean;
    note?: boolean;
    /** Font-size + text-align controls (text shapes and sticky notes). */
    text?: boolean;
}

/**
 * Behavior for one shape type: bounds, hit-testing, and drawing. Shape *data*
 * stays a plain serializable interface (required by Yjs — see DESIGN.md); this
 * is the polymorphic strategy that replaces per-concern `switch (shape.type)`.
 */
export interface ShapeDefinition<S extends Shape = Shape> {
    /** Which properties-panel sections apply when this type is selected. */
    readonly capabilities: ShapeCapabilities;
    /** Whether the select tool shows drag-to-resize box handles. Arrow has its own
     *  endpoint handles and is not "resizable" in this box-handle sense. */
    readonly resizable: boolean;
    getBounds(shape: S): Bounds;
    hitTest(shape: S, px: number, py: number, tol: number): boolean;
    draw(ctx: CanvasRenderingContext2D, shape: S): void;
}
