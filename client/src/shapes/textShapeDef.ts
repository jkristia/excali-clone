import type { Bounds, TextShape } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';
import { FontUtil } from '../util/fontUtil';

/** Line-height for text shapes. Shared with the inline <textarea> editor and
 *  measureText so the canvas and the DOM editor lay text out identically. */
export const TEXT_LINE_HEIGHT = 1.25;

export class TextShapeDef implements ShapeDefinition<TextShape> {
    public readonly capabilities = { stroke: true, fill: false, width: false, ends: false, text: true };
    // Text resizes width only: dragging a side handle sets a fixed wrap width and the
    // height auto-follows the wrapped line count (see the 'x' resizeAxis handling).
    public readonly resizable = true;
    public readonly resizeAxis = 'x' as const;
    public readonly rotatable = true;

    /** Height a wrapped text shape needs to fit `text` word-wrapped to `width` at `fontSize`.
     *  `measureCtx` must already have the text font applied. Mirrors {@link NoteShapeDef.measureHeight}. */
    public static measureWrapHeight(measureCtx: CanvasRenderingContext2D, text: string, fontSize: number, width: number): number {
        const lines = CanvasDraw.wrapLines(measureCtx, text, width);
        return Math.max(fontSize * TEXT_LINE_HEIGHT, lines.length * fontSize * TEXT_LINE_HEIGHT);
    }

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
        ctx.font = FontUtil.cssFont(shape.fontSize, shape.fontFamily);
        ctx.textBaseline = 'alphabetic';
        // Anchor each line horizontally within the measured box (shape.w) so shorter
        // lines align the same way the inline <textarea>'s text-align does.
        const align = shape.textAlign ?? 'left';
        ctx.textAlign = align;
        const anchorX = align === 'center' ? shape.x + shape.w / 2 : align === 'right' ? shape.x + shape.w : shape.x;
        // Match the DOM <textarea> box model so text does not jump between the
        // rendered canvas and the inline editor. shape.y is the line-box top (the
        // textarea's top edge); place each line's alphabetic baseline exactly where
        // CSS line-height would, derived from the font's own ascent/descent.
        const lineBox = shape.fontSize * TEXT_LINE_HEIGHT;
        const m = ctx.measureText('Mg');
        const baseline = lineBox / 2 + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2;
        // Fixed-width text word-wraps to shape.w; auto-width text breaks only on newlines.
        const lines = shape.wrap ? CanvasDraw.wrapLines(ctx, shape.text, shape.w) : shape.text.split('\n');
        lines.forEach((line, i) => {
            ctx.fillText(line, anchorX, shape.y + i * lineBox + baseline);
        });
    }
}
