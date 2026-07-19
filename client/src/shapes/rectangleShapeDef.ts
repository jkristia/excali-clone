import type { Bounds, RectShape } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';

export class RectangleShapeDef implements ShapeDefinition<RectShape> {
    public readonly capabilities = { stroke: true, fill: true, width: true, ends: false };
    public readonly resizable = true;

    public getBounds(shape: RectShape): Bounds {
        return Geometry.normalizeRect(shape.x, shape.y, shape.w, shape.h);
    }

    public hitTest(shape: RectShape, px: number, py: number, tol: number): boolean {
        return Geometry.pointInBounds(px, py, this.getBounds(shape), tol);
    }

    public draw(ctx: CanvasRenderingContext2D, shape: RectShape): void {
        CanvasDraw.applyStroke(ctx, shape.stroke, shape.strokeWidth);
        if (shape.fill && shape.fill !== 'transparent') {
            ctx.fillStyle = shape.fill;
            ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
        }
        if (shape.strokeWidth > 0) ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
    }
}
