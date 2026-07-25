import { Component, computed, inject } from '@angular/core';
import { UiStoreService } from '../state/ui-store.service';
import { CollabService } from '../collab/collab.service';
import { CANVAS_DOCUMENT, SHAPE_REGISTRY, TOOL_REGISTRY, TEXT_MEASURE, CLIPBOARD_CONTROLLER } from '../di-tokens';
import type { ReorderOp } from '../../document/canvasDocument';
import { Font, type Color, type CornerStyle, type EndpointCap, type FillStyle, type Shape, type StrokeStyle, type TextAlign, type VerticalAlign } from '../../model/types';
import type { Style } from '../../state/uiStore';
import { panelFlags } from '../../util/panelCapabilities';
import { STROKE_COLORS, FILL_COLORS, NOTE_COLORS, WIDTHS, CAPS, TEXT_ALIGNS, VERTICAL_ALIGNS, EDGES, STROKE_STYLES, FILL_STYLES } from '../../util/palette';
import { FONT_SIZE_LABELS, FONTS, FontUtil } from '../../util/fontUtil';
import { TextOptionsUtil, type ResolvedTextOptions } from '../../util/textOptions';
import { SceneTree } from '../../util/sceneTree';
import { LayerIconComponent } from './layer-icon.component';
import { AlignIconComponent } from './align-icon.component';
import { ValignIconComponent } from './valign-icon.component';
import { AlignShapesIconComponent } from './align-shapes-icon.component';
import { DuplicateIconComponent } from './duplicate-icon.component';
import { GroupIconComponent } from './group-icon.component';
import { UngroupIconComponent } from './ungroup-icon.component';
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
    imports: [
        LayerIconComponent,
        AlignIconComponent,
        ValignIconComponent,
        AlignShapesIconComponent,
        DuplicateIconComponent,
        GroupIconComponent,
        UngroupIconComponent,
    ],
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
    protected readonly fonts = FONTS;
    protected readonly fontSizeLabels = FONT_SIZE_LABELS;
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
    /** Mirrors {@link CanvasDocument.groupShapes}'s own requirement (≥2 shapes, shared parent)
     *  so the button only appears enabled when clicking it would actually do something. */
    protected readonly canGroup = computed(() => {
        const selected = this.selected();
        if (selected.length < 2) return false;
        const parentId = selected[0].parentId;
        return selected.every((s) => (s.parentId ?? undefined) === (parentId ?? undefined));
    });
    protected readonly canUngroup = computed(() => this.selected().some((s) => s.type === 'group'));
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
    protected readonly visible = computed(() => {
        const f = this.flags();
        return this.hasSelection() || f.stroke || f.fill || f.width || f.ends || f.note || f.text || !!f.edges || !!f.strokeStyle || !!f.fillStyle || !!f.label;
    });
    /** Whether the shared text-options section applies: a shape with body text (text/note),
     *  or any selected shape that carries a caption capability and one is already typed. */
    protected readonly showTextOptions = computed(() => {
        const f = this.flags();
        return !!f.text || (!!f.label && this.hasLabel());
    });

    /** The selection's common value for a style property, read off each selected shape
     *  (shapes that don't carry the property are ignored), or the global "next new shape"
     *  style when nothing is selected, no selected shape carries it, or the values differ. */
    private selectedCommon<K extends keyof Style>(key: K, getter: (s: Shape) => Style[K] | undefined): Style[K] {
        const values: Style[K][] = [];
        for (const s of this.selected()) {
            const v = getter(s);
            if (v !== undefined) values.push(v);
        }
        if (!values.length) return this.style()[key];
        const first = values[0];
        return values.every((v) => v === first) ? first : this.style()[key];
    }
    protected readonly selectedStroke = computed(() =>
        this.selectedCommon('stroke', (s) => ('stroke' in s ? s.stroke : s.type === 'text' ? s.color : undefined)),
    );
    protected readonly selectedFill = computed(() => this.selectedCommon('fill', (s) => ('fill' in s && s.type !== 'note' ? s.fill : undefined)));
    protected readonly selectedFillStyle = computed(() => this.selectedCommon('fillStyle', (s) => ('fillStyle' in s ? s.fillStyle : undefined)));
    protected readonly selectedStrokeWidth = computed(() => this.selectedCommon('strokeWidth', (s) => ('strokeWidth' in s ? s.strokeWidth : undefined)));
    protected readonly selectedStrokeStyle = computed(() => this.selectedCommon('strokeStyle', (s) => ('strokeStyle' in s ? s.strokeStyle : undefined)));
    protected readonly selectedEdges = computed(() => this.selectedCommon('edges', (s) => ('edges' in s ? s.edges : undefined)));
    protected readonly selectedStartCap = computed(() => this.selectedCommon('startCap', (s) => (s.type === 'arrow' ? s.startCap : undefined)));
    protected readonly selectedEndCap = computed(() => this.selectedCommon('endCap', (s) => (s.type === 'arrow' ? s.endCap : undefined)));
    protected readonly selectedNoteFill = computed(() => this.selectedCommon('noteFill', (s) => (s.type === 'note' ? s.fill : undefined)));
    /** The selection's common font size/family/alignment for the shared text-options
     *  section — resolved per shape against its own shape-type default (see
     *  {@link TextOptionsUtil.resolve}), so an untouched shape still reads as its
     *  effective value rather than as "unset". */
    protected readonly selectedFontSize = computed(() => this.selectedCommon('fontSize', (s) => this.resolvedFor(s).fontSize));
    protected readonly selectedFontFamily = computed(() => this.selectedCommon('fontFamily', (s) => this.resolvedFor(s).fontFamily));
    protected readonly selectedHAlign = computed(() => this.selectedCommon('hAlign', (s) => this.resolvedFor(s).hAlign));
    protected readonly selectedVAlign = computed(() => this.selectedCommon('vAlign', (s) => this.resolvedFor(s).vAlign));
    /** Font size scale for the currently selected font family — each font carries its own. */
    protected readonly fontSizes = computed(() => FontUtil.sizesFor(this.selectedFontFamily()));

    private resolvedFor(s: Shape): ResolvedTextOptions {
        return TextOptionsUtil.resolve(s.textOptions, this.shapeRegistry.getDefinition(s).defaultTextOptions);
    }

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
        // a note keeps its fixed width but grows/shrinks its height to fit. The field lives
        // on every shape's textOptions (caption or body alike), so the patch itself is
        // unconditional; only the re-measure is type-specific.
        this.apply({ fontSize: size }, (s) => {
            const textOptions = { ...s.textOptions, fontSize: size };
            if (s.type === 'text') {
                const font = this.resolvedFor(s).fontFamily;
                const { w, h } = s.wrap
                    ? this.textMeasure.measureTextWrapped(s.text, size, s.w, font)
                    : this.textMeasure.measureText(s.text, size, font);
                return { textOptions, w, h };
            }
            if (s.type === 'note') {
                const font = this.resolvedFor(s).fontFamily;
                return { textOptions, h: this.textMeasure.measureNote(s.text, size, s.w, font) };
            }
            return { textOptions };
        });
    }
    protected applyFontFamily(font: Font): void {
        // Switching family changes glyph widths, so re-measure exactly like applyFontSize does.
        this.apply({ fontFamily: font }, (s) => {
            const textOptions = { ...s.textOptions, fontFamily: font };
            if (s.type === 'text') {
                const size = this.resolvedFor(s).fontSize;
                const { w, h } = s.wrap
                    ? this.textMeasure.measureTextWrapped(s.text, size, s.w, font)
                    : this.textMeasure.measureText(s.text, size, font);
                return { textOptions, w, h };
            }
            if (s.type === 'note') {
                const size = this.resolvedFor(s).fontSize;
                return { textOptions, h: this.textMeasure.measureNote(s.text, size, s.w, font) };
            }
            return { textOptions };
        });
    }
    protected applyHAlign(a: TextAlign): void {
        this.apply({ hAlign: a }, (s) => ({ textOptions: { ...s.textOptions, hAlign: a } }));
    }
    protected applyVAlign(a: VerticalAlign): void {
        this.apply({ vAlign: a }, (s) => ({ textOptions: { ...s.textOptions, vAlign: a } }));
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
    protected group(): void {
        const groupId = this.canvasDocument.groupShapes(this.selection());
        if (groupId) this.ui.snapshot.setSelection([groupId]);
    }
    protected ungroup(): void {
        // Mirrors the Ctrl+Shift+G shortcut: ungroup every selected id that is a
        // group; ungroup() is a no-op for ids that aren't, so this is safe to call
        // over a mixed selection.
        for (const id of this.selection()) this.canvasDocument.ungroup(id);
    }
}
