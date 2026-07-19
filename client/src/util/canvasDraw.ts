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

    public static wrapText(
        ctx: CanvasRenderingContext2D,
        text: string,
        x: number,
        y: number,
        maxWidth: number,
        lineHeight: number,
    ) {
        let cursorY = y;
        for (const paragraph of text.split('\n')) {
            const words = paragraph.split(' ');
            let line = '';
            for (const word of words) {
                const test = line ? `${line} ${word}` : word;
                if (ctx.measureText(test).width > maxWidth && line) {
                    ctx.fillText(line, x, cursorY);
                    line = word;
                    cursorY += lineHeight;
                } else {
                    line = test;
                }
            }
            if (line) {
                ctx.fillText(line, x, cursorY);
                cursorY += lineHeight;
            }
        }
    }
}
