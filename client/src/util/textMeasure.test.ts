import { describe, expect, it } from 'vitest';
import { TextMeasure, type CaretLayout } from './textMeasure';

/** Context whose `measureText` returns 10px per character, so caret math is deterministic. */
function measuringContext(): CanvasRenderingContext2D {
    return { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as CanvasRenderingContext2D;
}

// fontSize 20 * lineHeight 1.25 => a 25px line box; y in row 0 is [0,25).
const base: CaretLayout = { lineHeight: 1.25, textAlign: 'left', boxWidth: 1000, wrap: false };
const caret = (text: string, x: number, y: number, layout: Partial<CaretLayout> = {}) =>
    TextMeasure.caretIndex(measuringContext(), text, 20, x, y, { ...base, ...layout });

describe('TextMeasure.caretIndex', () => {
    it('places the caret at the nearest glyph boundary on a single line', () => {
        // 'hello', 10px/char. x=22 falls before char index 2's midpoint (25) -> caret 2.
        expect(caret('hello', 22, 5)).toBe(2);
    });

    it('clamps to the line start for a click left of the text', () => {
        expect(caret('hello', -5, 5)).toBe(0);
    });

    it('clamps to the line end for a click past the text', () => {
        expect(caret('hello', 500, 5)).toBe(5);
    });

    it('maps y to the right line and offsets by preceding lines + newline', () => {
        // 'ab\ncd': line 1 starts at raw index 3; x=5 lands before 'd' -> index 4.
        expect(caret('ab\ncd', 5, 30)).toBe(4);
        // The last row is clamped, so a click far below still targets 'cd'.
        expect(caret('ab\ncd', 15, 999)).toBe(5);
    });

    it('accounts for the center anchor', () => {
        // 'ab' is 20 wide in a 100 box -> anchor 40; x=45 -> relX 5 -> before char 1.
        expect(caret('ab', 45, 5, { textAlign: 'center', boxWidth: 100 })).toBe(1);
    });

    it('accounts for the right anchor', () => {
        // anchor = 100 - 20 = 80; x=85 -> relX 5 -> index 1.
        expect(caret('ab', 85, 5, { textAlign: 'right', boxWidth: 100 })).toBe(1);
    });

    it('maps clicks against wrapped lines back to raw string offsets', () => {
        // 'aaaa bbbb' wraps at width 50 -> ['aaaa'(start 0), 'bbbb'(start 5)] (space consumed).
        // Row 1, x=0 -> caret at the start of 'bbbb' = raw index 5.
        expect(caret('aaaa bbbb', 0, 30, { wrap: true, boxWidth: 50 })).toBe(5);
        // Row 1, x=22 -> before char index 2 of 'bbbb' (its midpoint is 25) -> raw index 7.
        expect(caret('aaaa bbbb', 22, 30, { wrap: true, boxWidth: 50 })).toBe(7);
    });
});
