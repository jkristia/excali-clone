import { describe, expect, it } from 'vitest';
import { ResizeMath, type ResizeOrigin } from './resizeMath';
import { Handle } from './handles';

const rectOrig: ResizeOrigin = { x: 0, y: 0, w: 100, h: 50, type: 'rectangle' };

describe('ResizeMath.compute (Phase 1 baseline)', () => {
    it('NW (top-left): moves x/y, recomputes w/h from the opposite corner', () => {
        expect(ResizeMath.compute(rectOrig, Handle.NW, -10, -10, false)).toEqual({ x: -10, y: -10, w: 110, h: 60 });
    });

    it('N (top-mid): only y/h change', () => {
        expect(ResizeMath.compute(rectOrig, Handle.N, 999, -10, false)).toEqual({ x: 0, y: -10, w: 100, h: 60 });
    });

    it('NE (top-right): y/w/h change, x fixed', () => {
        expect(ResizeMath.compute(rectOrig, Handle.NE, 120, -10, false)).toEqual({ x: 0, y: -10, w: 120, h: 60 });
    });

    it('E (right-mid): only w changes', () => {
        expect(ResizeMath.compute(rectOrig, Handle.E, 130, 999, false)).toEqual({ x: 0, y: 0, w: 130, h: 50 });
    });

    it('SE (bottom-right): only w/h change, x/y fixed', () => {
        expect(ResizeMath.compute(rectOrig, Handle.SE, 130, 70, false)).toEqual({ x: 0, y: 0, w: 130, h: 70 });
    });

    it('S (bottom-mid): only h changes', () => {
        expect(ResizeMath.compute(rectOrig, Handle.S, 999, 70, false)).toEqual({ x: 0, y: 0, w: 100, h: 70 });
    });

    it('SW (bottom-left): x/w/h change, y fixed', () => {
        expect(ResizeMath.compute(rectOrig, Handle.SW, -10, 70, false)).toEqual({ x: -10, y: 0, w: 110, h: 70 });
    });

    it('W (left-mid): only w changes, x fixed', () => {
        expect(ResizeMath.compute(rectOrig, Handle.W, -10, 999, false)).toEqual({ x: -10, y: 0, w: 110, h: 50 });
    });

    it('shift+corner on a rectangle: uniform scale preserving aspect ratio', () => {
        // Dragging SE (bottom-right) to (200, 70) unshifted gives w=200,h=70;
        // shift clamps to the smaller of the two scale factors (70/50=1.4 < 200/100=2).
        const result = ResizeMath.compute(rectOrig, Handle.SE, 200, 70, true);
        expect(result).toEqual({ x: 0, y: 0, w: 140, h: 70 });
    });

    it('shift+corner on an ellipse: forces w===h (square bounding box)', () => {
        const ellipseOrig: ResizeOrigin = { x: 0, y: 0, w: 100, h: 50, type: 'ellipse' };
        const result = ResizeMath.compute(ellipseOrig, Handle.SE, 200, 70, true);
        expect(result.w).toBe(result.h);
    });

    it('shift on an edge handle (N/E/S/W): has no effect, same as unshifted', () => {
        const unshifted = ResizeMath.compute(rectOrig, Handle.E, 130, 999, false);
        const shifted = ResizeMath.compute(rectOrig, Handle.E, 130, 999, true);
        expect(shifted).toEqual(unshifted);
    });
});
