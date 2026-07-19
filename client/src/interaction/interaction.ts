import type { Shape, ShapeType } from '../model/types';
import type { Handle } from '../util/handles';

/** The whiteboard's pointer-interaction state machine, extracted from Whiteboard.tsx. */
export type Interaction =
    | { kind: 'none' }
    | { kind: 'pan'; lastX: number; lastY: number }
    | { kind: 'create'; draft: Shape; startX: number; startY: number }
    | { kind: 'draw'; draft: Extract<Shape, { type: 'draw' }>; startX: number; startY: number }
    | { kind: 'move'; ids: string[]; startX: number; startY: number; origins: Map<string, { x: number; y: number }>; moved: boolean }
    | { kind: 'marquee'; startX: number; startY: number; curX: number; curY: number }
    | { kind: 'resize'; id: string; handle: Handle; orig: { x: number; y: number; w: number; h: number; type: ShapeType } }
    | { kind: 'arrow-endpoint'; id: string; endpoint: 0 | 1; origX: number; origY: number; origDx: number; origDy: number };

/** Screen + world pointer data, decoupled from React's PointerEvent type. */
export interface PointerInfo {
    x: number; // world
    y: number; // world
    clientX: number; // screen
    clientY: number; // screen
    button: number;
    shiftKey: boolean;
}
