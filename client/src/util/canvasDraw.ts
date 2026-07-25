import type { Bounds, Color, EndpointCap, FillStyle, StrokeStyle, TextAlign, VerticalAlign } from '../model/types';
import { FontUtil } from './fontUtil';
import type { ResolvedTextOptions } from './textOptions';

/** Small reusable canvas-2D drawing primitives shared by multiple shape definitions. */
export class CanvasDraw {
    private static readonly HATCH_TILE = 8;
    /** Line spacing for wrapped shape captions, and the pill padding for the arrow/draw
     *  caption background. Shared so canvas rendering and the editor overlay agree. */
    public static readonly LABEL_LINE_HEIGHT = 1.3;
    /** Inset from the box edge for a left/right/top/bottom-aligned caption, so the text
     *  doesn't sit flush against the border. Shared with the editor overlay so they agree. */
    public static readonly LABEL_PADDING = 4;
    private static readonly LABEL_PILL_PADDING = 4;
    /** Cache of hatch/cross-hatch tiles keyed by `style|color`, so a pattern is built
     *  once per distinct look and reused across shapes and frames. */
    private static readonly hatchTiles = new Map<string, HTMLCanvasElement>();

    /** Resolve a fill for the given style: the color itself for 'solid', or a tiled
     *  hatch/cross-hatch {@link CanvasPattern} drawn in `color`. The pattern is anchored
     *  to the current (world) transform origin — it stays fixed to the page and slides
     *  under a shape as it moves, like Excalidraw. */
    public static fillFor(
        ctx: CanvasRenderingContext2D,
        style: FillStyle,
        color: Color,
    ): Color | CanvasPattern {
        if (style === 'solid') return color;
        const tile = CanvasDraw.hatchTile(style, color);
        return ctx.createPattern(tile, 'repeat') ?? color;
    }

    private static hatchTile(style: FillStyle, color: Color): HTMLCanvasElement {
        const key = `${style}|${color}`;
        const cached = CanvasDraw.hatchTiles.get(key);
        if (cached) return cached;

        const size = CanvasDraw.HATCH_TILE;
        const tile = document.createElement('canvas');
        tile.width = size;
        tile.height = size;
        const tctx = tile.getContext('2d');
        if (tctx) {
            tctx.strokeStyle = color;
            tctx.lineWidth = 1;
            // A diagonal line from bottom-left to top-right; tiling 'repeat' turns it into
            // continuous +45° hatching. Cross-hatch overlays the mirrored −45° line.
            tctx.beginPath();
            tctx.moveTo(0, size);
            tctx.lineTo(size, 0);
            if (style === 'crossHatch') {
                tctx.moveTo(0, 0);
                tctx.lineTo(size, size);
            }
            tctx.stroke();
        }
        CanvasDraw.hatchTiles.set(key, tile);
        return tile;
    }

