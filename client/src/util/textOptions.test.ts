import { describe, expect, it } from 'vitest';
import { Font } from '../model/shapeTypes';
import { TextOptionsUtil } from './textOptions';
import { FontUtil } from './fontUtil';

describe('TextOptionsUtil.resolve', () => {
    it('falls back to Font1/center/middle and the family\'s smallest size when nothing is set', () => {
        expect(TextOptionsUtil.resolve()).toEqual({
            fontFamily: Font.Font1, fontSize: FontUtil.smallSize(Font.Font1), hAlign: 'center', vAlign: 'middle',
        });
    });

    it("prefers the shape's own value over the shape-type default", () => {
        const resolved = TextOptionsUtil.resolve(
            { fontSize: 24, hAlign: 'left' },
            { fontSize: 16, hAlign: 'center', vAlign: 'top' },
        );
        expect(resolved).toEqual({ fontFamily: Font.Font1, fontSize: 24, hAlign: 'left', vAlign: 'top' });
    });

    it('falls back to the shape-type default when the shape carries no value', () => {
        const resolved = TextOptionsUtil.resolve(undefined, { hAlign: 'left', vAlign: 'bottom' });
        expect(resolved.hAlign).toBe('left');
        expect(resolved.vAlign).toBe('bottom');
    });

    it("derives the default font size from the resolved family's own smallest size", () => {
        expect(TextOptionsUtil.resolve({ fontFamily: Font.Font2 }).fontSize).toBe(FontUtil.smallSize(Font.Font2));
    });
});

describe('TextOptionsUtil.cssFont', () => {
    it('delegates to FontUtil.cssFont with the resolved size/family', () => {
        const resolved = { fontFamily: Font.Font3, fontSize: 22, hAlign: 'center' as const, vAlign: 'middle' as const };
        expect(TextOptionsUtil.cssFont(resolved)).toBe(FontUtil.cssFont(22, Font.Font3));
    });
});

describe('TextOptionsUtil.fromStyle', () => {
    it('picks the four text-option fields off the current tool-default style', () => {
        const style = {
            stroke: '#000', fill: '#fff', strokeWidth: 2, strokeStyle: 'solid', fillStyle: 'solid', opacity: 1,
            fontSize: 18, fontFamily: Font.Font2, hAlign: 'right', vAlign: 'top',
            noteFill: '#fff', startCap: 'none', endCap: 'arrow', edges: 'sharp',
        } as const;
        expect(TextOptionsUtil.fromStyle(style)).toEqual({ fontSize: 18, fontFamily: Font.Font2, hAlign: 'right', vAlign: 'top' });
    });
});
