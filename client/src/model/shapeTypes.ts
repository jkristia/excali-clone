/**
 * Shape model. Every shape is anchored at (x, y) in *world* coordinates so that
 * moving a shape is always "add delta to x/y" regardless of type. Type-specific
 * geometry is expressed relative to that anchor.
 */
export type ShapeType = 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'draw' | 'text' | 'note' | 'image' | 'group';

/** A CSS color string (hex, rgb(), 'transparent', …) as stored on shapes and consumed by canvas 2D. */
export type Color = string;

/** Corner treatment for the box-outline shapes (rectangle/diamond). Absent ⇒ 'sharp'. */
export type CornerStyle = 'sharp' | 'rounded';

/** Line style for stroked shapes (all except text/note). Absent ⇒ 'solid'. */
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

/** Fill pattern for the fillable box shapes. Absent ⇒ 'solid'. */
export type FillStyle = 'solid' | 'hatch' | 'crossHatch';

/** Hand-drawn "sketchiness" level for stroked shapes (rectangle/ellipse/diamond/arrow),
 *  rendered via RoughJS. Absent ⇒ 'plain' (roughness 0 — an exact, non-sketchy line). */
export type Sloppiness = 'plain' | 'light' | 'medium';

export interface BaseShape {
    id: string;
    type: ShapeType;
    x: number;
    y: number;
    /** Container (group) this shape belongs to; absent ⇒ top-level (root). A
     *  `parentId` pointing at a missing container is treated as root (see
     *  {@link SceneTree}), so a deleted container degrades to loose shapes. */
    parentId?: string;
    /** Stacking order *among siblings under the same parent* (no longer global);
     *  higher renders on top within that parent. */
    z: number;
    /** awareness/user id of the creator (for attribution, not security). */
    createdBy: string;
    /** Rotation in radians (clockwise) about the shape's bounds center. Only the
     *  box shapes (rectangle/ellipse/diamond/note/text) honor it; arrow/draw ignore it. */
    rotation?: number;
    /** 0..1 fill/stroke opacity. Absent ⇒ 1 (fully opaque). */
    opacity?: number;
    /** Optional centered caption drawn over the shape. Absent/'' ⇒ none.
     *  Excluded from text/note, which are text already. */
    label?: string;
    /** Styling for whatever text the shape shows — the caption above, or, for
     *  text/note, its body. Absent ⇒ each field's own default (see {@link TextOptionsUtil}). */
    textOptions?: TextOptions;
}

export interface RectShape extends BaseShape {
    type: 'rectangle';
    w: number;
    h: number;
    fill: Color;
    stroke: Color;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    fillStyle?: FillStyle;
    edges?: CornerStyle;
    sloppiness?: Sloppiness;
}

export interface EllipseShape extends BaseShape {
    type: 'ellipse';
    w: number;
    h: number;
    fill: Color;
    stroke: Color;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    fillStyle?: FillStyle;
    sloppiness?: Sloppiness;
}

export interface DiamondShape extends BaseShape {
    type: 'diamond';
    w: number;
    h: number;
    fill: Color;
    stroke: Color;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    fillStyle?: FillStyle;
    edges?: CornerStyle;
    sloppiness?: Sloppiness;
}

/** Decoration drawn at an arrow/line endpoint. */
export type EndpointCap = 'none' | 'arrow' | 'circle';

export interface ArrowShape extends BaseShape {
    /** A plain line is just an arrow with both caps 'none'. The stored type stays
   * 'arrow' for persistence compatibility; the caps carry line-vs-arrow meaning. */
    type: 'arrow';
    /** Flattened [px, py, ...] anchors relative to (x, y); >= 2 anchors (4 numbers).
     *  A clamped Catmull-Rom spline runs through every anchor — see util/splineMath.ts.
     *  2 anchors degenerate to a straight line. */
    points: number[];
    stroke: Color;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    sloppiness?: Sloppiness;
    /** decoration at the first anchor. */
    startCap: EndpointCap;
    /** decoration at the last anchor. */
    endCap: EndpointCap;
}

export interface DrawShape extends BaseShape {
    type: 'draw';
    /** flattened [px, py, ...] points relative to (x, y). */
    points: number[];
    stroke: Color;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
}

export type TextAlign = 'left' | 'center' | 'right';

/** Vertical placement of a caption within its shape box. Absent ⇒ 'middle'. */
export type VerticalAlign = 'top' | 'middle' | 'bottom';

/** Font family choice for text-bearing shapes. Placeholder names — real font stacks TBD. */
export const enum Font {
    Font1 = 'Font1',
    Font2 = 'Font2',
    Font3 = 'Font3',
}

/** Text styling for whatever text a shape shows — its caption, or, for text/note, its body. */
export interface TextOptions {
    /** px. Absent ⇒ the family's smallest size (see FontUtil.smallSize). */
    fontSize?: number;
    /** Absent ⇒ Font1. */
    fontFamily?: Font;
    /** Horizontal alignment within the shape box. Arrow/draw pin their caption to the
     *  line midpoint and ignore it. */
    hAlign?: TextAlign;
    /** Vertical alignment within the shape box. Ignored by text (auto-heights to content). */
    vAlign?: VerticalAlign;
}

export interface TextShape extends BaseShape {
    type: 'text';
    text: string;
    color: Color;
    /** measured width/height, kept for hit-testing. */
    w: number;
    h: number;
    /** When true the shape has a fixed width (`w`, set by horizontal resize) and its text
     *  word-wraps to it; height follows the wrapped line count. Absent/false ⇒ auto-width:
     *  `w` is measured from the widest line and text only breaks on explicit newlines. */
    wrap?: boolean;
}

export interface NoteShape extends BaseShape {
    type: 'note';
    w: number;
    h: number;
    text: string;
    /** background color of the sticky note. */
    fill: Color;
}

export interface ImageShape extends BaseShape {
    type: 'image';
    w: number;
    h: number;
    /** A data: URI — the decoded pixels, embedded directly so the shape stays
     *  plain JSON with no external asset store. */
    src: string;
}

/** A container that holds shapes (and other groups) and stacks/moves/rotates as a
 *  unit. It has no geometry of its own — its bounds are the union of its
 *  descendants — and it draws nothing (see {@link GroupShapeDef}). Members point
 *  at it via {@link BaseShape.parentId}. */
export interface GroupShape extends BaseShape {
    type: 'group';
}

export type Shape =
    | RectShape
    | EllipseShape
    | DiamondShape
    | ArrowShape
    | DrawShape
    | TextShape
    | NoteShape
    | ImageShape
    | GroupShape;

export interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Presence info shared through Yjs awareness. */
export interface UserPresence {
    name: string;
    color: Color;
}

export interface AwarenessState {
    user: UserPresence;
    /** cursor position in world coordinates, or null when off-canvas. */
    cursor: { x: number; y: number } | null;
    /** ids of shapes the peer currently has selected. */
    selection: string[];
}

/** A remote peer's awareness state plus the Yjs client id it came from —
 * what the renderer and presence UI actually consume. */
export interface PeerPresence extends AwarenessState {
    clientId: number;
}
