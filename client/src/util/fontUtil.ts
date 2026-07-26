import { Font } from '../model/shapeTypes';

const FONT_STACKS: Record<Font, string> = {
    [Font.Font1]: 'Inter',
    [Font.Font2]: 'Architects-Daughter',
    [Font.Font3]: 'SuseMono',
};

export enum FontSize {
    S = 'small',
    M = 'medium',
    L = 'large',
    XL = 'xlarge',
}
export const FONT_SIZE_LABELS: Record<FontSize, string> = {
    [FontSize.S]: 'S',
    [FontSize.M]: 'M',
    [FontSize.L]: 'L',
    [FontSize.XL]: 'XL',
};
export type FontSizeOption = { size: FontSize; pxSize: number };

/** Font picker entries for the properties panel. Each font carries its own size scale —
 *  e.g. Architects-Daughter reads poorly at 14px, so its 'S' is bumped to 16px. */
export const FONTS: { font: Font; label: string; sizes: FontSizeOption[] }[] = [
    {
        font: Font.Font1, label: 'F1', sizes: [
            { size: FontSize.S, pxSize: 14 }, { size: FontSize.M, pxSize: 18 }, { size: FontSize.L, pxSize: 24 }, { size: FontSize.XL, pxSize: 32 },
        ],
    },
    {
        font: Font.Font2, label: 'F2', sizes: [
            { size: FontSize.S, pxSize: 16 }, { size: FontSize.M, pxSize: 18 }, { size: FontSize.L, pxSize: 24 }, { size: FontSize.XL, pxSize: 32 },
        ],
    },
    {
        font: Font.Font3, label: 'F3', sizes: [
            { size: FontSize.S, pxSize: 14 }, { size: FontSize.M, pxSize: 18 }, { size: FontSize.L, pxSize: 24 }, { size: FontSize.XL, pxSize: 32 },
        ],
    },
];

/** Builds the canvas `ctx.font` / CSS `font` value shared by canvas rendering, the inline
 *  DOM editor, and text measurement so all three stay byte-identical. */
export class FontUtil {
    public static stack(font: Font = Font.Font1): string {
        return FONT_STACKS[font];
    }

    public static cssFont(fontSize: number, font: Font = Font.Font1): string {
        return `${fontSize}px ${FontUtil.stack(font)}`;
    }

    public static sizesFor(font: Font = Font.Font1): FontSizeOption[] {
        return FONTS.find((f) => f.font === font)?.sizes ?? FONTS[0].sizes;
    }

    public static smallSize(font: Font = Font.Font1): number {
        return FontUtil.sizesFor(font)[0].pxSize;
    }

    public static mediumSize(font: Font = Font.Font1): number {
        return FontUtil.sizesFor(font)[1].pxSize;
    }

    /** Forces the `@font-face` files to fetch/decode. Canvas `fillText` silently falls back
     *  to a system font for whatever hasn't loaded yet and never repaints on its own once the
     *  real font arrives — unlike DOM text, nothing tells the canvas to redraw. Callers must
     *  re-render once this resolves. */
    public static async loadAll(): Promise<void> {
        await Promise.all(Object.values(FONT_STACKS).map((stack) => document.fonts.load(`16px ${stack}`)));
    }
}
