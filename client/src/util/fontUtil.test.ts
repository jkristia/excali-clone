import { describe, expect, it } from 'vitest';
import { Font } from '../model/shapeTypes';
import { FontSize, FontUtil } from './fontUtil';

describe('FontUtil.stack', () => {
    it('defaults to the Font1 stack', () => {
        expect(FontUtil.stack()).toBe('Inter');
    });

    it('returns a distinct stack per font', () => {
        const stacks = new Set([Font.Font1, Font.Font2, Font.Font3].map((f) => FontUtil.stack(f)));
        expect(stacks.size).toBe(3);
    });
});

describe('FontUtil.cssFont', () => {
    it('builds a canvas/CSS font shorthand with the default font', () => {
        expect(FontUtil.cssFont(16)).toBe('16px Inter');
    });

    it('builds the shorthand with an explicit font', () => {
        expect(FontUtil.cssFont(24, Font.Font2)).toBe('24px Architects-Daughter');
        expect(FontUtil.cssFont(24, Font.Font3)).toBe('24px SuseMono');
    });
});

describe('FontUtil.sizesFor', () => {
    it('defaults to Font1 when no font is given', () => {
        expect(FontUtil.sizesFor()).toEqual(FontUtil.sizesFor(Font.Font1));
    });

    it('returns a distinct Small size per font — Architects-Daughter reads small text poorly, so it gets a bump', () => {
        expect(FontUtil.sizesFor(Font.Font1).find((s) => s.size === FontSize.S)?.pxSize).toBe(14);
        expect(FontUtil.sizesFor(Font.Font2).find((s) => s.size === FontSize.S)?.pxSize).toBe(16);
        expect(FontUtil.sizesFor(Font.Font3).find((s) => s.size === FontSize.S)?.pxSize).toBe(14);
    });
});

describe('FontUtil.smallSize / FontUtil.mediumSize', () => {
    it('defaults to Font1 when no font is given', () => {
        expect(FontUtil.smallSize()).toBe(14);
        expect(FontUtil.mediumSize()).toBe(18);
    });

    it("returns Font2's bumped Small size but the shared Medium size", () => {
        expect(FontUtil.smallSize(Font.Font2)).toBe(16);
        expect(FontUtil.mediumSize(Font.Font2)).toBe(18);
    });
});
