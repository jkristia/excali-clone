import { describe, expect, it } from 'vitest';
import { TextShapeDef, TEXT_LINE_HEIGHT } from './textShapeDef';

/** Context whose `measureText` returns 10px per character, so wrapping is deterministic. */
function measuringContext(): CanvasRenderingContext2D {
    return { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as CanvasRenderingContext2D;
}

describe('TextShapeDef resize capability', () => {
    it('resizes on the horizontal axis only (width sets the wrap, height auto-follows)', () => {
        const def = new TextShapeDef();
        expect(def.resizable).toBe(true);
        expect(def.resizeAxis).toBe('x');
    });
});

describe('TextShapeDef.measureWrapHeight', () => {
    it('is a single line box for text that fits the width', () => {
        const ctx = measuringContext();
        // 'a' (10px) fits width 50 -> 1 line * 20 * 1.25 = 25.
        expect(TextShapeDef.measureWrapHeight(ctx, 'a', 20, 50)).toBe(20 * TEXT_LINE_HEIGHT);
    });

    it('grows by line box for each wrapped line', () => {
        const ctx = measuringContext();
        // 'aaaa bbbb' wraps at width 50 -> 2 lines -> 2 * 20 * 1.25 = 50.
        expect(TextShapeDef.measureWrapHeight(ctx, 'aaaa bbbb', 20, 50)).toBe(2 * 20 * TEXT_LINE_HEIGHT);
    });

    it('never returns less than one line box for empty text', () => {
        const ctx = measuringContext();
        expect(TextShapeDef.measureWrapHeight(ctx, '', 20, 50)).toBe(20 * TEXT_LINE_HEIGHT);
    });
});
