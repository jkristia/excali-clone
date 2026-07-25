import type { Bounds, DiamondShape } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';

export class DiamondShapeDef implements ShapeDefinition<DiamondShape> {
    public readonly capabilities = { stroke: true, fill: true, width: true, ends: false, edges: true, strokeStyle: true, fillStyle: true, label: true, textAlign: true, textVAlign: true };
    public readonly defaultTextOptions = { hAlign: 'center' as const, vAlign: 'middle' as const };
    public readonly resizable = true;
    public readonly rotatable = true;

    public getBounds(shape: DiamondShape): Bounds {
        return Geometry.normalizeRect(shape.x, shape.y, shape.w, shape.h);
    }

    public hitTest(shape: DiamondShape, px: number, py: number): boolean {
        const b = this.getBounds(shape);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const rx = b.w / 2 || 1;
        const ry = b.h / 2 || 1;
        // Point-in-rhombus is the L1 (diamond) norm; small slack mirrors the ellipse's.
        return Math.abs(px - cx) / rx + Math.abs(py - cy) / ry <= 1.1;
    }

    public draw(ctx: CanvasRenderingContext2D, shape: DiamondShape): void {
        CanvasDraw.applyStroke(ctx, shape.stroke, shape.strokeWidth, shape.strokeStyle);
        const b = this.getBounds(shape);
        const r = shape.edges === 'rounded' ? Math.min(b.w, b.h) * 0.18 : 0;
        CanvasDraw.diamondPath(ctx, b.x, b.y, b.w, b.h, r);
        if (shape.fill && shape.fill !== 'transparent') {
            ctx.fillStyle = CanvasDraw.fillFor(ctx, shape.fillStyle ?? 'solid', shape.fill);
            ctx.fill();
        }
        if (shape.strokeWidth > 0) ctx.stroke();
    }
}
