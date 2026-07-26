import { describe, expect, it, vi } from 'vitest';
import { CanvasDraw } from './canvasDraw';
import { Font, type FillStyle } from '../model/shapeTypes';

/** Fake offscreen tile so `fillFor`'s `document.createElement('canvas')` works under the
 *  node test env (no DOM). getContext returns a no-op 2D context; the tile is opaque to
 *  `createPattern`, which the recording context stubs with a sentinel. */
function stubDocument(): void {
    const fakeCanvas = {
        width: 0,
        height: 0,
        getContext: () => ({
            strokeStyle: '',
            lineWidth: 0,
            beginPath: () => { },
            moveTo: () => { },
            lineTo: () => { },
            stroke: () => { },
        }),
    };
    vi.stubGlobal('document', { createElement: () => fakeCanvas });
}

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
        createPattern: () => ({ __pattern: true }),
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

describe('CanvasDraw.fillFor', () => {
    it('returns the color unchanged for solid (no pattern built)', () => {
        const { ctx } = recordingContext();
        expect(CanvasDraw.fillFor(ctx, 'solid', '#abcdef')).toBe('#abcdef');
    });

    it('returns a CanvasPattern (not the color) for hatch and crossHatch', () => {
        stubDocument();
        try {
            const { ctx } = recordingContext();
            for (const style of ['hatch', 'crossHatch'] as FillStyle[]) {
                const result = CanvasDraw.fillFor(ctx, style, '#000000');
                expect(result).not.toBe('#000000');
                expect(typeof result).not.toBe('string');
            }
        } finally {
            vi.unstubAllGlobals();
        }
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
