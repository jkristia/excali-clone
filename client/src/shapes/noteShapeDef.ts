import type { Bounds, NoteShape } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';

export class NoteShapeDef implements ShapeDefinition<NoteShape> {
    public readonly capabilities = { stroke: false, fill: false, width: false, ends: false, note: true, text: true };
    public readonly resizable = false;

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
        const fs = shape.fontSize ?? 16;
        ctx.font = `${fs}px Inter, system-ui, sans-serif`;
        CanvasDraw.wrapText(ctx, shape.text, shape.x + 12, shape.y + 12, shape.w - 24, fs * 1.3, shape.textAlign ?? 'left');
    }
}
