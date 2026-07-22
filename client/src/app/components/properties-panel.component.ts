import { Component, computed, inject } from '@angular/core';
import { UiStoreService } from '../state/ui-store.service';
import { CollabService } from '../collab/collab.service';
import { CANVAS_DOCUMENT, SHAPE_REGISTRY, TOOL_REGISTRY, TEXT_MEASURE, CLIPBOARD_CONTROLLER } from '../di-tokens';
import type { ReorderOp } from '../../document/canvasDocument';
import type { Color, CornerStyle, EndpointCap, FillStyle, Shape, StrokeStyle, TextAlign, VerticalAlign } from '../../model/types';
import type { Style } from '../../state/uiStore';
import { panelFlags } from '../../util/panelCapabilities';
import { STROKE_COLORS, FILL_COLORS, NOTE_COLORS, WIDTHS, CAPS, FONT_SIZES, TEXT_ALIGNS, VERTICAL_ALIGNS, EDGES, STROKE_STYLES, FILL_STYLES } from '../../util/palette';
import { SceneTree } from '../../util/sceneTree';
import { LayerIconComponent } from './layer-icon.component';
import { AlignIconComponent } from './align-icon.component';
import { ValignIconComponent } from './valign-icon.component';
import { AlignShapesIconComponent } from './align-shapes-icon.component';
import { DuplicateIconComponent } from './duplicate-icon.component';
import { ShapeAligner, type AlignOp } from '../../util/shapeAligner';

/** World-space offset applied to each duplicate, down-right from its source. */
const DUPLICATE_OFFSET = 20;

const LAYER_OPS: { op: ReorderOp; label: string; shortcut: string }[] = [
    { op: 'toBack', label: 'Send to back', shortcut: 'Ctrl+Shift+[' },
    { op: 'backward', label: 'Send backward', shortcut: 'Ctrl+[' },
    { op: 'forward', label: 'Bring forward', shortcut: 'Ctrl+]' },
    { op: 'toFront', label: 'Bring to front', shortcut: 'Ctrl+Shift+]' },
];

const ALIGN_OPS: { op: AlignOp; label: string }[] = [
    { op: 'left', label: 'Align left' },
    { op: 'hcenter', label: 'Align horizontal centers' },
    { op: 'right', label: 'Align right' },
    { op: 'top', label: 'Align top' },
    { op: 'vcenter', label: 'Align vertical centers' },
    { op: 'bottom', label: 'Align bottom' },
];

@Component({
    selector: 'app-properties-panel',
    standalone: true,
    imports: [LayerIconComponent, AlignIconComponent, ValignIconComponent, AlignShapesIconComponent, DuplicateIconComponent],
    templateUrl: './properties-panel.component.html',
    styleUrl: './properties-panel.component.scss',
})
export class PropertiesPanelComponent {
    private readonly ui = inject(UiStoreService);
    private readonly collab = inject(CollabService);
    private readonly canvasDocument = inject(CANVAS_DOCUMENT);
    private readonly toolRegistry = inject(TOOL_REGISTRY);
    private readonly shapeRegistry = inject(SHAPE_REGISTRY);
    private readonly textMeasure = inject(TEXT_MEASURE);
    private readonly clipboard = inject(CLIPBOARD_CONTROLLER);
    private readonly aligner = new ShapeAligner(this.shapeRegistry);

    protected readonly strokeColors = STROKE_COLORS;
    protected readonly fillColors = FILL_COLORS;
    protected readonly noteColors = NOTE_COLORS;
    protected readonly widths = WIDTHS;
    protected readonly strokeStyles = STROKE_STYLES;
    protected readonly fillStyles = FILL_STYLES;
    protected readonly caps = CAPS;
    protected readonly fontSizes = FONT_SIZES;
    protected readonly textAligns = TEXT_ALIGNS;
    protected readonly verticalAligns = VERTICAL_ALIGNS;
    protected readonly edges = EDGES;
    protected readonly layerOps = LAYER_OPS;
    protected readonly alignOps = ALIGN_OPS;

    protected readonly tool = this.ui.select((s) => s.tool);
    protected readonly style = this.ui.select((s) => s.style);
    protected readonly selection = this.ui.select((s) => s.selection);
    protected readonly shapes = this.collab.shapes;

    protected readonly selected = computed(() => {
        const ids = new Set(this.selection());
        return this.shapes().filter((s) => ids.has(s.id));
    });
    protected readonly flags = computed(() => panelFlags(this.toolRegistry, this.shapeRegistry, this.tool(), this.selected()));
    protected readonly hasSelection = computed(() => this.selected().length > 0);
    protected readonly hasMultiSelection = computed(() => this.selected().length > 1);
    /** True when at least one selected shape carries a non-empty caption. The caption styling
     *  controls (size/alignment) only apply once a label exists — a captionless shape hides them. */
    protected readonly hasLabel = computed(() => this.selected().some((s) => (s.label ?? '') !== ''));
    /** Slider position (0–100): the selection's common opacity, or 100 when it is mixed. */
    protected readonly opacityPercent = computed(() => {
        const selected = this.selected();
        if (!selected.length) return 100;
        const first = Math.round((selected[0].opacity ?? 1) * 100);
        return selected.every((s) => Math.round((s.opacity ?? 1) * 100) === first) ? first : 100;
    });
    /** The selection's common caption font size, or the 'S' default (16) when empty/mixed. */
    protected readonly labelFontSize = computed(() => {
        const selected = this.selected();
        if (!selected.length) return 16;
        const first = selected[0].labelFontSize ?? 16;
        return selected.every((s) => (s.labelFontSize ?? 16) === first) ? first : 16;
    });
    /** The selection's common caption horizontal alignment, or 'center' when empty/mixed. */
    protected readonly labelAlign = computed<TextAlign>(() => {
        const selected = this.selected();
        if (!selected.length) return 'center';
        const first = selected[0].labelHAlign ?? 'center';
        return selected.every((s) => (s.labelHAlign ?? 'center') === first) ? first : 'center';
    });
    /** The selection's common caption vertical alignment, or 'middle' when empty/mixed. */
    protected readonly labelVAlign = computed<VerticalAlign>(() => {
        const selected = this.selected();
        if (!selected.length) return 'middle';
        const first = selected[0].labelVAlign ?? 'middle';
        return selected.every((s) => (s.labelVAlign ?? 'middle') === first) ? first : 'middle';
    });
    protected readonly visible = computed(() => {
        const f = this.flags();
        return this.hasSelection() || f.stroke || f.fill || f.width || f.ends || f.note || f.text || !!f.edges || !!f.strokeStyle || !!f.fillStyle || !!f.label;
    });

