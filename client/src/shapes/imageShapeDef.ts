import type { Bounds, ImageShape } from '../model/shapeTypes';
import type { ShapeDefinition } from './shapeDefinition';
import { Geometry } from '../util/geometry';
import { ImageCache } from '../util/imageCache';

/** Longest side (world px) a freshly pasted image is scaled to, so a full-resolution
 *  screenshot doesn't dwarf the canvas on first paste. */
export const IMAGE_MAX_INITIAL_DIM = 400;

export class ImageShapeDef implements ShapeDefinition<ImageShape> {
    public readonly capabilities = { stroke: false, fill: false, width: false, ends: false, label: true, textAlign: true, textVAlign: true };
    public readonly defaultTextOptions = { hAlign: 'center' as const, vAlign: 'middle' as const };
    public readonly resizable = true;
    public readonly rotatable = true;

    constructor(private readonly imageCache: ImageCache) { }

    /** `w`/`h` for a freshly pasted image: `naturalW`/`naturalH` scaled so the longer
     *  side is at most {@link IMAGE_MAX_INITIAL_DIM}, aspect ratio preserved. An image
     *  already smaller than that is inserted at its natural size. */
    public static initialSize(naturalW: number, naturalH: number): { w: number; h: number } {
        const scale = Math.min(1, IMAGE_MAX_INITIAL_DIM / Math.max(naturalW, naturalH));
        return { w: naturalW * scale, h: naturalH * scale };
    }

    public getBounds(shape: ImageShape): Bounds {
        return Geometry.normalizeRect(shape.x, shape.y, shape.w, shape.h);
    }

    public hitTest(shape: ImageShape, px: number, py: number, tol: number): boolean {
        return Geometry.pointInBounds(px, py, this.getBounds(shape), tol);
    }

    public draw(ctx: CanvasRenderingContext2D, shape: ImageShape): void {
        const b = this.getBounds(shape);
        const img = this.imageCache.get(shape.src);
        if (img) {
            ctx.drawImage(img, b.x, b.y, b.w, b.h);
            return;
        }
        this.drawPlaceholder(ctx, b);
    }

    /** Shown while the image is decoding (or failed to decode) — keeps the shape's
     *  bounds visible instead of blank space. */
    private drawPlaceholder(ctx: CanvasRenderingContext2D, b: Bounds): void {
        ctx.save();
        ctx.fillStyle = '#f1f3f5';
        ctx.strokeStyle = '#ced4da';
        ctx.lineWidth = 1;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.restore();
    }
}
