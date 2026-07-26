import type { Bounds, Shape, TextOptions } from '../model/shapeTypes';

/** Which style sections in the properties panel apply to a shape type. */
export interface ShapeCapabilities {
    stroke: boolean;
    fill: boolean;
    width: boolean;
    ends: boolean;
    note?: boolean;
    /** Has body text (text shapes and sticky notes) — gates the shared text-options section
     *  the same as `label` does for a caption. */
    text?: boolean;
    /** Sharp/rounded corner toggle (rectangle and diamond). */
    edges?: boolean;
    /** Solid/dashed/dotted line-style toggle (every stroked shape, i.e. not text/note). */
    strokeStyle?: boolean;
    /** Solid/hatch/cross-hatch fill-style toggle (the fillable box shapes). */
    fillStyle?: boolean;
    /** Optional centered caption, editable via double-click (every shape except text/note). */
    label?: boolean;
    /** Horizontal-alignment row within the shared text-options section (box shapes, text, note).
     *  Off for arrow/draw, whose caption is pinned to the line midpoint. */
    textAlign?: boolean;
    /** Vertical-alignment row within the shared text-options section (box shapes and note).
     *  Off for text (auto-heights to content) and arrow/draw. */
    textVAlign?: boolean;
}

/**
 * Behavior for one shape type: bounds, hit-testing, and drawing. Shape *data*
 * stays a plain serializable interface (required by Yjs — see docs/DESIGN.md); this
 * is the polymorphic strategy that replaces per-concern `switch (shape.type)`.
 */
export interface ShapeDefinition<S extends Shape = Shape> {
    /** Which properties-panel sections apply when this type is selected. */
    readonly capabilities: ShapeCapabilities;
    /** Fallback text options for this type, applied under whatever the shape itself carries
     *  (see {@link TextOptionsUtil.resolve}). Box shapes center their caption; text/note read
     *  left-aligned. */
    readonly defaultTextOptions?: TextOptions;
    /** Whether the select tool shows drag-to-resize box handles. Arrow has its own
     *  endpoint handles and is not "resizable" in this box-handle sense. */
    readonly resizable: boolean;
    /** Which resize handles a resizable shape exposes: 'both' (all 8, default) or 'x'
     *  (left/right only — text, which resizes width to set its wrap and auto-sizes height). */
    readonly resizeAxis?: 'both' | 'x';
    /** Whether the select tool shows the rotate handle. True for the box shapes
     *  (rectangle/ellipse/note/text); arrow/draw rotate via their own geometry. */
    readonly rotatable: boolean;
    getBounds(shape: S): Bounds;
    hitTest(shape: S, px: number, py: number, tol: number): boolean;
    draw(ctx: CanvasRenderingContext2D, shape: S): void;
}
