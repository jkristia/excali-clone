import { Font, type TextAlign, type VerticalAlign } from '../model/types';
import { TEXT_LINE_HEIGHT, TextShapeDef } from '../shapes/textShapeDef';
import { NoteShapeDef } from '../shapes/noteShapeDef';
import { CanvasDraw } from './canvasDraw';
import { FontUtil } from './fontUtil';

/** How the inline editor lays text out, enough to map a click point to a caret index. */
export interface CaretLayout {
    /** Line-height multiplier (TEXT_LINE_HEIGHT for text, NOTE_LINE_HEIGHT for notes). */
    lineHeight: number;
    textAlign: TextAlign;
    /** The layout width lines are aligned within (and wrapped to when `wrap`). */
    boxWidth: number;
    /** True when text is word-wrapped to `boxWidth` rather than split only on `\n`. */
    wrap: boolean;
}

/** Text metrics computed off a single shared offscreen canvas. Used by the inline editor
 *  and the properties panel to auto-size text/note boxes identically to the canvas render. */
export class TextMeasure {
    private readonly ctx = document.createElement('canvas').getContext('2d')!;

    private applyFont(fontSize: number, font: Font = Font.Font1): void {
        this.ctx.font = FontUtil.cssFont(fontSize, font);
    }

    /** Width/height a text shape needs to fit `text` at `fontSize`. */
    public measureText(text: string, fontSize: number, font: Font = Font.Font1): { w: number; h: number } {
        this.applyFont(fontSize, font);
        const lines = text.split('\n');
        let w = 0;
        for (const line of lines) w = Math.max(w, this.ctx.measureText(line || ' ').width);
        const lineBox = fontSize * TEXT_LINE_HEIGHT;
        return { w: Math.max(20, w + 4), h: Math.max(lineBox, lines.length * lineBox) };
    }

    /** Width/height a wrapped text shape needs: text word-wraps to `width`, height follows
     *  the wrapped line count. Width is echoed back (the fixed wrap width the user set). */
    public measureTextWrapped(text: string, fontSize: number, width: number, font: Font = Font.Font1): { w: number; h: number } {
        this.applyFont(fontSize, font);
        return { w: width, h: TextShapeDef.measureWrapHeight(this.ctx, text, fontSize, width) };
    }

    /** The caret index (string offset) nearest a click at local point (localX, localY) — local
     *  to the text block's top-left, so callers subtract any padding first. */
    public caretIndexAt(
        text: string, fontSize: number, localX: number, localY: number, layout: CaretLayout, font: Font = Font.Font1,
    ): number {
        this.applyFont(fontSize, font);
        return TextMeasure.caretIndex(this.ctx, text, fontSize, localX, localY, layout);
    }

    /** Pure caret-mapping used by {@link caretIndexAt}, taking the measure context directly so it
     *  is testable with a fake `measureText`. Maps the click to a visual line (by `localY`) and a
     *  column (by walking glyph widths at the line's anchor). `measureCtx` must have the font set. */
    public static caretIndex(
        measureCtx: CanvasRenderingContext2D,
        text: string, fontSize: number, localX: number, localY: number, layout: CaretLayout,
    ): number {
        const lines = TextMeasure.visualLines(measureCtx, text, layout.wrap, layout.boxWidth);
        const lineBox = fontSize * layout.lineHeight;
        const row = Math.max(0, Math.min(lines.length - 1, Math.floor(localY / lineBox)));
        const line = lines[row];
        const lineWidth = measureCtx.measureText(line.text).width;
        const anchor =
            layout.textAlign === 'center' ? (layout.boxWidth - lineWidth) / 2
            : layout.textAlign === 'right' ? layout.boxWidth - lineWidth
            : 0;
        const relX = localX - anchor;
        if (relX <= 0) return line.start;
        for (let i = 1; i <= line.text.length; i++) {
            const prev = measureCtx.measureText(line.text.slice(0, i - 1)).width;
            const cur = measureCtx.measureText(line.text.slice(0, i)).width;
            if (relX < (prev + cur) / 2) return line.start + (i - 1);
        }
        return line.start + line.text.length;
    }

    /** Visual lines paired with their start offset in the raw string, so a visual (row, column)
     *  maps back to a real caret index. Wrapping mirrors {@link CanvasDraw.wrapLines} exactly. */
    private static visualLines(
        measureCtx: CanvasRenderingContext2D, text: string, wrap: boolean, maxWidth: number,
    ): { text: string; start: number }[] {
        if (!wrap) {
            const out: { text: string; start: number }[] = [];
            let start = 0;
            for (const line of text.split('\n')) {
                out.push({ text: line, start });
                start += line.length + 1; // +1 for the '\n'
            }
            return out;
        }
        const out: { text: string; start: number }[] = [];
        let paraStart = 0;
        for (const paragraph of text.split('\n')) {
            let line = '';
            let lineStart = paraStart;
            let wordStart = paraStart;
            for (const word of paragraph.split(' ')) {
                const test = line ? `${line} ${word}` : word;
                if (line && measureCtx.measureText(test).width > maxWidth) {
                    out.push({ text: line, start: lineStart });
                    line = word;
                    lineStart = wordStart;
                } else {
                    line = test;
                }
                wordStart += word.length + 1; // +1 for the space separator
            }
            out.push({ text: line, start: lineStart });
            paraStart += paragraph.length + 1; // +1 for the '\n'
        }
        return out;
    }

    /** Height a note needs to fit its wrapped text — see {@link NoteShapeDef.measureHeight}. */
    public measureNote(text: string, fontSize: number, width: number, font: Font = Font.Font1): number {
        this.applyFont(fontSize, font);
        return NoteShapeDef.measureHeight(this.ctx, text, fontSize, width);
    }

    /** Top padding that vertically centers a note's text — see {@link NoteShapeDef.textOffsetY}. */
    public noteTop(text: string, fontSize: number, width: number, height: number, font: Font = Font.Font1): number {
        this.applyFont(fontSize, font);
        return NoteShapeDef.textOffsetY(this.ctx, text, fontSize, width, height);
    }

    /** Top padding that aligns a caption in the editor overlay per `valign`, matching the
     *  canvas — see {@link CanvasDraw.labelOffsetY}. Floored at 0 so it never rides above. */
    public labelTop(
        text: string, fontSize: number, width: number, height: number, valign: VerticalAlign = 'middle', font: Font = Font.Font1,
    ): number {
        this.applyFont(fontSize, font);
        return Math.max(0, CanvasDraw.labelOffsetY(this.ctx, text, fontSize, width, height, valign));
    }
}
