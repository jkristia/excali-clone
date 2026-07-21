/**
 * Shape model. Every shape is anchored at (x, y) in *world* coordinates so that
 * moving a shape is always "add delta to x/y" regardless of type. Type-specific
 * geometry is expressed relative to that anchor.
 */
export type ShapeType = 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'draw' | 'text' | 'note';

/** A CSS color string (hex, rgb(), 'transparent', …) as stored on shapes and consumed by canvas 2D. */
export type Color = string;

/** Corner treatment for the box-outline shapes (rectangle/diamond). Absent ⇒ 'sharp'. */
export type CornerStyle = 'sharp' | 'rounded';

/** Line style for stroked shapes (all except text/note). Absent ⇒ 'solid'. */
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

/** Fill pattern for the fillable box shapes. Absent ⇒ 'solid'. */
export type FillStyle = 'solid' | 'hatch' | 'crossHatch';

export interface BaseShape {
    id: string;
    type: ShapeType;
    x: number;
    y: number;
    /** z-order; higher renders on top. */
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
    /** Caption font size in px. Absent ⇒ 16 (the 'S' size). */
    labelFontSize?: number;
    /** Horizontal alignment of the caption within the shape box. Absent ⇒ 'center'.
     *  Honored by the box shapes (rectangle/ellipse/diamond); arrow/draw pin their
     *  caption to the line midpoint and ignore it. */
    labelHAlign?: TextAlign;
    /** Vertical alignment of the caption within the shape box. Absent ⇒ 'middle'.
     *  Honored by the box shapes; arrow/draw ignore it (see {@link labelHAlign}). */
    labelVAlign?: VerticalAlign;
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
}

/** Decoration drawn at an arrow/line endpoint. */
export type EndpointCap = 'none' | 'arrow' | 'circle';

export interface ArrowShape extends BaseShape {
    /** A plain line is just an arrow with both caps 'none'. The stored type stays
   * 'arrow' for persistence compatibility; the caps carry line-vs-arrow meaning. */
    type: 'arrow';
    /** end point, relative to (x, y). */
    dx: number;
    dy: number;
    stroke: Color;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    /** decoration at the start point (x, y). */
    startCap: EndpointCap;
    /** decoration at the end point (x+dx, y+dy). */
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

export interface TextShape extends BaseShape {
    type: 'text';
    text: string;
    fontSize: number;
    color: Color;
    textAlign: TextAlign;
    /** measured width/height, kept for hit-testing. */
    w: number;
    h: number;
}

export interface NoteShape extends BaseShape {
    type: 'note';
    w: number;
    h: number;
    text: string;
    fontSize: number;
    textAlign: TextAlign;
    /** background color of the sticky note. */
    fill: Color;
}

export type Shape =
    | RectShape
    | EllipseShape
    | DiamondShape
    | ArrowShape
    | DrawShape
    | TextShape
    | NoteShape;

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
