import type { Bounds, DiamondShape } from '../model/shapeTypes';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { CanvasDraw } from '../util/canvasDraw';
import { RoughDraw } from '../util/roughDraw';

export class DiamondShapeDef implements ShapeDefinition<DiamondShape> {
    public readonly capabilities = { stroke: true, fill: true, width: true, ends: false, edges: true, strokeStyle: true, fillStyle: true, sloppiness: true, label: true, textAlign: true, textVAlign: true };
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
        const b = this.getBounds(shape);
        const hasFill = !!shape.fill && shape.fill !== 'transparent';
        const r = shape.edges === 'rounded' ? Math.min(b.w, b.h) * 0.18 : 0;
        const pathData = CanvasDraw.diamondPathData(b.w, b.h, r);
        const drawable = RoughDraw.box(shape.id, pathData, b.w, b.h, shape.sloppiness, shape.strokeWidth, hasFill, shape.fillStyle);
        ctx.save();
        ctx.translate(b.x, b.y);
        RoughDraw.paint(ctx, drawable, shape.stroke, shape.strokeWidth, shape.strokeStyle, hasFill ? shape.fill : undefined);
        ctx.restore();
    }
}
