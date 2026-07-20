import { TEXT_LINE_HEIGHT } from '../shapes/textShapeDef';
import { NoteShapeDef } from '../shapes/noteShapeDef';

/** Text metrics computed off a single shared offscreen canvas. Used by the inline editor
 *  and the properties panel to auto-size text/note boxes identically to the canvas render. */
export class TextMeasure {
    private readonly ctx = document.createElement('canvas').getContext('2d')!;

    private applyFont(fontSize: number): void {
        this.ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
    }

    /** Width/height a text shape needs to fit `text` at `fontSize`. */
    public measureText(text: string, fontSize: number): { w: number; h: number } {
        this.applyFont(fontSize);
        const lines = text.split('\n');
        let w = 0;
        for (const line of lines) w = Math.max(w, this.ctx.measureText(line || ' ').width);
        const lineBox = fontSize * TEXT_LINE_HEIGHT;
        return { w: Math.max(20, w + 4), h: Math.max(lineBox, lines.length * lineBox) };
    }

    /** Height a note needs to fit its wrapped text — see {@link NoteShapeDef.measureHeight}. */
    public measureNote(text: string, fontSize: number, width: number): number {
        this.applyFont(fontSize);
        return NoteShapeDef.measureHeight(this.ctx, text, fontSize, width);
    }

    /** Top padding that vertically centers a note's text — see {@link NoteShapeDef.textOffsetY}. */
    public noteTop(text: string, fontSize: number, width: number, height: number): number {
        this.applyFont(fontSize);
        return NoteShapeDef.textOffsetY(this.ctx, text, fontSize, width, height);
    }
}
