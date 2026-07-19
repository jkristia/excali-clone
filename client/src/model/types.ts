/**
 * Shape model. Every shape is anchored at (x, y) in *world* coordinates so that
 * moving a shape is always "add delta to x/y" regardless of type. Type-specific
 * geometry is expressed relative to that anchor.
 */
export type ShapeType = 'rectangle' | 'ellipse' | 'arrow' | 'draw' | 'text' | 'note';

export interface BaseShape {
    id: string;
    type: ShapeType;
    x: number;
    y: number;
    /** z-order; higher renders on top. */
    z: number;
    /** awareness/user id of the creator (for attribution, not security). */
    createdBy: string;
}

export interface RectShape extends BaseShape {
    type: 'rectangle';
    w: number;
    h: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
}

export interface EllipseShape extends BaseShape {
    type: 'ellipse';
    w: number;
    h: number;
    fill: string;
    stroke: string;
    strokeWidth: number;
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
    stroke: string;
    strokeWidth: number;
    /** decoration at the start point (x, y). */
    startCap: EndpointCap;
    /** decoration at the end point (x+dx, y+dy). */
    endCap: EndpointCap;
}

export interface DrawShape extends BaseShape {
    type: 'draw';
    /** flattened [px, py, ...] points relative to (x, y). */
    points: number[];
    stroke: string;
    strokeWidth: number;
}

export interface TextShape extends BaseShape {
    type: 'text';
    text: string;
    fontSize: number;
    color: string;
    /** measured width/height, kept for hit-testing. */
    w: number;
    h: number;
}

export interface NoteShape extends BaseShape {
    type: 'note';
    w: number;
    h: number;
    text: string;
    /** background color of the sticky note. */
    fill: string;
}

export type Shape =
    | RectShape
    | EllipseShape
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
    color: string;
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
