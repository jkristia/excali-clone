import { Component, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { UiStoreService } from '../state/ui-store.service';
import { CollabService } from '../collab/collab.service';
import { CANVAS_DOCUMENT, SHAPE_REGISTRY, TEXT_MEASURE } from '../di-tokens';
import { CameraMath } from '../../canvas/camera';
import { TEXT_LINE_HEIGHT } from '../../shapes/textShapeDef';
import { NOTE_PADDING } from '../../shapes/noteShapeDef';
import { CanvasDraw } from '../../util/canvasDraw';
import type { NoteShape, Shape, TextAlign, TextShape } from '../../model/types';

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
    private readonly shapeRegistry = inject(SHAPE_REGISTRY);
    private readonly textMeasure = inject(TEXT_MEASURE);
    private readonly taRef = viewChild<ElementRef<HTMLTextAreaElement>>('ta');

    protected readonly Math = Math;
    protected readonly lineHeight = TEXT_LINE_HEIGHT;

    protected readonly editingId = this.ui.select((s) => s.editingId);
    protected readonly camera = this.ui.select((s) => s.camera);
    protected readonly shapes = this.collab.shapes;

    protected readonly shape = computed(() => {
        const id = this.editingId();
        return this.shapes().find((sh) => sh.id === id) ?? null;
    });
    /** True for a shape edited via its caption (anything but text/note, which edit body text). */
    protected readonly isLabel = computed(() => {
        const s = this.shape();
        return !!s && s.type !== 'text' && s.type !== 'note';
    });
    /** Shape bounds — the overlay's anchor and size. For text/note this equals x/y/w/h;
     *  for arrow/draw (no top-left x/y or w/h) it's the axis-aligned box the caption fills. */
    protected readonly box = computed(() => {
        const s = this.shape();
        return s ? this.shapeRegistry.getBounds(s) : null;
    });
    protected readonly labelFontSize = computed(() => this.shape()?.labelFontSize ?? 16);
    protected readonly pos = computed(() => {
        const b = this.box();
        return b ? CameraMath.worldToScreen(b.x, b.y, this.camera()) : { x: 0, y: 0 };
    });
    /** Zoom scale plus, for a rotated shape, a rotation about its center so the
     *  <textarea> overlay lines up with the rotated canvas shape. */
    protected readonly transform = computed(() => {
        const b = this.box();
        const zoom = this.camera().zoom;
        const rot = this.shape()?.rotation ?? 0;
        if (!b || !rot) return `scale(${zoom})`;
        return `scale(${zoom}) translate(${b.w / 2}px, ${b.h / 2}px) rotate(${rot}rad) translate(${-b.w / 2}px, ${-b.h / 2}px)`;
    });
    /** Top padding that vertically centers note text, mirroring the canvas render so the
     *  text doesn't jump when editing ends. */
    protected readonly noteTop = computed(() => {
        const s = this.shape();
        return s && s.type === 'note' ? this.textMeasure.noteTop(s.text, s.fontSize, s.w, s.h) : NOTE_PADDING;
    });
    /** Top padding that aligns a caption in its box per its vertical align, mirroring the canvas. */
    protected readonly labelTop = computed(() => {
        const s = this.shape();
        const b = this.box();
        return s && b ? this.textMeasure.labelTop(s.label ?? '', s.labelFontSize ?? 16, b.w, b.h, s.labelVAlign ?? 'middle') : 0;
    });
    /** Caption horizontal alignment for the overlay's `text-align`, mirroring the canvas. */
    protected readonly labelAlign = computed<TextAlign>(() => this.shape()?.labelHAlign ?? 'center');
    protected readonly labelPadding = CanvasDraw.LABEL_PADDING;

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
        const el = e.target as HTMLTextAreaElement;
        const text = el.value;
        const { w, h } = this.textMeasure.measureText(text, shape.fontSize);
        this.canvasDocument.updateShape(shape.id, { text, w, h } as Partial<TextShape>);
        // Height is set imperatively (no style binding), so grow the textarea as
        // lines are added — otherwise a new last line stays hidden until reopen.
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }

    protected onChangeNote(shape: NoteShape, e: Event): void {
        const text = (e.target as HTMLTextAreaElement).value;
        // Grow/shrink the note to fit its text so nothing overflows the box; the `h`
        // binding resizes the textarea in step. Notes keep their fixed width.
        const h = this.textMeasure.measureNote(text, shape.fontSize, shape.w);
        this.canvasDocument.updateShape(shape.id, { text, h } as Partial<NoteShape>);
    }

    protected onChangeLabel(shape: Shape, e: Event): void {
        // Caption is constrained to the existing box, so only the label changes — no resize.
        const label = (e.target as HTMLTextAreaElement).value;
        this.canvasDocument.updateShape(shape.id, { label } as Partial<Shape>);
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
