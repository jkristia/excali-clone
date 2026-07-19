import type { Bounds, TextShape } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';

/** Line-height for text shapes. Shared with the inline <textarea> editor and
 *  measureText so the canvas and the DOM editor lay text out identically. */
export const TEXT_LINE_HEIGHT = 1.25;

export class TextShapeDef implements ShapeDefinition<TextShape> {
    public readonly capabilities = { stroke: true, fill: false, width: false, ends: false, note: false };

    public getBounds(shape: TextShape): Bounds {
        // shape.y is the line-box top and h spans full 1.25 line boxes, so the box
        // already brackets the text the same way the inline editor does.
        return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    }

    public hitTest(shape: TextShape, px: number, py: number, tol: number): boolean {
        return Geometry.pointInBounds(px, py, this.getBounds(shape), tol);
    }

    public draw(ctx: CanvasRenderingContext2D, shape: TextShape): void {
        ctx.fillStyle = shape.color;
        ctx.font = `${shape.fontSize}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = 'alphabetic';
        // Match the DOM <textarea> box model so text does not jump between the
        // rendered canvas and the inline editor. shape.y is the line-box top (the
        // textarea's top edge); place each line's alphabetic baseline exactly where
        // CSS line-height would, derived from the font's own ascent/descent.
        const lineBox = shape.fontSize * TEXT_LINE_HEIGHT;
        const m = ctx.measureText('Mg');
        const baseline = lineBox / 2 + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
        shape.text.split('\n').forEach((line, i) => {
            ctx.fillText(line, shape.x, shape.y + i * lineBox + baseline);
        });
    }
}
