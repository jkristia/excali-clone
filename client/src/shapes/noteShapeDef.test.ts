import { describe, expect, it } from 'vitest';
import { NoteShapeDef, NOTE_PADDING } from './noteShapeDef';

/** Context whose `measureText` returns 10px per character, so wrapping is deterministic. */
function measuringContext(): CanvasRenderingContext2D {
    return { measureText: (t: string) => ({ width: t.length * 10 }) } as unknown as CanvasRenderingContext2D;
}

describe('NoteShapeDef.textOffsetY', () => {
    it('centers the text block within the height by default (vAlign omitted)', () => {
        const ctx = measuringContext();
        // 1 line * 20 * 1.3 = 26 tall in a 100-h box (width plenty wide for one line) -> (100 - 26) / 2 = 37.
        expect(NoteShapeDef.textOffsetY(ctx, 'A', 20, 1000, 100)).toBe(37);
    });

    it("'top' pins the block to the padding, regardless of box height", () => {
        const ctx = measuringContext();
        expect(NoteShapeDef.textOffsetY(ctx, 'A', 20, 1000, 100, 'top')).toBe(NOTE_PADDING);
    });

    it("'bottom' pins the block to the padding above the box bottom", () => {
        const ctx = measuringContext();
        // 1 line * 26 tall in a 100-h box, padded 12 from the bottom -> 100 - 12 - 26 = 62.
        expect(NoteShapeDef.textOffsetY(ctx, 'A', 20, 1000, 100, 'bottom')).toBe(100 - NOTE_PADDING - 26);
    });

    it('floors/ceilings every alignment at the padding so text never rides an edge', () => {
        const ctx = measuringContext();
        // Text taller than the box: all three alignments clamp to NOTE_PADDING.
        expect(NoteShapeDef.textOffsetY(ctx, 'A', 20, 1000, 10, 'top')).toBe(NOTE_PADDING);
        expect(NoteShapeDef.textOffsetY(ctx, 'A', 20, 1000, 10, 'middle')).toBe(NOTE_PADDING);
        expect(NoteShapeDef.textOffsetY(ctx, 'A', 20, 1000, 10, 'bottom')).toBe(NOTE_PADDING);
    });
});
