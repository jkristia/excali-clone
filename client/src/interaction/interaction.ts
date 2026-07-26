import type { Shape, ShapeType } from '../model/shapeTypes';
import type { Handle } from '../util/handles';

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
    | { kind: 'arrow-endpoint'; id: string; endpoint: 0 | 1; origX: number; origY: number; origDx: number; origDy: number };

/**
 * Per-shape state captured at the start of a multi-selection rotate, enough to
 * recompute the shape's geometry from the drag angle each frame (nothing is
 * stored as an aggregate). Discriminated by how the shape carries rotation:
 * box shapes accumulate the `rotation` field about their center; arrow/draw
 * ignore `rotation`, so their coordinates are rotated explicitly.
 */
export type RotateOrigin =
    | { kind: 'box'; cx: number; cy: number; hw: number; hh: number; origRotation: number }
    | { kind: 'arrow'; x: number; y: number; dx: number; dy: number }
    | { kind: 'draw'; x: number; y: number; points: readonly number[] };

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