    public static applyStroke(
        ctx: CanvasRenderingContext2D,
        color: Color,
        width: number,
        style: StrokeStyle = 'solid',
    ) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        // Every stroked shape calls this first, so resetting to [] on 'solid' also keeps
        // a dash pattern from one shape leaking into the next.
        ctx.setLineDash(CanvasDraw.dashPattern(style, width));
    }

    /** Dash array for a stroke style, scaled by width so it stays proportional. */
    private static dashPattern(style: StrokeStyle, width: number): number[] {
        switch (style) {
            case 'dashed':
                return [width * 4, width * 2];
            case 'dotted':
                return [width, width * 2];
            default:
                return [];
        }
    }

    public static drawArrow(
        ctx: CanvasRenderingContext2D,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        width: number,
        startCap: EndpointCap,
        endCap: EndpointCap,
    ) {
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // The connecting line may be dashed/dotted, but the arrowheads must stay solid.
        ctx.setLineDash([]);

        // Cap angle points *outward* from the line at each end.
        const angle = Math.atan2(y2 - y1, x2 - x1);
        CanvasDraw.drawCap(ctx, endCap, x2, y2, angle, width);
        CanvasDraw.drawCap(ctx, startCap, x1, y1, angle + Math.PI, width);
    }

    public static drawCap(
        ctx: CanvasRenderingContext2D,
        cap: EndpointCap,
        x: number,
        y: number,
        angle: number,
        width: number,
    ) {
        if (cap === 'none') return;
        if (cap === 'arrow') {
            const head = Math.max(10, width * 4);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - head * Math.cos(angle - Math.PI / 6), y - head * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(x, y);
            ctx.lineTo(x - head * Math.cos(angle + Math.PI / 6), y - head * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
            return;
        }
        // circle: a filled dot centered on the endpoint.
        const r = Math.max(3, width * 1.6);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
    }

    public static roundRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
    ) {
        const radius = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + w, y, x + w, y + h, radius);
        ctx.arcTo(x + w, y + h, x, y + h, radius);
        ctx.arcTo(x, y + h, x, y, radius);
        ctx.arcTo(x, y, x + w, y, radius);
        ctx.closePath();
    }

    /** Build the path for a diamond (rhombus) inscribed in the (x, y, w, h) box —
     *  vertices at the four edge midpoints. `r > 0` rounds each vertex by trimming
     *  the adjacent edges inward and curving through the vertex; `r = 0` is sharp.
     *  Path-only, like {@link roundRect}: the caller does `fill()`/`stroke()`. */
    public static diamondPath(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        w: number,
        h: number,
        r = 0,
    ) {
        const cx = x + w / 2;
        const cy = y + h / 2;
        const pts = [
            { x: cx, y }, // top
            { x: x + w, y: cy }, // right
            { x: cx, y: y + h }, // bottom
            { x, y: cy }, // left
        ];
        ctx.beginPath();
        if (r <= 0) {
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();
            return;
        }
        const n = pts.length;
        for (let i = 0; i < n; i++) {
            const curr = pts[i];
            const inPt = CanvasDraw.pointToward(curr, pts[(i - 1 + n) % n], r);
            const outPt = CanvasDraw.pointToward(curr, pts[(i + 1) % n], r);
            if (i === 0) ctx.moveTo(inPt.x, inPt.y);
            else ctx.lineTo(inPt.x, inPt.y);
            ctx.quadraticCurveTo(curr.x, curr.y, outPt.x, outPt.y);
        }
        ctx.closePath();
    }

    /** A point `dist` from `from` toward `to`, never past the edge midpoint. */
    private static pointToward(
        from: { x: number; y: number },
        to: { x: number; y: number },
        dist: number,
    ): { x: number; y: number } {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const t = Math.min(dist, len / 2) / len;
        return { x: from.x + dx * t, y: from.y + dy * t };
    }

    /** Break text into rendered lines: split on `\n`, then word-wrap each paragraph to
     *  `maxWidth`. Empty paragraphs yield an empty string so blank lines are preserved.
     *  Shared by {@link wrapText} (drawing) and note height measurement so both agree. */
    public static wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
        const lines: string[] = [];
        for (const paragraph of text.split('\n')) {
            let line = '';
            for (const word of paragraph.split(' ')) {
                const test = line ? `${line} ${word}` : word;
                if (ctx.measureText(test).width > maxWidth && line) {
                    lines.push(line);
                    line = word;
                } else {
                    line = test;
                }
            }
            lines.push(line);
        }
        return lines;
    }

    public static wrapText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number,
        align: CanvasTextAlign = 'left',
    ) {
        ctx.textAlign = align;
        const anchorX = align === 'center' ? x + maxWidth / 2 : align === 'right' ? x + maxWidth : x;
        let cursorY = y;
        for (const line of CanvasDraw.wrapLines(ctx, text, maxWidth)) {
            ctx.fillText(line, anchorX, cursorY);
            cursorY += lineHeight;
        }
    }

    /** Distance from a box's top edge to the first line of a caption, placing the wrapped
     *  text block within `height` per `valign` ('top'/'bottom' inset by {@link LABEL_PADDING},
     *  'middle' centered). The single source of truth shared by the canvas
     *  ({@link drawCenteredLabel}) and the editor overlay so they can't drift.
     *  `measureCtx` must already have the caption font applied. */
    public static labelOffsetY(
        measureCtx: CanvasRenderingContext2D,
        text: string,
        fontSize: number,
        width: number,
        height: number,
        valign: VerticalAlign = 'middle',
    ): number {
        const lines = CanvasDraw.wrapLines(measureCtx, text, width);
        const textHeight = lines.length * fontSize * CanvasDraw.LABEL_LINE_HEIGHT;
        switch (valign) {
            case 'top':
                return CanvasDraw.LABEL_PADDING;
            case 'bottom':
                return height - textHeight - CanvasDraw.LABEL_PADDING;
            default:
                return (height - textHeight) / 2;
        }
    }

    /** Anchor x and canvas `textAlign` for a horizontally-aligned caption within `bounds`.
     *  'left'/'right' inset by {@link LABEL_PADDING}; 'center' uses the box midpoint. */
    private static labelAnchorX(bounds: Bounds, align: TextAlign): { x: number; textAlign: CanvasTextAlign } {
        switch (align) {
            case 'left':
                return { x: bounds.x + CanvasDraw.LABEL_PADDING, textAlign: 'left' };
            case 'right':
                return { x: bounds.x + bounds.w - CanvasDraw.LABEL_PADDING, textAlign: 'right' };
            default:
                return { x: bounds.x + bounds.w / 2, textAlign: 'center' };
        }
    }

    /** Draw a word-wrapped caption over a shape, aligned within `bounds` per `resolved`'s
     *  `hAlign`/`vAlign`. Box shapes wrap to `bounds.w`; `pill` shapes (arrow/draw, no real
     *  box) split only on `\n`, stay centered on the midpoint (alignment is not offered for
     *  them) and get a translucent rounded background behind the text so it stays legible
     *  over the line. */
    public static drawCenteredLabel(
        ctx: CanvasRenderingContext2D,
        text: string,
        bounds: Bounds,
        resolved: ResolvedTextOptions,
        pill = false,
    ): void {
        const { fontSize } = resolved;
        ctx.save();
        ctx.font = FontUtil.cssFont(fontSize, resolved.fontFamily);
        ctx.textBaseline = 'top';
        const lineHeight = fontSize * CanvasDraw.LABEL_LINE_HEIGHT;
        const wrapWidth = pill ? Number.POSITIVE_INFINITY : bounds.w;
        const lines = CanvasDraw.wrapLines(ctx, text, wrapWidth);
        // Pills have no real box to align within — pin them to the midpoint as before.
        const top = pill
            ? bounds.y + (bounds.h - lines.length * lineHeight) / 2
            : bounds.y + CanvasDraw.labelOffsetY(ctx, text, fontSize, bounds.w, bounds.h, resolved.vAlign);
        const centerX = bounds.x + bounds.w / 2;
        if (pill) CanvasDraw.drawLabelPill(ctx, lines, centerX, top, lineHeight);
        const anchor = pill ? { x: centerX, textAlign: 'center' as CanvasTextAlign } : CanvasDraw.labelAnchorX(bounds, resolved.hAlign);
        ctx.fillStyle = '#1e1e1e';
        ctx.textAlign = anchor.textAlign;
        let cursorY = top;
        for (const line of lines) {
            ctx.fillText(line, anchor.x, cursorY);
            cursorY += lineHeight;
        }
        ctx.restore();
    }

    /** Translucent rounded background sized to the widest caption line, centered on the
     *  shape midpoint — keeps an arrow/draw caption readable over the geometry. */
    private static drawLabelPill(
        ctx: CanvasRenderingContext2D,
        lines: string[],
        centerX: number,
        top: number,
        lineHeight: number,
    ): void {
        let maxWidth = 0;
        for (const line of lines) maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
        const pad = CanvasDraw.LABEL_PILL_PADDING;
        const w = maxWidth + pad * 2;
        const h = lines.length * lineHeight + pad * 2;
        ctx.fillStyle = 'rgba(248,249,250,0.85)';
        CanvasDraw.roundRect(ctx, centerX - w / 2, top - pad, w, h, 4);
        ctx.fill();
    }
}
