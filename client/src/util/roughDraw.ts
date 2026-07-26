import { RoughGenerator } from 'roughjs/bin/generator';
import type { Drawable, Op, Options } from 'roughjs/bin/core';
import type { Color, FillStyle, Sloppiness, StrokeStyle } from '../model/shapeTypes';
import { CanvasDraw } from './canvasDraw';
import { HACHURE_ANGLE, HACHURE_GAP, SLOPPINESS } from './palette';

/** Maps the model's 3-value {@link FillStyle} to RoughJS's fill-style keyword. Adding one
 *  of Excalidraw's remaining styles (zigzag, dots, sunburst, ...) is a new row here plus
 *  a matching row in `FILL_STYLES` (palette.ts) — see plans/todo.md item 2. */
const ROUGH_FILL_STYLE: Record<FillStyle, string> = {
    solid: 'solid',
    hatch: 'hachure',
    crossHatch: 'cross-hatch',
};

/** One cached RoughJS geometry per shape id, invalidated whenever `key` (everything that
 *  affects the sketchy geometry) changes. Colors and dash pattern are applied at paint
 *  time and are deliberately excluded from `key` so recoloring a shape doesn't re-roll it. */
interface CacheEntry {
    key: string;
    drawable: Drawable;
}

/** Renders shapes with a RoughJS hand-drawn look. Geometry is generated in *local box
 *  space* (0, 0, w, h) and cached per shape id; the caller translates the canvas to the
 *  shape's bounds origin before painting, so dragging a shape never invalidates its
 *  cached squiggle. See docs/DESIGN.md's rendering section for the on-demand redraw this
 *  cache exists to make cheap. */
export class RoughDraw {
    private static readonly generator = new RoughGenerator();
    private static readonly cache = new Map<string, CacheEntry>();

