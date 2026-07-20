import { Component, computed, inject } from '@angular/core';
import { UiStoreService } from '../state/ui-store.service';
import { CollabService } from '../collab/collab.service';
import { CANVAS_DOCUMENT, SHAPE_REGISTRY, TOOL_REGISTRY, TEXT_MEASURE } from '../di-tokens';
import type { ReorderOp } from '../../document/canvasDocument';
import type { CornerStyle, EndpointCap, Shape, TextAlign } from '../../model/types';
import type { Style } from '../../state/uiStore';
import { panelFlags } from '../../util/panelCapabilities';
import { STROKE_COLORS, FILL_COLORS, NOTE_COLORS, WIDTHS, CAPS, FONT_SIZES, TEXT_ALIGNS, EDGES } from '../../util/palette';
import { LayerIconComponent } from './layer-icon.component';
import { AlignIconComponent } from './align-icon.component';

const LAYER_OPS: { op: ReorderOp; label: string; shortcut: string }[] = [
    { op: 'toBack', label: 'Send to back', shortcut: 'Ctrl+Shift+[' },
    { op: 'backward', label: 'Send backward', shortcut: 'Ctrl+[' },
    { op: 'forward', label: 'Bring forward', shortcut: 'Ctrl+]' },
    { op: 'toFront', label: 'Bring to front', shortcut: 'Ctrl+Shift+]' },
];

@Component({
    selector: 'app-properties-panel',
    standalone: true,
    imports: [LayerIconComponent, AlignIconComponent],
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

    protected readonly strokeColors = STROKE_COLORS;
    protected readonly fillColors = FILL_COLORS;
    protected readonly noteColors = NOTE_COLORS;
    protected readonly widths = WIDTHS;
    protected readonly caps = CAPS;
    protected readonly fontSizes = FONT_SIZES;
    protected readonly textAligns = TEXT_ALIGNS;
    protected readonly edges = EDGES;
    protected readonly layerOps = LAYER_OPS;

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
    protected readonly visible = computed(() => {
        const f = this.flags();
        return this.hasSelection() || f.stroke || f.fill || f.width || f.ends || f.note || f.text || !!f.edges;
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

    protected applyStroke(c: string): void {
        this.apply({ stroke: c }, (s) => ('stroke' in s ? { stroke: c } : s.type === 'text' ? { color: c } : null));
    }
    protected applyFill(c: string): void {
        this.apply({ fill: c }, (s) => ('fill' in s && s.type !== 'note' ? { fill: c } : null));
    }
    protected applyWidth(w: number): void {
        this.apply({ strokeWidth: w }, (s) => ('strokeWidth' in s ? { strokeWidth: w } : null));
    }
    protected applyStartCap(c: EndpointCap): void {
        this.apply({ startCap: c }, (s) => (s.type === 'arrow' ? { startCap: c } : null));
    }
    protected applyEndCap(c: EndpointCap): void {
        this.apply({ endCap: c }, (s) => (s.type === 'arrow' ? { endCap: c } : null));
    }
    protected applyNoteFill(c: string): void {
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
    protected applyTextAlign(a: TextAlign): void {
        this.apply({ textAlign: a }, (s) => (s.type === 'text' || s.type === 'note' ? { textAlign: a } : null));
    }
    protected applyEdges(e: CornerStyle): void {
        this.apply({ edges: e }, (s) => (s.type === 'rectangle' || s.type === 'diamond' ? { edges: e } : null));
    }
    protected reorder(op: ReorderOp): void {
        this.canvasDocument.reorderShapes(this.selection(), op);
    }
}
