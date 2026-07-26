import type { Bounds, RectShape } from '../model/shapeTypes';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';
import { RoughDraw } from '../util/roughDraw';

export class RectangleShapeDef implements ShapeDefinition<RectShape> {
    public readonly capabilities = { stroke: true, fill: true, width: true, ends: false, edges: true, strokeStyle: true, fillStyle: true, sloppiness: true, label: true, textAlign: true, textVAlign: true };
    public readonly defaultTextOptions = { hAlign: 'center' as const, vAlign: 'middle' as const };
    public readonly resizable = true;
    public readonly rotatable = true;

    public getBounds(shape: RectShape): Bounds {
        return Geometry.normalizeRect(shape.x, shape.y, shape.w, shape.h);
    }

    public hitTest(shape: RectShape, px: number, py: number, tol: number): boolean {
        return Geometry.pointInBounds(px, py, this.getBounds(shape), tol);
    }

    public draw(ctx: CanvasRenderingContext2D, shape: RectShape): void {
        const b = this.getBounds(shape);
        const hasFill = !!shape.fill && shape.fill !== 'transparent';
        const radius = shape.edges === 'rounded' ? Math.min(b.w, b.h) * 0.18 : 0;
        const pathData = CanvasDraw.roundRectPathData(b.w, b.h, radius);
        const drawable = RoughDraw.box(shape.id, pathData, b.w, b.h, shape.sloppiness, shape.strokeWidth, hasFill, shape.fillStyle);
        ctx.save();
        ctx.translate(b.x, b.y);
        RoughDraw.paint(ctx, drawable, shape.stroke, shape.strokeWidth, shape.strokeStyle, hasFill ? shape.fill : undefined);
        ctx.restore();
    }
}
