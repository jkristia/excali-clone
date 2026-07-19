import type { ShapeType } from '../model/types';
import { Handle, Handles } from './handles';

export interface ResizeOrigin {
    x: number;
    y: number;
    w: number;
    h: number;
    type: ShapeType;
}

export interface ResizeGeometry {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Resize math for the 8-handle drag interaction. */
export class ResizeMath {
    public static compute(
        orig: ResizeOrigin,
        handle: Handle,
        px: number, py: number,
        shiftKey: boolean,
    ): ResizeGeometry {
        const right = orig.x + orig.w;
        const bottom = orig.y + orig.h;
        let x = orig.x, y = orig.y, w = orig.w, h = orig.h;

        switch (handle) {
            case Handle.NW: x = px; y = py; w = right - px;    h = bottom - py; break;
            case Handle.N:          y = py;                    h = bottom - py; break;
            case Handle.NE:         y = py; w = px - orig.x;   h = bottom - py; break;
            case Handle.E:                  w = px - orig.x;                    break;
            case Handle.SE:                 w = px - orig.x;   h = py - orig.y; break;
            case Handle.S:                                     h = py - orig.y; break;
            case Handle.SW: x = px;         w = right - px;    h = py - orig.y; break;
            case Handle.W:  x = px;         w = right - px;                     break;
        }

        // Shift constrains aspect ratio on corner handles only.
        if (shiftKey && Handles.isCorner(handle)) {
            if (orig.type === 'ellipse') {
                const size = Math.min(Math.abs(w), Math.abs(h));
                const sw = Math.sign(w || 1) * size;
                const sh = Math.sign(h || 1) * size;
                switch (handle) {
                    case Handle.NW: return { x: right - sw, y: bottom - sh, w: sw, h: sh };
                    case Handle.NE: return { x: orig.x,     y: bottom - sh, w: sw, h: sh };
                    case Handle.SE: return { x: orig.x,     y: orig.y,      w: sw, h: sh };
                    case Handle.SW: return { x: right - sw, y: orig.y,      w: sw, h: sh };
                }
            } else if (orig.w > 0 && orig.h > 0) {
                const scale = Math.min(Math.abs(w) / orig.w, Math.abs(h) / orig.h);
                const nw = Math.sign(w || 1) * scale * orig.w;
                const nh = Math.sign(h || 1) * scale * orig.h;
                switch (handle) {
                    case Handle.NW: return { x: right - nw, y: bottom - nh, w: nw, h: nh };
                    case Handle.NE: return { x: orig.x,     y: bottom - nh, w: nw, h: nh };
                    case Handle.SE: return { x: orig.x,     y: orig.y,      w: nw, h: nh };
                    case Handle.SW: return { x: right - nw, y: orig.y,      w: nw, h: nh };
                }
            }
        }

        return { x, y, w, h };
    }
}
