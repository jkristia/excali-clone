import type { EndpointCap } from '../model/types';

/** Small reusable canvas-2D drawing primitives shared by multiple shape definitions. */
export class CanvasDraw {
    public static applyStroke(ctx: CanvasRenderingContext2D, color: string, width: number) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
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
}
