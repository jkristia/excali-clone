import type { ArrowShape, Bounds } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';

/** Covers both arrows and lines — a line is an arrow with both caps 'none'. */
export class ArrowShapeDef implements ShapeDefinition<ArrowShape> {
    public readonly capabilities = { stroke: true, fill: false, width: true, ends: true, strokeStyle: true };
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
        CanvasDraw.applyStroke(ctx, shape.stroke, shape.strokeWidth, shape.strokeStyle);
        // Old persisted arrows predate caps: default to a plain start + arrowhead end.
        CanvasDraw.drawArrow(
            ctx,
            shape.x, shape.y,
            shape.x + shape.dx, shape.y + shape.dy,
            shape.strokeWidth,
            shape.startCap ?? 'none',
            shape.endCap ?? 'arrow',
        );
    }
}
