import type { Bounds, DrawShape } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';

export class DrawShapeDef implements ShapeDefinition<DrawShape> {
    public readonly capabilities = { stroke: true, fill: false, width: true, ends: false, note: false };

    public getBounds(shape: DrawShape): Bounds {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const pts = shape.points;
        for (let i = 0; i < pts.length; i += 2) {
            const px = shape.x + pts[i];
            const py = shape.y + pts[i + 1];
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
        }
        if (!isFinite(minX)) return { x: shape.x, y: shape.y, w: 0, h: 0 };
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    public hitTest(shape: DrawShape, px: number, py: number, tol: number): boolean {
        const pts = shape.points;
        for (let i = 0; i < pts.length - 2; i += 2) {
            const x1 = shape.x + pts[i];
            const y1 = shape.y + pts[i + 1];
            const x2 = shape.x + pts[i + 2];
            const y2 = shape.y + pts[i + 3];
            if (Geometry.distToSegment(px, py, x1, y1, x2, y2) <= tol + shape.strokeWidth) return true;
        }
        return false;
    }

    public draw(ctx: CanvasRenderingContext2D, shape: DrawShape): void {
        CanvasDraw.applyStroke(ctx, shape.stroke, shape.strokeWidth);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        const pts = shape.points;
        if (pts.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(shape.x + pts[0], shape.y + pts[1]);
            for (let i = 2; i < pts.length; i += 2) {
                ctx.lineTo(shape.x + pts[i], shape.y + pts[i + 1]);
            }
            ctx.stroke();
        }
    }
}
