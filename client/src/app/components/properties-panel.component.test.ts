import { Injector, runInInjectionContext, signal, type Signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { PropertiesPanelComponent } from './properties-panel.component';
import { UiStoreService } from '../state/ui-store.service';
import { CollabService } from '../collab/collab.service';
import { CANVAS_DOCUMENT, CLIPBOARD_CONTROLLER, SHAPE_REGISTRY, TEXT_MEASURE, TOOL_REGISTRY, UI_STORE } from '../di-tokens';
import { ShapeRegistry } from '../../shapes/shapeRegistry';
import { ToolRegistry } from '../../tools/toolRegistry';
import { UIStore } from '../../state/uiStore';
import type { ReorderOp } from '../../document/canvasDocument';
import type { Shape } from '../../model/types';
import { arrow, diamond, draw, ellipse, group, note, rect, text } from '../../test-support/shapeFactories';

/** Records the calls the panel forwards to the CanvasDocument, so specs can assert the
 *  per-shape patches it built without a real Yjs document. */
class FakeCanvasDocument {
    public readonly updateCalls: Array<Array<{ id: string; patch: Partial<Shape> }>> = [];
    public readonly reorderCalls: Array<{ ids: string[]; op: ReorderOp }> = [];
    public readonly groupCalls: string[][] = [];
    public readonly ungroupCalls: string[] = [];
    /** Set by a spec to control what groupShapes returns, mirroring the real
     *  "not groupable" (mixed parent, <2 shapes) -> null case. */
    public groupShapesReturns: string | null = 'new-group';

    public updateShapes(patches: Array<{ id: string; patch: Partial<Shape> }>): void {
        this.updateCalls.push(patches);
    }
    public reorderShapes(ids: string[], op: ReorderOp): void {
        this.reorderCalls.push({ ids, op });
    }
    public groupShapes(ids: string[]): string | null {
        this.groupCalls.push(ids);
        return this.groupShapesReturns;
    }
    public ungroup(id: string): void {
        this.ungroupCalls.push(id);
    }
}

class FakeClipboardController {
    public readonly duplicateCalls: Array<{ dx: number; dy: number }> = [];
    public duplicate(dx: number, dy: number): void {
        this.duplicateCalls.push({ dx, dy });
    }
}

/** Deterministic stand-in for TextMeasure so applyFontSize's re-measure is assertable
 *  without a real canvas 2d context. */
class FakeTextMeasure {
    public measureText(text: string, fontSize: number): { w: number; h: number } {
        return { w: text.length * fontSize, h: fontSize };
    }
    public measureTextWrapped(_text: string, fontSize: number, width: number): { w: number; h: number } {
        return { w: width, h: fontSize * 2 }; // deterministic stand-in; a real text re-wraps to width
    }
    public measureNote(_text: string, fontSize: number, width: number): number {
        return fontSize + width; // deterministic stand-in; a real note re-flows to its width
    }
}

class FakeCollabService {
    private readonly sig = signal<Shape[]>([]);
    public readonly shapes = this.sig.asReadonly();
    public setShapes(shapes: Shape[]): void {
        this.sig.set(shapes);
    }
}

/** The panel exposes its logic through protected members (template-facing). Specs reach them
 *  via bracket access, which TypeScript permits without a visibility error while keeping types. */
function setup() {
    const shapeRegistry = new ShapeRegistry();
    const toolRegistry = new ToolRegistry(shapeRegistry);
    const uiStore = new UIStore(toolRegistry);
    const doc = new FakeCanvasDocument();
    const clipboard = new FakeClipboardController();
    const collab = new FakeCollabService();

    const bootInjector = Injector.create({ providers: [{ provide: UI_STORE, useValue: uiStore }] });
    const uiStoreService = runInInjectionContext(bootInjector, () => new UiStoreService());

    const injector = Injector.create({
        providers: [
            { provide: SHAPE_REGISTRY, useValue: shapeRegistry },
            { provide: TOOL_REGISTRY, useValue: toolRegistry },
            { provide: TEXT_MEASURE, useValue: new FakeTextMeasure() },
            { provide: CANVAS_DOCUMENT, useValue: doc },
            { provide: CLIPBOARD_CONTROLLER, useValue: clipboard },
            { provide: UiStoreService, useValue: uiStoreService },
            { provide: CollabService, useValue: collab },
        ],
    });
    const component = runInInjectionContext(injector, () => new PropertiesPanelComponent());

    const setSelection = (shapes: Shape[]): void => {
        collab.setShapes(shapes);
        uiStore.getState().setSelection(shapes.map((s) => s.id));
    };

    return { component, uiStore, doc, clipboard, collab, setSelection };
}

/** Read the panel's current common style — apply* always writes it via the store. */
const style = (uiStore: UIStore) => uiStore.getState().style;

/** The one patch batch the panel forwarded, keyed by shape id for order-independent asserts. */
function lastPatches(doc: FakeCanvasDocument): Map<string, Partial<Shape>> {
    const batch = doc.updateCalls.at(-1) ?? [];
    return new Map(batch.map((p) => [p.id, p.patch]));
}

describe('PropertiesPanelComponent', () => {
    let ctx: ReturnType<typeof setup>;

    beforeEach(() => {
        ctx = setup();
    });

    // Bracket access keeps the protected computeds' Signal type intact.
    const selected = () => (ctx.component as unknown as { selected: Signal<Shape[]> })['selected']();

    describe('selection-derived computeds', () => {
        it('selected filters the shape list down to the current selection', () => {
            ctx.collab.setShapes([rect({ id: 'a' }), rect({ id: 'b' }), rect({ id: 'c' })]);
            ctx.uiStore.getState().setSelection(['a', 'c']);
            expect(selected().map((s) => s.id)).toEqual(['a', 'c']);
        });

        it('hasSelection / hasMultiSelection track the selection size', () => {
            const c = ctx.component as unknown as { hasSelection: Signal<boolean>; hasMultiSelection: Signal<boolean> };
            expect(c['hasSelection']()).toBe(false);
            expect(c['hasMultiSelection']()).toBe(false);

            ctx.setSelection([rect({ id: 'a' })]);
            expect(c['hasSelection']()).toBe(true);
            expect(c['hasMultiSelection']()).toBe(false);

            ctx.setSelection([rect({ id: 'a' }), rect({ id: 'b' })]);
            expect(c['hasMultiSelection']()).toBe(true);
        });

        it('hasLabel is true only when a selected shape carries a non-empty label', () => {
            const hasLabel = () => (ctx.component as unknown as { hasLabel: Signal<boolean> })['hasLabel']();
            ctx.setSelection([rect({ id: 'a' }), rect({ id: 'b' })]);
            expect(hasLabel()).toBe(false);

            ctx.setSelection([rect({ id: 'a', label: 'hi' }), rect({ id: 'b' })]);
            expect(hasLabel()).toBe(true);
        });

        it('hasLabel is true when a selected group\'s member carries a label, even though the group itself never does', () => {
            const hasLabel = () => (ctx.component as unknown as { hasLabel: Signal<boolean> })['hasLabel']();
            ctx.collab.setShapes([group({ id: 'g' }), rect({ id: 'r', parentId: 'g', label: 'hi' })]);
            ctx.uiStore.getState().setSelection(['g']);
            expect(hasLabel()).toBe(true);
        });
    });

    describe('mixed-vs-common value computeds', () => {
        const opacityPercent = () => (ctx.component as unknown as { opacityPercent: Signal<number> })['opacityPercent']();
        const selectedFontSize = () => (ctx.component as unknown as { selectedFontSize: Signal<number> })['selectedFontSize']();

        it('opacityPercent shows the common opacity, or 100 when empty or mixed', () => {
            expect(opacityPercent()).toBe(100); // empty selection

            ctx.setSelection([rect({ id: 'a', opacity: 0.5 }), rect({ id: 'b', opacity: 0.5 })]);
            expect(opacityPercent()).toBe(50);

            ctx.setSelection([rect({ id: 'a', opacity: 0.5 }), rect({ id: 'b', opacity: 0.8 })]);
            expect(opacityPercent()).toBe(100); // mixed collapses to 100
        });

        it('opacityPercent treats a missing opacity as fully opaque', () => {
            ctx.setSelection([rect({ id: 'a' }), rect({ id: 'b', opacity: 1 })]);
            expect(opacityPercent()).toBe(100);
        });

        it('opacityPercent reflects a selected group\'s members\' common opacity, not the container\'s own (unused) field', () => {
            ctx.collab.setShapes([
                group({ id: 'g' }),
                rect({ id: 'a', parentId: 'g', opacity: 0.5 }),
                rect({ id: 'b', parentId: 'g', opacity: 0.5 }),
            ]);
            ctx.uiStore.getState().setSelection(['g']);
            expect(opacityPercent()).toBe(50);
        });

        it('selectedFontSize shows the common size (resolved per shape against its own shape-type default), or the tool-default style value when empty or mixed', () => {
            expect(selectedFontSize()).toBe(18); // empty selection -> current tool-default style.fontSize

            ctx.setSelection([rect({ id: 'a', textOptions: { fontSize: 24 } }), rect({ id: 'b', textOptions: { fontSize: 24 } })]);
            expect(selectedFontSize()).toBe(24);

            ctx.setSelection([rect({ id: 'a', textOptions: { fontSize: 24 } }), rect({ id: 'b', textOptions: { fontSize: 32 } })]);
            expect(selectedFontSize()).toBe(18); // mixed collapses to the tool-default style value
        });

        it('selectedFontSize shows a selected group\'s members\' common size', () => {
            ctx.collab.setShapes([
                group({ id: 'g' }),
                rect({ id: 'a', parentId: 'g', textOptions: { fontSize: 24 } }),
                rect({ id: 'b', parentId: 'g', textOptions: { fontSize: 24 } }),
            ]);
            ctx.uiStore.getState().setSelection(['g']);
            expect(selectedFontSize()).toBe(24);
        });

        it('selectedHAlign / selectedVAlign fall back to the tool-default style when mixed', () => {
            const c = ctx.component as unknown as { selectedHAlign: Signal<string>; selectedVAlign: Signal<string> };
            ctx.setSelection([rect({ id: 'a', textOptions: { hAlign: 'left', vAlign: 'top' } }), rect({ id: 'b', textOptions: { hAlign: 'left', vAlign: 'top' } })]);
            expect(c['selectedHAlign']()).toBe('left');
            expect(c['selectedVAlign']()).toBe('top');

            ctx.setSelection([rect({ id: 'a', textOptions: { hAlign: 'left' } }), rect({ id: 'b', textOptions: { hAlign: 'right' } })]);
            expect(c['selectedHAlign']()).toBe('left'); // mixed collapses to style.hAlign
            expect(c['selectedVAlign']()).toBe('middle'); // both unset -> rectangle's own default, which agrees
        });
    });

    describe('flags & visibility', () => {
        it('visible is false with no selection while the select tool is armed', () => {
            const visible = () => (ctx.component as unknown as { visible: Signal<boolean> })['visible']();
            expect(visible()).toBe(false);
        });

        it('flags reflect the capabilities of the selected shapes', () => {
            const flags = () => (ctx.component as unknown as { flags: Signal<{ fill: boolean; ends: boolean }> })['flags']();
            ctx.setSelection([rect({ id: 'a' })]);
            expect(flags().fill).toBe(true); // a rectangle can be filled
            expect(flags().ends).toBe(false); // ...but has no endpoint caps

            ctx.setSelection([arrow({ id: 'x' })]);
            expect(flags().ends).toBe(true);
        });

        it('flags reflect a selected group\'s members\' capabilities, not the (capability-less) group container\'s', () => {
            const flags = () => (ctx.component as unknown as { flags: Signal<{ ends: boolean }> })['flags']();
            ctx.collab.setShapes([group({ id: 'g' }), arrow({ id: 'x', parentId: 'g' })]);
            ctx.uiStore.getState().setSelection(['g']);
            expect(flags().ends).toBe(true);
        });

        it('visible becomes true once there is a selection', () => {
            const visible = () => (ctx.component as unknown as { visible: Signal<boolean> })['visible']();
            ctx.setSelection([rect({ id: 'a' })]);
            expect(visible()).toBe(true);
        });
    });

    describe('style application', () => {
        // Bracket access to the protected apply* methods keeps their call signatures typed.
        const call = <T,>(name: string, arg: T): void => (ctx.component as unknown as Record<string, (a: T) => void>)[name](arg);

        it('applyStroke sets the common stroke and patches each shape by its type', () => {
            ctx.setSelection([rect({ id: 'r' }), text({ id: 't' }), arrow({ id: 'a' }), draw({ id: 'd' })]);
            call('applyStroke', '#f00');

            expect(style(ctx.uiStore).stroke).toBe('#f00');
            const patches = lastPatches(ctx.doc);
            expect(patches.get('r')).toEqual({ stroke: '#f00' });
            expect(patches.get('a')).toEqual({ stroke: '#f00' });
            expect(patches.get('d')).toEqual({ stroke: '#f00' });
            expect(patches.get('t')).toEqual({ color: '#f00' }); // text carries colour, not stroke
        });

        it('applyFill patches fillable shapes but skips notes and non-fill shapes', () => {
            ctx.setSelection([rect({ id: 'r' }), ellipse({ id: 'e' }), note({ id: 'n' }), arrow({ id: 'a' })]);
            call('applyFill', '#0f0');

            const patches = lastPatches(ctx.doc);
            expect(patches.get('r')).toEqual({ fill: '#0f0' });
            expect(patches.get('e')).toEqual({ fill: '#0f0' });
            expect(patches.has('n')).toBe(false);
            expect(patches.has('a')).toBe(false);
        });

        it('applyNoteFill only touches notes', () => {
            ctx.setSelection([note({ id: 'n' }), rect({ id: 'r' })]);
            call('applyNoteFill', '#abc');

            const patches = lastPatches(ctx.doc);
            expect(patches.get('n')).toEqual({ fill: '#abc' });
            expect(patches.has('r')).toBe(false);
        });

        it('applyStartCap / applyEndCap only touch arrows', () => {
            ctx.setSelection([arrow({ id: 'a' }), rect({ id: 'r' })]);
            call('applyStartCap', 'arrow');
            expect(lastPatches(ctx.doc).get('a')).toEqual({ startCap: 'arrow' });
            expect(lastPatches(ctx.doc).has('r')).toBe(false);

            call('applyEndCap', 'none');
            expect(lastPatches(ctx.doc).get('a')).toEqual({ endCap: 'none' });
        });

        it('applyEdges only touches rectangles and diamonds', () => {
            ctx.setSelection([rect({ id: 'r' }), diamond({ id: 'dm' }), ellipse({ id: 'e' })]);
            call('applyEdges', 'round');

            const patches = lastPatches(ctx.doc);
            expect(patches.get('r')).toEqual({ edges: 'round' });
            expect(patches.get('dm')).toEqual({ edges: 'round' });
            expect(patches.has('e')).toBe(false);
        });

        it('applyEdges cascades into a selected group\'s members, including nested groups, but never patches the group containers themselves', () => {
            // g1 (selected) contains rect r and nested group g2, which contains rect n.
            ctx.collab.setShapes([
                group({ id: 'g1' }),
                rect({ id: 'r', parentId: 'g1' }),
                group({ id: 'g2', parentId: 'g1' }),
                rect({ id: 'n', parentId: 'g2' }),
            ]);
            ctx.uiStore.getState().setSelection(['g1']);
            call('applyEdges', 'round');

            const patches = lastPatches(ctx.doc);
            expect(patches.get('r')).toEqual({ edges: 'round' });
            expect(patches.get('n')).toEqual({ edges: 'round' });
            expect(patches.has('g1')).toBe(false);
            expect(patches.has('g2')).toBe(false);
        });

        it('applyHAlign patches textOptions on every selected shape unconditionally — the same option now serves captions and body text alike', () => {
            ctx.setSelection([text({ id: 't' }), note({ id: 'n' }), rect({ id: 'r' }), arrow({ id: 'a' })]);
            call('applyHAlign', 'right');

            const patches = lastPatches(ctx.doc);
            expect(patches.get('t')).toEqual({ textOptions: { fontSize: 18, hAlign: 'right' } });
            expect(patches.get('n')).toEqual({ textOptions: { fontSize: 14, hAlign: 'right' } });
            expect(patches.get('r')).toEqual({ textOptions: { hAlign: 'right' } });
            expect(patches.get('a')).toEqual({ textOptions: { hAlign: 'right' } });
            expect(style(ctx.uiStore).hAlign).toBe('right');
        });

        it('applyFontSize re-measures text (w/h) and note (h), and patches textOptions unconditionally on every shape', () => {
            ctx.setSelection([text({ id: 't', text: 'abc' }), note({ id: 'n', text: 'note', w: 100 }), rect({ id: 'r' })]);
            call('applyFontSize', 10);

            const patches = lastPatches(ctx.doc);
            // FakeTextMeasure: text -> { w: len*size, h: size }; note height -> size + width.
            expect(patches.get('t')).toEqual({ textOptions: { fontSize: 10, hAlign: 'left' }, w: 30, h: 10 });
            expect(patches.get('n')).toEqual({ textOptions: { fontSize: 10, hAlign: 'left' }, h: 110 });
            expect(patches.get('r')).toEqual({ textOptions: { fontSize: 10 } });
        });

        it('onOpacityInput parses the slider value into a 0..1 opacity on every shape', () => {
            ctx.setSelection([rect({ id: 'r' }), arrow({ id: 'a' })]);
            const event = { target: { value: '40' } } as unknown as Event;
            (ctx.component as unknown as { onOpacityInput: (e: Event) => void })['onOpacityInput'](event);

            expect(style(ctx.uiStore).opacity).toBe(0.4);
            const patches = lastPatches(ctx.doc);
            expect(patches.get('r')).toEqual({ opacity: 0.4 });
            expect(patches.get('a')).toEqual({ opacity: 0.4 });
        });

        it('onOpacityInput cascades into a selected group\'s members, including nested groups', () => {
            // g1 (selected) contains rect r and nested group g2, which contains rect n.
            ctx.collab.setShapes([
                group({ id: 'g1' }),
                rect({ id: 'r', parentId: 'g1' }),
                group({ id: 'g2', parentId: 'g1' }),
                rect({ id: 'n', parentId: 'g2' }),
            ]);
            ctx.uiStore.getState().setSelection(['g1']);
            const event = { target: { value: '25' } } as unknown as Event;
            (ctx.component as unknown as { onOpacityInput: (e: Event) => void })['onOpacityInput'](event);

            const patches = lastPatches(ctx.doc);
            expect(patches.get('g1')).toEqual({ opacity: 0.25 });
            expect(patches.get('r')).toEqual({ opacity: 0.25 });
            expect(patches.get('g2')).toEqual({ opacity: 0.25 });
            expect(patches.get('n')).toEqual({ opacity: 0.25 });
        });

        it('updates the common style but issues no shape patch when nothing is selected', () => {
            call('applyStroke', '#123');
            expect(style(ctx.uiStore).stroke).toBe('#123');
            expect(ctx.doc.updateCalls).toHaveLength(0);
        });
    });

    describe('layer / duplicate actions', () => {
        it('reorder forwards the current selection and op to the document', () => {
            ctx.setSelection([rect({ id: 'a' }), rect({ id: 'b' })]);
            (ctx.component as unknown as { reorder: (op: ReorderOp) => void })['reorder']('toFront');

            expect(ctx.doc.reorderCalls).toEqual([{ ids: ['a', 'b'], op: 'toFront' }]);
        });

        it('duplicate delegates to the clipboard controller with the down-right offset', () => {
            (ctx.component as unknown as { duplicate: () => void })['duplicate']();
            expect(ctx.clipboard.duplicateCalls).toEqual([{ dx: 20, dy: 20 }]);
        });
    });

    describe('group / ungroup actions', () => {
        const canGroup = () => (ctx.component as unknown as { canGroup: Signal<boolean> })['canGroup']();
        const canUngroup = () => (ctx.component as unknown as { canUngroup: Signal<boolean> })['canUngroup']();

        it('canGroup is false for a single selected shape', () => {
            ctx.setSelection([rect({ id: 'a' })]);
            expect(canGroup()).toBe(false);
        });

        it('canGroup is true for multiple shapes sharing a parent', () => {
            ctx.setSelection([rect({ id: 'a' }), rect({ id: 'b' })]);
            expect(canGroup()).toBe(true);
        });

        it('canGroup is false when the selection spans different parents', () => {
            ctx.setSelection([rect({ id: 'a', parentId: 'p1' }), rect({ id: 'b', parentId: 'p2' })]);
            expect(canGroup()).toBe(false);
        });

        it('canUngroup is true when a group shape is selected', () => {
            ctx.setSelection([group({ id: 'g' })]);
            expect(canUngroup()).toBe(true);
        });

        it('canUngroup is false for a plain shape selection', () => {
            ctx.setSelection([rect({ id: 'a' })]);
            expect(canUngroup()).toBe(false);
        });

        it('group forwards the selection to the document and selects the returned group id', () => {
            ctx.setSelection([rect({ id: 'a' }), rect({ id: 'b' })]);
            ctx.doc.groupShapesReturns = 'G1';
            (ctx.component as unknown as { group: () => void })['group']();

            expect(ctx.doc.groupCalls).toEqual([['a', 'b']]);
            expect(ctx.uiStore.getState().selection).toEqual(['G1']);
        });

        it('group leaves the selection untouched when the document rejects it', () => {
            ctx.setSelection([rect({ id: 'a', parentId: 'p1' }), rect({ id: 'b', parentId: 'p2' })]);
            ctx.doc.groupShapesReturns = null;
            (ctx.component as unknown as { group: () => void })['group']();

            expect(ctx.uiStore.getState().selection).toEqual(['a', 'b']);
        });

        it('ungroup calls the document for every selected id', () => {
            ctx.setSelection([group({ id: 'g1' }), group({ id: 'g2' })]);
            (ctx.component as unknown as { ungroup: () => void })['ungroup']();

            expect(ctx.doc.ungroupCalls).toEqual(['g1', 'g2']);
        });
    });
});
