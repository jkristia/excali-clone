import { describe, expect, it } from 'vitest';
import { CanvasDraw } from './canvasDraw';
import { Font } from '../model/shapeTypes';

/** Minimal recording 2D context: captures setLineDash args in order and tracks the
 *  last strokeStyle/lineWidth assigned, which is all these specs assert against. */
function recordingContext(): { ctx: CanvasRenderingContext2D; dashCalls: number[][]; state: Record<string, unknown> } {
    const dashCalls: number[][] = [];
    const state: Record<string, unknown> = {};
    const target: Record<string, unknown> = {
        setLineDash: (pattern: number[]) => { dashCalls.push(pattern); },
        beginPath: () => { },
        moveTo: () => { },
        lineTo: () => { },
        arc: () => { },
        stroke: () => { },
        fill: () => { },
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

describe('CanvasDraw.roundRectPathData', () => {
    it('builds an SVG path with a quarter-circle arc at each corner', () => {
        expect(CanvasDraw.roundRectPathData(10, 10, 2)).toBe(
            'M 2,0 H 8 A 2,2 0 0 1 10,2 V 8 A 2,2 0 0 1 8,10 H 2 A 2,2 0 0 1 0,8 V 2 A 2,2 0 0 1 2,0 Z',
        );
    });

    it('degenerates to a sharp-cornered rect (0-radius arcs) when r is 0', () => {
        expect(CanvasDraw.roundRectPathData(10, 10, 0)).toBe(
            'M 0,0 H 10 A 0,0 0 0 1 10,0 V 10 A 0,0 0 0 1 10,10 H 0 A 0,0 0 0 1 0,10 V 0 A 0,0 0 0 1 0,0 Z',
        );
    });

    it('clamps the radius to half the smaller side', () => {
        // r=100 requested on a 10x10 box clamps to 5 (w/2 and h/2), same as roundRect.
        expect(CanvasDraw.roundRectPathData(10, 10, 100)).toBe(CanvasDraw.roundRectPathData(10, 10, 5));
    });
});

describe('CanvasDraw.diamondPathData', () => {
    it('builds a sharp rhombus through the four edge midpoints when r is 0', () => {
        expect(CanvasDraw.diamondPathData(10, 10, 0)).toBe('M 5,0 L 10,5 L 5,10 L 0,5 Z');
    });

    it('rounds each vertex with a quadratic curve when r > 0', () => {
        const d = CanvasDraw.diamondPathData(10, 10, 2);
        expect(d.startsWith('M 3.585786437626905,1.414213562373095 Q 5,0 6.414213562373095,1.414213562373095')).toBe(true);
        expect(d.endsWith('Z')).toBe(true);
    });
});

/** Context whose `measureText` returns 10px per character, so wrapping is deterministic. */
function measuringContext(): CanvasRenderingContext2D {
    return { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as CanvasRenderingContext2D;
}

describe('CanvasDraw.labelOffsetY', () => {
    it('centers a single-line block shorter than the box (positive offset)', () => {
        const ctx = measuringContext();
        // 1 line * 20 * 1.3 = 26 tall in a 100 box -> (100 - 26) / 2 = 37.
        expect(CanvasDraw.labelOffsetY(ctx, 'A', 20, 1000, 100)).toBe(37);
    });

    it('returns a negative offset when the wrapped block is taller than the box', () => {
        const ctx = measuringContext();
        // (10 - 26) / 2 = -8; not floored — overflow is expected, matching sticky notes.
        expect(CanvasDraw.labelOffsetY(ctx, 'A', 20, 1000, 10)).toBe(-8);
    });

    it('accounts for wrapped lines when centering (wrap width forces two lines)', () => {
        const ctx = measuringContext();
        // 'aaaa bbbb' wraps at width 50 -> 2 lines * 26 = 52; (100 - 52) / 2 = 24.
        expect(CanvasDraw.labelOffsetY(ctx, 'aaaa bbbb', 20, 50, 100)).toBe(24);
    });

    it("'top' pins the block LABEL_PADDING below the box top, independent of box height", () => {
        const ctx = measuringContext();
        expect(CanvasDraw.labelOffsetY(ctx, 'A', 20, 1000, 100, 'top')).toBe(CanvasDraw.LABEL_PADDING);
    });

    it("'bottom' pins the block LABEL_PADDING above the box bottom", () => {
        const ctx = measuringContext();
        // 1 line * 26 tall in a 100 box, padded 4 from the bottom -> 100 - 26 - 4 = 70.
        expect(CanvasDraw.labelOffsetY(ctx, 'A', 20, 1000, 100, 'bottom')).toBe(100 - 26 - CanvasDraw.LABEL_PADDING);
    });
});

/** Recording context for caption layout: captures each fillText anchor x plus the
 *  textAlign in force, and measures 10px per char so wrapping stays deterministic. */
function labelRecordingContext(): { ctx: CanvasRenderingContext2D; fills: { x: number; align: string }[] } {
    const fills: { x: number; align: string }[] = [];
    const state: Record<string, unknown> = {};
    const target: Record<string, unknown> = {
        save: () => { },
        restore: () => { },
        measureText: (t: string) => ({ width: t.length * 10 }),
        fillText: (_t: string, x: number) => { fills.push({ x, align: String(state.textAlign) }); },
        // Path ops the pill background (roundRect + fill) exercises — no-ops for these specs.
        beginPath: () => { },
        moveTo: () => { },
        arcTo: () => { },
        closePath: () => { },
        fill: () => { },
    };
    const ctx = new Proxy(target, {
        get: (obj, prop: string) => (prop in obj ? obj[prop] : state[prop]),
        set: (_obj, prop: string, value) => { state[prop] = value; return true; },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, fills };
}

describe('CanvasDraw.drawCenteredLabel', () => {
    const bounds = { x: 100, y: 0, w: 200, h: 100 };

    it('anchors left-aligned text at the padded left edge', () => {
        const { ctx, fills } = labelRecordingContext();
        CanvasDraw.drawCenteredLabel(ctx, 'A', bounds, { fontSize: 20, fontFamily: Font.Font1, hAlign: 'left', vAlign: 'middle' });
        expect(fills).toEqual([{ x: 100 + CanvasDraw.LABEL_PADDING, align: 'left' }]);
    });

    it('anchors right-aligned text at the padded right edge', () => {
        const { ctx, fills } = labelRecordingContext();
        CanvasDraw.drawCenteredLabel(ctx, 'A', bounds, { fontSize: 20, fontFamily: Font.Font1, hAlign: 'right', vAlign: 'middle' });
        expect(fills).toEqual([{ x: 100 + 200 - CanvasDraw.LABEL_PADDING, align: 'right' }]);
    });

    it('centers by default, on the box midpoint', () => {
        const { ctx, fills } = labelRecordingContext();
        CanvasDraw.drawCenteredLabel(ctx, 'A', bounds, { fontSize: 20, fontFamily: Font.Font1, hAlign: 'center', vAlign: 'middle' });
        expect(fills).toEqual([{ x: 200, align: 'center' }]);
    });

    it('keeps a pill caption centered, ignoring alignment', () => {
        const { ctx, fills } = labelRecordingContext();
        CanvasDraw.drawCenteredLabel(ctx, 'A', bounds, { fontSize: 20, fontFamily: Font.Font1, hAlign: 'left', vAlign: 'top' }, true);
        expect(fills).toEqual([{ x: 200, align: 'center' }]);
    });
});
