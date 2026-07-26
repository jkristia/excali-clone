import type { Bounds, NoteShape, VerticalAlign } from '../model/shapeTypes';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';
import { TextOptionsUtil } from '../util/textOptions';

/** Note text layout, shared by rendering ({@link NoteShapeDef.draw}) and auto-sizing. */
export const NOTE_PADDING = 12;
export const NOTE_LINE_HEIGHT = 1.3;
export const NOTE_MIN_HEIGHT = 120;

export class NoteShapeDef implements ShapeDefinition<NoteShape> {
    public readonly capabilities = { stroke: false, fill: false, width: false, ends: false, note: true, text: true, textAlign: true, textVAlign: true };
    public readonly defaultTextOptions = { hAlign: 'left' as const, vAlign: 'middle' as const };
    public readonly resizable = false;
    public readonly rotatable = true;

    /** Height a note needs to fit its wrapped text at `fontSize` within its fixed `width`,
     *  floored at {@link NOTE_MIN_HEIGHT}. `measureCtx` must have the note font applied. */
    public static measureHeight(
        measureCtx: CanvasRenderingContext2D,
        text: string,
        fontSize: number,
        width: number,
    ): number {
        const lines = CanvasDraw.wrapLines(measureCtx, text, width - NOTE_PADDING * 2);
        return Math.max(NOTE_MIN_HEIGHT, NOTE_PADDING * 2 + lines.length * fontSize * NOTE_LINE_HEIGHT);
    }

    /** Distance from a note's top edge to the first line of text, placed per `vAlign` within
     *  `height` (floored/ceilinged at {@link NOTE_PADDING} so it never rides an edge). Shared
     *  by rendering and the editor's padding so the two line up. */
    public static textOffsetY(
        measureCtx: CanvasRenderingContext2D,
        text: string,
        fontSize: number,
        width: number,
        height: number,
        vAlign: VerticalAlign = 'middle',
    ): number {
        const lines = CanvasDraw.wrapLines(measureCtx, text, width - NOTE_PADDING * 2);
        const textHeight = lines.length * fontSize * NOTE_LINE_HEIGHT;
        if (vAlign === 'top') return NOTE_PADDING;
        if (vAlign === 'bottom') return Math.max(NOTE_PADDING, height - NOTE_PADDING - textHeight);
        return Math.max(NOTE_PADDING, (height - textHeight) / 2);
    }

    public getBounds(shape: NoteShape): Bounds {
        return Geometry.normalizeRect(shape.x, shape.y, shape.w, shape.h);
    }

    public hitTest(shape: NoteShape, px: number, py: number, tol: number): boolean {
        return Geometry.pointInBounds(px, py, this.getBounds(shape), tol);
    }

    public draw(ctx: CanvasRenderingContext2D, shape: NoteShape): void {
        // Sticky note: soft shadow + rounded background + wrapped text.
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.18)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = shape.fill;
        CanvasDraw.roundRect(ctx, shape.x, shape.y, shape.w, shape.h, 6);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#1e1e1e';
        ctx.textBaseline = 'top';
        const resolved = TextOptionsUtil.resolve(shape.textOptions, this.defaultTextOptions);
        ctx.font = TextOptionsUtil.cssFont(resolved);
        const top = shape.y + NoteShapeDef.textOffsetY(ctx, shape.text, resolved.fontSize, shape.w, shape.h, resolved.vAlign);
        CanvasDraw.wrapText(
            ctx, shape.text,
            shape.x + NOTE_PADDING, top, shape.w - NOTE_PADDING * 2,
            resolved.fontSize * NOTE_LINE_HEIGHT, resolved.hAlign,
        );
    }
}
