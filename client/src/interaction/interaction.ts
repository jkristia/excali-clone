import type { Shape, ShapeType } from '../model/shapeTypes';
import type { Handle } from '../util/handles';
import type { MultiPointBuilder } from './multiPointBuilder';

/**
 * How a marquee drag combines its enclosed shapes with the existing selection,
 * decided from the modifier keys held when the drag begins.
 */
export type MarqueeMode = 'replace' | 'add' | 'subtract';

/** The whiteboard's pointer-interaction state machine, extracted from Whiteboard.tsx. */
export type Interaction =
    | { kind: 'none' }
    | { kind: 'pan'; lastX: number; lastY: number }
    | { kind: 'create'; draft: Shape; startX: number; startY: number }
    | { kind: 'draw'; draft: Extract<Shape, { type: 'draw' }>; startX: number; startY: number }
    | { kind: 'move'; ids: string[]; startX: number; startY: number; origins: Map<string, { x: number; y: number }>; moved: boolean; pendingSelect?: string; pendingEdit?: { id: string; x: number; y: number }; groupX: number; groupY: number }
    | { kind: 'marquee'; startX: number; startY: number; curX: number; curY: number; mode: MarqueeMode }
    | { kind: 'resize'; id: string; handle: Handle; orig: { x: number; y: number; w: number; h: number; type: ShapeType; rotation: number } }
    | { kind: 'rotate'; id: string; cx: number; cy: number; startPointerAngle: number; origRotation: number }
    | { kind: 'rotate-selection'; pivot: { x: number; y: number }; startPointerAngle: number; origins: Map<string, RotateOrigin> }
    /** Dragging one or more anchors of a line/arrow. `primary` is the grabbed anchor —
     *  it's what snaps to the grid/angle — and `indices` is every anchor that moves
     *  (just `[primary]` outside point-edit mode, or the whole node selection inside it). */
    | { kind: 'arrow-point'; id: string; primary: number; indices: readonly number[]; origX: number; origY: number; origPoints: readonly number[] }
    /** A multi-point line/arrow being placed click-by-click. Uniquely among interactions,
     *  this one survives `onPointerUp` — the gesture is a sequence of clicks, not a drag —
     *  and is ended only by `finishMultiPoint`. Holds a class instance
     *  (never persisted to Yjs, so that's fine) rather than plain data like every other case. */
    | { kind: 'arrow-multi'; builder: MultiPointBuilder };

/**
 * Per-shape state captured at the start of a multi-selection rotate, enough to
 * recompute the shape's geometry from the drag angle each frame (nothing is
 * stored as an aggregate). Discriminated by how the shape carries rotation:
 * box shapes accumulate the `rotation` field about their center; arrow/draw
 * ignore `rotation` and instead carry an anchor + relative points array, so
 * their coordinates are rotated explicitly.
 */
export type RotateOrigin =
    | { kind: 'box'; cx: number; cy: number; hw: number; hh: number; origRotation: number }
    | { kind: 'points'; x: number; y: number; points: readonly number[] };

/** Screen + world pointer data, decoupled from React's PointerEvent type. */
export interface PointerInfo {
    x: number; // world
    y: number; // world
    clientX: number; // screen
    clientY: number; // screen
    button: number;
    shiftKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
}
