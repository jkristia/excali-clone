import type { ArrowShape, Bounds } from '../model/shapeTypes';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';
import { RoughDraw } from '../util/roughDraw';

/** Covers both arrows and lines — a line is an arrow with both caps 'none'. */
export class ArrowShapeDef implements ShapeDefinition<ArrowShape> {
    public readonly capabilities = { stroke: true, fill: false, width: true, ends: true, strokeStyle: true, sloppiness: true, label: true };
    public readonly resizable = false;
    public readonly rotatable = false;

    public getBounds(shape: ArrowShape): Bounds {
        return Geometry.normalizeRect(shape.x, shape.y, shape.dx, shape.dy);
    }

    public hitTest(shape: ArrowShape, px: number, py: number, tol: number): boolean {
        return (
            Geometry.distToSegment(px, py, shape.x, shape.y, shape.x + shape.dx, shape.y + shape.dy) <=
            tol + shape.strokeWidth
        );
    }

    public draw(ctx: CanvasRenderingContext2D, shape: ArrowShape): void {
        const drawable = RoughDraw.line(shape.id, shape.dx, shape.dy, shape.sloppiness, shape.strokeWidth);
        ctx.save();
        ctx.translate(shape.x, shape.y);
        ctx.lineCap = 'round';
        RoughDraw.paint(ctx, drawable, shape.stroke, shape.strokeWidth, shape.strokeStyle);
        ctx.restore();

        // Caps are exact — drawn at the precise endpoints/angle regardless of the shaft's
        // sketchy jitter or dash pattern. Old persisted arrows predate caps: default to a
        // plain start + arrowhead end.
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
        const angle = Math.atan2(shape.dy, shape.dx);
        CanvasDraw.drawCap(ctx, shape.endCap ?? 'arrow', shape.x + shape.dx, shape.y + shape.dy, angle, shape.strokeWidth);
        CanvasDraw.drawCap(ctx, shape.startCap ?? 'none', shape.x, shape.y, angle + Math.PI, shape.strokeWidth);
    }
}
