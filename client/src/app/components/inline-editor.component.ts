import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { UiStoreService } from '../state/ui-store.service';
import { CollabService } from '../collab/collab.service';
import { CANVAS_DOCUMENT } from '../di-tokens';
import { CameraMath } from '../../canvas/camera';
import { TEXT_LINE_HEIGHT } from '../../shapes/textShapeDef';
import type { TextShape } from '../../model/types';

// Shared offscreen context for measuring text extents.
const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d')!;

export function measureText(text: string, fontSize: number): { w: number; h: number } {
    measureCtx.font = `${fontSize}px Inter, system-ui, sans-serif`;
    const lines = text.split('\n');
    let w = 0;
    for (const line of lines) w = Math.max(w, measureCtx.measureText(line || ' ').width);
    const lineBox = fontSize * TEXT_LINE_HEIGHT;
    return { w: Math.max(20, w + 4), h: Math.max(lineBox, lines.length * lineBox) };
}

@Component({
    selector: 'app-inline-editor',
    standalone: true,
    templateUrl: './inline-editor.component.html',
    styleUrl: './inline-editor.component.scss',
})
export class InlineEditorComponent {
    private readonly ui = inject(UiStoreService);
    private readonly collab = inject(CollabService);
    private readonly canvasDocument = inject(CANVAS_DOCUMENT);
    private readonly taRef = viewChild<ElementRef<HTMLTextAreaElement>>('ta');

    protected readonly Math = Math;
    protected readonly lineHeight = TEXT_LINE_HEIGHT;

    protected readonly editingId = this.ui.select((s) => s.editingId);
    protected readonly camera = this.ui.select((s) => s.camera);
    protected readonly shapes = this.collab.shapes;

    protected readonly shape = computed(() => {
        const id = this.editingId();
        const s = this.shapes().find((sh) => sh.id === id);
        return s && (s.type === 'text' || s.type === 'note') ? s : null;
    });
    protected readonly pos = computed(() => {
        const s = this.shape();
        return s ? CameraMath.worldToScreen(s.x, s.y, this.camera()) : { x: 0, y: 0 };
    });

    constructor() {
        // Focus (and select) the editor when it opens, deferred to the next frame — see
        // the React InlineEditor for why this must be deferred past pointerdown's default
        // blur (click-to-place then type must not commit-delete an empty text shape).
        //
        // Keyed on `editingId()` alone (not `shape()`): the effect must fire once when
        // editing starts, not on every keystroke — `shape()` changes on each edit since
        // it's derived from the synced shape list, and re-selecting on every keystroke
        // would select-all the textarea, so the next typed char replaces everything.
        let raf = 0;
        effect(() => {
            const id = this.editingId();
            cancelAnimationFrame(raf);
            if (!id) return;
            raf = requestAnimationFrame(() => {
                const el = this.taRef()?.nativeElement;
                const s = this.shape();
                if (el) {
                    el.focus();
                    el.select();
                    if (s?.type === 'text') {
                        el.style.height = 'auto';
                        el.style.height = `${el.scrollHeight}px`;
                    }
                }
            });
        });
    }

    protected onChangeText(shape: TextShape, e: Event): void {
        const text = (e.target as HTMLTextAreaElement).value;
        const { w, h } = measureText(text, shape.fontSize);
        this.canvasDocument.updateShape(shape.id, { text, w, h } as Partial<TextShape>);
    }

    protected onChangeNote(shape: { id: string }, e: Event): void {
        this.canvasDocument.updateShape(shape.id, { text: (e.target as HTMLTextAreaElement).value });
    }

    protected commit(shape: { id: string; type: string; text?: string }): void {
        if (shape.type === 'text' && (shape.text ?? '').trim() === '') {
            this.canvasDocument.deleteShapes([shape.id]);
        }
        this.ui.snapshot.setEditing(null);
    }

    protected onKeyDown(e: KeyboardEvent, shape: { id: string; type: string; text?: string }): void {
        if (e.key === 'Escape') {
            e.preventDefault();
            this.commit(shape);
        }
        e.stopPropagation();
    }
}