    /** Deterministic seed derived from a shape's id, so the same shape always sketches
     *  the same way — across reloads, peers, and frames — without persisting a seed
     *  field (and thus without a migration for shapes that predate this feature). */
    public static seedFor(id: string): number {
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = (hash * 31 + id.charCodeAt(i)) | 0;
        }
        return (hash >>> 0) || 1;
    }

    /** Geometry for a box outline (rectangle or diamond), sharp or rounded. `pathData`
     *  is one of {@link CanvasDraw.roundRectPathData} / {@link CanvasDraw.diamondPathData}. */
    public static box(
        shapeId: string,
        pathData: string,
        w: number,
        h: number,
        sloppiness: Sloppiness | undefined,
        strokeWidth: number,
        hasFill: boolean,
        fillStyle: FillStyle | undefined,
    ): Drawable {
        const key = `box|${pathData}|${w}|${h}|${sloppiness ?? 'plain'}|${strokeWidth}|${hasFill}|${fillStyle ?? 'solid'}`;
        return RoughDraw.getOrCreate(shapeId, key, () =>
            RoughDraw.generator.path(pathData, RoughDraw.optionsFor(shapeId, sloppiness, strokeWidth, hasFill, fillStyle)));
    }

    /** Geometry for an ellipse inscribed in (0, 0, w, h). */
    public static ellipse(
        shapeId: string,
        w: number,
        h: number,
        sloppiness: Sloppiness | undefined,
        strokeWidth: number,
        hasFill: boolean,
        fillStyle: FillStyle | undefined,
    ): Drawable {
        const key = `ellipse|${w}|${h}|${sloppiness ?? 'plain'}|${strokeWidth}|${hasFill}|${fillStyle ?? 'solid'}`;
        return RoughDraw.getOrCreate(shapeId, key, () =>
            RoughDraw.generator.ellipse(w / 2, h / 2, w, h, RoughDraw.optionsFor(shapeId, sloppiness, strokeWidth, hasFill, fillStyle)));
    }

    /** Geometry for a straight shaft from (0, 0) to (dx, dy) — the line/arrow body.
     *  Endpoint caps are drawn separately by {@link CanvasDraw.drawCap}, exact as today. */
    public static line(
        shapeId: string,
        dx: number,
        dy: number,
        sloppiness: Sloppiness | undefined,
        strokeWidth: number,
    ): Drawable {
        const key = `line|${dx}|${dy}|${sloppiness ?? 'plain'}|${strokeWidth}`;
        return RoughDraw.getOrCreate(shapeId, key, () =>
            RoughDraw.generator.line(0, 0, dx, dy, RoughDraw.optionsFor(shapeId, sloppiness, strokeWidth, false, undefined)));
    }

    /** Paint a cached drawable's op sets onto `ctx`, which must already be translated to
     *  the shape's local origin. `fillColor` is omitted for shapes that never fill (lines). */
    public static paint(
        ctx: CanvasRenderingContext2D,
        drawable: Drawable,
        strokeColor: Color,
        strokeWidth: number,
        strokeStyle: StrokeStyle | undefined,
        fillColor?: Color,
    ): void {
        const dash = CanvasDraw.dashPattern(strokeStyle ?? 'solid', strokeWidth);
        for (const set of drawable.sets) {
            switch (set.type) {
                case 'path':
                    // A zero (or negative) width means "no visible stroke" — matching the
                    // strict Canvas2D spec, which *ignores* a 0 lineWidth rather than
                    // hiding the line, so skip the draw call rather than set it.
                    if (strokeWidth <= 0) break;
                    ctx.strokeStyle = strokeColor;
                    ctx.lineWidth = strokeWidth;
                    ctx.setLineDash(dash);
                    RoughDraw.traceOps(ctx, set.ops);
                    ctx.stroke();
                    break;
                case 'fillPath':
                    if (!fillColor) break;
                    ctx.fillStyle = fillColor;
                    RoughDraw.traceOps(ctx, set.ops);
                    // Matches RoughJS's own canvas renderer: an ellipse's solid fill is two
                    // overlapping closed curves (the sketchy double-stroke); 'evenodd' would
                    // cancel out their shared interior and leave only a thin sliver filled.
                    ctx.fill(drawable.shape === 'curve' || drawable.shape === 'polygon' || drawable.shape === 'path' ? 'evenodd' : 'nonzero');
                    break;
                case 'fillSketch':
                    if (!fillColor) break;
                    ctx.strokeStyle = fillColor;
                    ctx.lineWidth = drawable.options.fillWeight;
                    ctx.setLineDash([]);
                    RoughDraw.traceOps(ctx, set.ops);
                    ctx.stroke();
                    break;
            }
        }
    }

    private static getOrCreate(shapeId: string, key: string, build: () => Drawable): Drawable {
        const cached = RoughDraw.cache.get(shapeId);
        if (cached && cached.key === key) return cached.drawable;
        // Bounded by live shape count, not frame count — a stale entry is only ever
        // replaced, never accumulated, so this only fires if the board is huge.
        if (RoughDraw.cache.size > 5000) RoughDraw.cache.clear();
        const drawable = build();
        RoughDraw.cache.set(shapeId, { key, drawable });
        return drawable;
    }

    private static optionsFor(
        shapeId: string,
        sloppiness: Sloppiness | undefined,
        strokeWidth: number,
        hasFill: boolean,
        fillStyle: FillStyle | undefined,
    ): Options {
        const level = SLOPPINESS.find((s) => s.value === (sloppiness ?? 'plain')) ?? SLOPPINESS[0];
        const options: Options = {
            seed: RoughDraw.seedFor(shapeId),
            roughness: level.roughness,
            bowing: level.bowing,
            strokeWidth,
        };
        // At roughness 0 the two default passes land exactly on top of each other,
        // which visibly double-darkens a shape drawn with opacity < 1.
        if (level.roughness === 0) {
            options.disableMultiStroke = true;
            options.disableMultiStrokeFill = true;
        }
        if (hasFill) {
            // The actual color is applied at paint time (RoughDraw.paint takes its own
            // fillColor param); this placeholder only tells the generator a fill opset
            // (fillPath/fillSketch) is wanted at all.
            options.fill = '#000';
            options.fillStyle = ROUGH_FILL_STYLE[fillStyle ?? 'solid'];
            options.hachureGap = HACHURE_GAP;
            options.hachureAngle = HACHURE_ANGLE;
            options.fillWeight = Math.max(1, strokeWidth / 2);
        }
        return options;
    }

    private static traceOps(ctx: CanvasRenderingContext2D, ops: readonly Op[]): void {
        ctx.beginPath();
        for (const { op, data } of ops) {
            switch (op) {
                case 'move':
                    ctx.moveTo(data[0], data[1]);
                    break;
                case 'lineTo':
                    ctx.lineTo(data[0], data[1]);
                    break;
                case 'bcurveTo':
                    ctx.bezierCurveTo(data[0], data[1], data[2], data[3], data[4], data[5]);
                    break;
            }
        }
    }
}
