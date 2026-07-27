import type { ArrowShape, Bounds } from '../model/shapeTypes';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';
import { RoughDraw } from '../util/roughDraw';
import { SplineMath } from '../util/splineMath';

/** Covers both arrows and lines — a line is an arrow with both caps 'none'. A 2-anchor
 *  arrow draws as a straight (bowed) RoughJS line for the sketchy look; 3+ anchors draw
 *  as the clamped Catmull-Rom spline described in util/splineMath.ts. */
export class ArrowShapeDef implements ShapeDefinition<ArrowShape> {
    public readonly capabilities = { stroke: true, fill: false, width: true, ends: true, strokeStyle: true, sloppiness: true, label: true };
    public readonly resizable = false;
    public readonly rotatable = false;

    public getBounds(shape: ArrowShape): Bounds {
        const b = SplineMath.bounds(shape.points);
        return { x: shape.x + b.x, y: shape.y + b.y, w: b.w, h: b.h };
    }

    public hitTest(shape: ArrowShape, px: number, py: number, tol: number): boolean {
        const pad = tol + shape.strokeWidth;
        if (!Geometry.pointInBounds(px, py, this.getBounds(shape), pad)) return false;
        const pts = SplineMath.sample(shape.points);
        for (let i = 0; i + 3 < pts.length; i += 2) {
            const x1 = shape.x + pts[i], y1 = shape.y + pts[i + 1];
            const x2 = shape.x + pts[i + 2], y2 = shape.y + pts[i + 3];
            if (Geometry.distToSegment(px, py, x1, y1, x2, y2) <= pad) return true;
        }
        return false;
    }

    public draw(ctx: CanvasRenderingContext2D, shape: ArrowShape): void {
        const n = SplineMath.anchorCount(shape.points);
        if (n < 2) return;
        const pts = shape.points;
        const drawable = n <= 2
            ? RoughDraw.line(shape.id, pts[0], pts[1], pts[2], pts[3], shape.sloppiness, shape.strokeWidth)
            : RoughDraw.spline(shape.id, pts, shape.sloppiness, shape.strokeWidth);
        ctx.save();
        ctx.translate(shape.x, shape.y);
        ctx.lineCap = 'round';
        RoughDraw.paint(ctx, drawable, shape.stroke, shape.strokeWidth, shape.strokeStyle);
        ctx.restore();

        // Caps are exact — drawn at the precise endpoints/tangent regardless of the
        // shaft's sketchy jitter or dash pattern. Old persisted arrows predate caps:
        // default to a plain start + arrowhead end.
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
        const last = shape.points.length;
        CanvasDraw.drawCap(ctx, shape.endCap ?? 'arrow',
            shape.x + shape.points[last - 2], shape.y + shape.points[last - 1],
            SplineMath.endAngle(shape.points), shape.strokeWidth);
        CanvasDraw.drawCap(ctx, shape.startCap ?? 'none',
            shape.x + shape.points[0], shape.y + shape.points[1],
            SplineMath.startAngle(shape.points) + Math.PI, shape.strokeWidth);
    }
}
