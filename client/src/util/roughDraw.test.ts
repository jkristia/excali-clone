import { describe, expect, it } from 'vitest';
import { RoughDraw } from './roughDraw';

const SQUARE = 'M 0,0 L 10,0 L 10,10 L 0,10 Z';

/** Minimal recording 2D context: captures method calls and property assignments in
 *  order, matching the pattern in canvas/render.test.ts. */
function recordingContext(): { ctx: CanvasRenderingContext2D; calls: string[] } {
    const calls: string[] = [];
    const state: Record<string, unknown> = {};
    const methods = ['beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'stroke', 'fill', 'setLineDash'];
    const target: Record<string, unknown> = {};
    for (const m of methods) {
        target[m] = (...args: unknown[]) => {
            calls.push(`${m}(${args.map((a) => JSON.stringify(a)).join(',')})`);
            return undefined;
        };
    }
    const ctx = new Proxy(target, {
        get: (obj, prop: string) => (prop in obj ? obj[prop] : state[prop]),
        set: (_obj, prop: string, value) => {
            state[prop] = value;
            calls.push(`set ${prop}=${JSON.stringify(value)}`);
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
}

describe('RoughDraw.seedFor', () => {
    it('is stable for the same id', () => {
        expect(RoughDraw.seedFor('abc')).toBe(RoughDraw.seedFor('abc'));
    });

    it('differs across ids', () => {
        expect(RoughDraw.seedFor('abc')).not.toBe(RoughDraw.seedFor('xyz'));
    });

    it('is always a positive integer, since RoughJS treats a falsy seed as "unseeded"', () => {
        expect(RoughDraw.seedFor('')).toBeGreaterThan(0);
        expect(Number.isInteger(RoughDraw.seedFor('some-id'))).toBe(true);
    });
});

describe('RoughDraw geometry cache', () => {
    it('box: returns the identical drawable for an unchanged key', () => {
        const a = RoughDraw.box('s1', SQUARE, 10, 10, 'plain', 2, false, undefined);
        const b = RoughDraw.box('s1', SQUARE, 10, 10, 'plain', 2, false, undefined);
        expect(a).toBe(b);
    });

    it('box: regenerates when the geometry (path data / size) changes', () => {
        const a = RoughDraw.box('s2', SQUARE, 10, 10, 'plain', 2, false, undefined);
        const b = RoughDraw.box('s2', 'M 0,0 L 20,0 L 20,10 L 0,10 Z', 20, 10, 'plain', 2, false, undefined);
        expect(a).not.toBe(b);
    });

    it('box: regenerates when sloppiness changes but not when only color would', () => {
        const a = RoughDraw.box('s3', SQUARE, 10, 10, 'plain', 2, false, undefined);
        const b = RoughDraw.box('s3', SQUARE, 10, 10, 'medium', 2, false, undefined);
        expect(a).not.toBe(b);
    });

    it('ellipse: caches per shape id the same way as box', () => {
        const a = RoughDraw.ellipse('s4', 40, 20, 'plain', 2, false, undefined);
        const b = RoughDraw.ellipse('s4', 40, 20, 'plain', 2, false, undefined);
        expect(a).toBe(b);
    });

    it('line: caches per shape id the same way as box', () => {
        const a = RoughDraw.line('s5', 100, 0, 'plain', 2);
        const b = RoughDraw.line('s5', 100, 0, 'plain', 2);
        expect(a).toBe(b);
    });
});

describe('RoughDraw.paint', () => {
    it('strokes the outline in the stroke color and fills a solid fill in the fill color', () => {
        const drawable = RoughDraw.box('p1', SQUARE, 10, 10, 'plain', 2, true, 'solid');
        const { ctx, calls } = recordingContext();
        RoughDraw.paint(ctx, drawable, '#000', 2, 'solid', '#fff');
        expect(calls).toContain('set strokeStyle="#000"');
        expect(calls).toContain('set fillStyle="#fff"');
        expect(calls).toContain('fill("evenodd")');
        expect(calls).toContain('stroke()');
    });

    it('paints a hachure fill by stroking in the fill color, not a fillPath', () => {
        const drawable = RoughDraw.box('p2', SQUARE, 10, 10, 'plain', 2, true, 'hatch');
        const { ctx, calls } = recordingContext();
        RoughDraw.paint(ctx, drawable, '#000', 2, 'solid', '#fff');
        expect(calls).toContain('set strokeStyle="#fff"'); // hachure lines stroked in the fill color
        expect(calls).not.toContain('fill("evenodd")');
    });

    it('skips the outline stroke when strokeWidth is 0 — Canvas2D ignores a 0 lineWidth rather than hiding the line', () => {
        const drawable = RoughDraw.box('p3', SQUARE, 10, 10, 'plain', 0, false, undefined);
        const { ctx, calls } = recordingContext();
        RoughDraw.paint(ctx, drawable, '#000', 0, 'solid');
        expect(calls).not.toContain('stroke()');
    });

    it('applies the stroke style\'s dash pattern to the outline only, resetting it before a hachure fill', () => {
        const drawable = RoughDraw.box('p4', SQUARE, 10, 10, 'plain', 2, true, 'hatch');
        const { ctx, calls } = recordingContext();
        RoughDraw.paint(ctx, drawable, '#000', 2, 'dashed', '#fff');
        expect(calls).toContain('setLineDash([8,4])'); // the outline
        expect(calls).toContain('setLineDash([])'); // the hachure lines
    });

    it('omits any fill when fillColor is not passed, even if the drawable was generated with a fill', () => {
        const drawable = RoughDraw.box('p5', SQUARE, 10, 10, 'plain', 2, true, 'solid');
        const { ctx, calls } = recordingContext();
        RoughDraw.paint(ctx, drawable, '#000', 2, 'solid');
        expect(calls).not.toContain('fill("evenodd")');
        expect(calls).toContain('stroke()');
    });

    it('fills an ellipse with the nonzero rule, matching RoughJS\'s own renderer for "ellipse"-shaped drawables', () => {
        // At roughness > 0, RoughJS's solid fillPath for an ellipse is two overlapping
        // closed curves (the sketchy double-stroke). Filling with 'evenodd' would cancel
        // out their shared interior, leaving only a thin sliver visibly filled — regression
        // test for that bug.
        const drawable = RoughDraw.ellipse('p6', 40, 20, 'medium', 2, true, 'solid');
        const { ctx, calls } = recordingContext();
        RoughDraw.paint(ctx, drawable, '#000', 2, 'solid', '#fff');
        expect(calls).toContain('fill("nonzero")');
        expect(calls).not.toContain('fill("evenodd")');
    });

    it('fills a box with the evenodd rule, matching RoughJS\'s own renderer for "path"-shaped drawables', () => {
        const drawable = RoughDraw.box('p7', SQUARE, 10, 10, 'medium', 2, true, 'solid');
        const { ctx, calls } = recordingContext();
        RoughDraw.paint(ctx, drawable, '#000', 2, 'solid', '#fff');
        expect(calls).toContain('fill("evenodd")');
        expect(calls).not.toContain('fill("nonzero")');
    });
});