    private apply(patch: Partial<Style>, shapePatch: (s: Shape) => Partial<Shape> | null): void {
        this.ui.snapshot.setStyle(patch);
        const selected = this.selected();
        if (selected.length) {
            const patches = selected
                .map((s) => ({ id: s.id, patch: shapePatch(s) }))
                .filter((p): p is { id: string; patch: Partial<Shape> } => p.patch !== null);
            if (patches.length) this.canvasDocument.updateShapes(patches);
        }
    }

    protected applyStroke(c: Color): void {
        this.apply({ stroke: c }, (s) => ('stroke' in s ? { stroke: c } : s.type === 'text' ? { color: c } : null));
    }
    protected applyFill(c: Color): void {
        this.apply({ fill: c }, (s) => ('fill' in s && s.type !== 'note' ? { fill: c } : null));
    }
    protected applyWidth(w: number): void {
        this.apply({ strokeWidth: w }, (s) => ('strokeWidth' in s ? { strokeWidth: w } : null));
    }
    protected applyStrokeStyle(style: StrokeStyle): void {
        this.apply({ strokeStyle: style }, (s) => ('strokeWidth' in s ? { strokeStyle: style } : null));
    }
    protected applyFillStyle(style: FillStyle): void {
        this.apply({ fillStyle: style }, (s) => ('fill' in s && s.type !== 'note' ? { fillStyle: style } : null));
    }
    protected applyStartCap(c: EndpointCap): void {
        this.apply({ startCap: c }, (s) => (s.type === 'arrow' ? { startCap: c } : null));
    }
    protected applyEndCap(c: EndpointCap): void {
        this.apply({ endCap: c }, (s) => (s.type === 'arrow' ? { endCap: c } : null));
    }
    protected applyNoteFill(c: Color): void {
        this.apply({ noteFill: c }, (s) => (s.type === 'note' ? { fill: c } : null));
    }
    protected applyFontSize(size: number): void {
        // Both text and notes auto-size to their content, so their box must be re-measured —
        // the same helpers the inline editor runs on every keystroke. Text grows w/h freely;
        // a note keeps its fixed width but grows/shrinks its height to fit.
        this.apply({ fontSize: size }, (s) => {
            if (s.type === 'text') {
                const { w, h } = this.textMeasure.measureText(s.text, size);
                return { fontSize: size, w, h };
            }
            return s.type === 'note' ? { fontSize: size, h: this.textMeasure.measureNote(s.text, size, s.w) } : null;
        });
    }
    protected applyLabelFontSize(size: number): void {
        // Caption font size lives on BaseShape (any captioned shape), so the patch is
        // unconditional — no per-type guard needed, like opacity.
        this.apply({ labelFontSize: size }, () => ({ labelFontSize: size }));
    }
    protected applyLabelAlign(a: TextAlign): void {
        // Only the box shapes gate the control (labelAlign capability), but the field lives
        // on BaseShape, so the patch is unconditional — arrow/draw simply ignore it on render.
        this.apply({ labelHAlign: a }, () => ({ labelHAlign: a }));
    }
    protected applyLabelVAlign(a: VerticalAlign): void {
        this.apply({ labelVAlign: a }, () => ({ labelVAlign: a }));
    }
    protected applyTextAlign(a: TextAlign): void {
        this.apply({ textAlign: a }, (s) => (s.type === 'text' || s.type === 'note' ? { textAlign: a } : null));
    }
    protected applyEdges(e: CornerStyle): void {
        this.apply({ edges: e }, (s) => (s.type === 'rectangle' || s.type === 'diamond' ? { edges: e } : null));
    }
    protected onOpacityInput(event: Event): void {
        const target = event.target as HTMLInputElement;
        const opacity = Number(target.value) / 100;
        this.ui.snapshot.setStyle({ opacity });
        // A selected group carries no render of its own — opacity only has a visible
        // effect on its (possibly nested) leaf members, so walk each selected id's whole
        // subtree rather than patching just the directly-selected shapes.
        const allShapes = this.shapes();
        const ids = new Set(this.selection().flatMap((id) => SceneTree.subtreeIds(allShapes, id)));
        if (ids.size) this.canvasDocument.updateShapes([...ids].map((id) => ({ id, patch: { opacity } })));
    }
    protected reorder(op: ReorderOp): void {
        this.canvasDocument.reorderShapes(this.selection(), op);
    }
    protected align(op: AlignOp): void {
        const patches = this.aligner.align(this.shapes(), this.selection(), op);
        if (patches.length) this.canvasDocument.updateShapes(patches);
    }
    protected duplicate(): void {
        this.clipboard.duplicate(DUPLICATE_OFFSET, DUPLICATE_OFFSET);
    }
}
