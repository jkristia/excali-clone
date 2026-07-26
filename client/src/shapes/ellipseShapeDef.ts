import type { Bounds, EllipseShape } from '../model/shapeTypes';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { RoughDraw } from '../util/roughDraw';

export class EllipseShapeDef implements ShapeDefinition<EllipseShape> {
    public readonly capabilities = { stroke: true, fill: true, width: true, ends: false, strokeStyle: true, fillStyle: true, sloppiness: true, label: true, textAlign: true, textVAlign: true };
    public readonly defaultTextOptions = { hAlign: 'center' as const, vAlign: 'middle' as const };
    public readonly resizable = true;
    public readonly rotatable = true;

    public getBounds(shape: EllipseShape): Bounds {
        return Geometry.normalizeRect(shape.x, shape.y, shape.w, shape.h);
    }

    public hitTest(shape: EllipseShape, px: number, py: number): boolean {
        const b = this.getBounds(shape);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const rx = b.w / 2 || 1;
        const ry = b.h / 2 || 1;
        const nx = (px - cx) / rx;
        const ny = (py - cy) / ry;
        return nx * nx + ny * ny <= 1.15;
    }

    public draw(ctx: CanvasRenderingContext2D, shape: EllipseShape): void {
        const b = this.getBounds(shape);
        const hasFill = !!shape.fill && shape.fill !== 'transparent';
        const drawable = RoughDraw.ellipse(shape.id, b.w, b.h, shape.sloppiness, shape.strokeWidth, hasFill, shape.fillStyle);
        ctx.save();
        ctx.translate(b.x, b.y);
        RoughDraw.paint(ctx, drawable, shape.stroke, shape.strokeWidth, shape.strokeStyle, hasFill ? shape.fill : undefined);
        ctx.restore();
    }
}
