import { describe, expect, it } from 'vitest';
import { CanvasDraw } from './canvasDraw';

/** Minimal recording 2D context: captures setLineDash args in order and tracks the
 *  last strokeStyle/lineWidth assigned, which is all these specs assert against. */
function recordingContext(): { ctx: CanvasRenderingContext2D; dashCalls: number[][]; state: Record<string, unknown> } {
    const dashCalls: number[][] = [];
    const state: Record<string, unknown> = {};
    const target: Record<string, unknown> = {
        setLineDash: (pattern: number[]) => { dashCalls.push(pattern); },
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        stroke: () => {},
        fill: () => {},
    };
    const ctx = new Proxy(target, {
        get: (obj, prop: string) => (prop in obj ? obj[prop] : state[prop]),
        set: (_obj, prop: string, value) => { state[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, dashCalls, state };
}

describe('CanvasDraw.applyStroke', () => {
    it('sets color and width on the context', () => {
        const { ctx, state } = recordingContext();
        CanvasDraw.applyStroke(ctx, '#123456', 3);
        expect(state.strokeStyle).toBe('#123456');
        expect(state.lineWidth).toBe(3);
    });

    it('clears the dash pattern for solid (and when style is omitted)', () => {
        const { ctx, dashCalls } = recordingContext();
        CanvasDraw.applyStroke(ctx, '#000', 2, 'solid');
        CanvasDraw.applyStroke(ctx, '#000', 2);
        CanvasDraw.applyStroke(ctx, '#000', 2, undefined);
        expect(dashCalls).toEqual([[], [], []]);
    });

    it('scales the dash pattern with width for dashed and dotted', () => {
        const dashed = recordingContext();
        CanvasDraw.applyStroke(dashed.ctx, '#000', 2, 'dashed');
        expect(dashed.dashCalls).toEqual([[8, 4]]);

        const dotted = recordingContext();
        CanvasDraw.applyStroke(dotted.ctx, '#000', 3, 'dotted');
        expect(dotted.dashCalls).toEqual([[3, 6]]);
    });
});

describe('CanvasDraw.drawArrow', () => {
    it('resets the dash pattern before drawing caps so arrowheads stay solid', () => {
        const { ctx, dashCalls } = recordingContext();
        // Caller applies the (possibly dashed) line style first, exactly as the shape def does.
        CanvasDraw.applyStroke(ctx, '#000', 2, 'dashed');
        CanvasDraw.drawArrow(ctx, 0, 0, 100, 0, 2, 'none', 'arrow');
        // First the dashed line pattern, then a reset to solid for the caps.
        expect(dashCalls).toEqual([[8, 4], []]);
    });
});
