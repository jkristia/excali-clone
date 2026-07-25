import { Font, type TextAlign, type TextOptions, type VerticalAlign } from '../model/types';
import type { Style } from '../state/uiStore';
import { FontUtil } from './fontUtil';

/** A shape's text options with every field defaulted — what rendering, measurement, and the
 *  inline editor actually need to lay text out. */
export interface ResolvedTextOptions {
    fontSize: number;
    fontFamily: Font;
    hAlign: TextAlign;
    vAlign: VerticalAlign;
}

/** Resolves {@link TextOptions} against a shape-type default and the built-in fallback, and
 *  builds the tool-default {@link TextOptions} for newly created shapes. The single place
 *  that knows the "absent means what" rules, replacing the `?? 16` / `?? Font.Font1` /
 *  `?? 'center'` literals that used to be scattered across render/editor/panel code. */
export class TextOptionsUtil {
    /** `defaults` is the shape definition's own default (see `ShapeDefinition.defaultTextOptions`);
     *  falls back to Font1/'center'/'middle' and the font's smallest size when even that is absent. */
    public static resolve(options?: TextOptions, defaults?: TextOptions): ResolvedTextOptions {
        const fontFamily = options?.fontFamily ?? defaults?.fontFamily ?? Font.Font1;
        return {
            fontFamily,
            fontSize: options?.fontSize ?? defaults?.fontSize ?? FontUtil.smallSize(fontFamily),
            hAlign: options?.hAlign ?? defaults?.hAlign ?? 'center',
            vAlign: options?.vAlign ?? defaults?.vAlign ?? 'middle',
        };
    }

    public static cssFont(resolved: ResolvedTextOptions): string {
        return FontUtil.cssFont(resolved.fontSize, resolved.fontFamily);
    }

    /** The current tool defaults from the ui store, to stamp onto a shape as it's created. */
    public static fromStyle(style: Style): TextOptions {
        return { fontSize: style.fontSize, fontFamily: style.fontFamily, hAlign: style.hAlign, vAlign: style.vAlign };
    }
}
