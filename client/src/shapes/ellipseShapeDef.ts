import type { Bounds, EllipseShape } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';

export class EllipseShapeDef implements ShapeDefinition<EllipseShape> {
    public readonly capabilities = { stroke: true, fill: true, width: true, ends: false, strokeStyle: true };
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
        CanvasDraw.applyStroke(ctx, shape.stroke, shape.strokeWidth, shape.strokeStyle);
        const b = this.getBounds(shape);
        ctx.beginPath();
        ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
        if (shape.fill && shape.fill !== 'transparent') {
            ctx.fillStyle = shape.fill;
            ctx.fill();
        }
        if (shape.strokeWidth > 0) ctx.stroke();
    }
}
