import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardController } from './clipboardController';
import { UIStore } from '../state/uiStore';
import { ToolRegistry } from '../tools/toolRegistry';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import type { CanvasDocument } from '../document/canvasDocument';
import type { Shape } from '../model/types';
import { rect, ellipse } from '../test-support/shapeFactories';

/** Minimal in-memory stand-in for CanvasDocument's shape store. */
class FakeDoc {
    public readonly shapes = new Map<string, Shape>();
    public readonly added: Shape[][] = [];

    public seed(shapes: Shape[]): void {
        for (const s of shapes) this.shapes.set(s.id, s);
    }
    public getShape(id: string): Shape | null {
        return this.shapes.get(id) ?? null;
    }
    public topZ(): number {
        let max = 0;
        for (const s of this.shapes.values()) if (s.z > max) max = s.z;
        return max;
    }
    public addShapes(shapes: Shape[]): void {
        this.added.push(shapes);
        for (const s of shapes) this.shapes.set(s.id, s);
    }
}

const shapeRegistry = new ShapeRegistry();
let uiStore: UIStore;
let doc: FakeDoc;
let clipboard: ClipboardController;

function makeClipboard(author = 'me'): ClipboardController {
    return new ClipboardController(
        uiStore,
        doc as unknown as CanvasDocument,
        shapeRegistry,
        () => author,
    );
}

beforeEach(() => {
    uiStore = new UIStore(new ToolRegistry(shapeRegistry));
    doc = new FakeDoc();
    clipboard = makeClipboard();
    vi.restoreAllMocks();
});

describe('ClipboardController', () => {
    it('starts empty', () => {
        expect(clipboard.hasContents()).toBe(false);
    });

    it('copies the current selection', () => {
        doc.seed([rect({ id: 'r1' })]);
        uiStore.getState().setSelection(['r1']);
        clipboard.copy();
        expect(clipboard.hasContents()).toBe(true);
    });

    it('an empty-selection copy keeps previous contents', () => {
        doc.seed([rect({ id: 'r1' })]);
        uiStore.getState().setSelection(['r1']);
        clipboard.copy();
        uiStore.getState().clearSelection();
        clipboard.copy();
        expect(clipboard.hasContents()).toBe(true);
    });

    it('paste is a no-op when nothing was copied', () => {
        clipboard.paste(0, 0);
        expect(doc.added).toHaveLength(0);
    });

    it('centers the pasted group at the anchor and assigns fresh ids', () => {
        // A 20x20 rect at (10,10) — bounds center (20,20).
        doc.seed([rect({ id: 'r1', x: 10, y: 10, w: 20, h: 20 })]);
        uiStore.getState().setSelection(['r1']);
        clipboard.copy();

        clipboard.paste(100, 100);

        expect(doc.added).toHaveLength(1);
        const pasted = doc.added[0];
        expect(pasted).toHaveLength(1);
        expect(pasted[0].id).not.toBe('r1');
        // center moves from (20,20) to (100,100): offset (+80,+80).
        expect(pasted[0].x).toBe(90);
        expect(pasted[0].y).toBe(90);
    });

    it('preserves relative offsets and z-order across a multi-shape paste', () => {
        const a = rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20, z: 1 });
        const b = ellipse({ id: 'e1', x: 40, y: 0, w: 20, h: 20, z: 2 });
        doc.seed([a, b]);
        uiStore.getState().setSelection(['r1', 'e1']);
        clipboard.copy();

        clipboard.paste(0, 0);

        const pasted = doc.added[0];
        // group bounds: x 0..60, y 0..20 -> center (30,10); anchor (0,0) => offset (-30,-10).
        const pastedRect = pasted.find((s) => s.type === 'rectangle')!;
        const pastedEllipse = pasted.find((s) => s.type === 'ellipse')!;
        expect(pastedRect.x - pastedEllipse.x).toBe(a.x - b.x); // relative offset preserved
        expect(pastedRect.z).toBeLessThan(pastedEllipse.z); // z-order preserved
    });

    it('stacks pastes on top with increasing z', () => {
        doc.seed([rect({ id: 'r1', z: 5 })]);
        uiStore.getState().setSelection(['r1']);
        clipboard.copy();

        clipboard.paste(0, 0);
        const firstZ = doc.added[0][0].z;
        clipboard.paste(0, 0);
        const secondZ = doc.added[1][0].z;

        expect(firstZ).toBeGreaterThan(5);
        expect(secondZ).toBeGreaterThan(firstZ);
    });

    it('tags pasted shapes with the current author and selects them', () => {
        clipboard = makeClipboard('author-2');
        doc.seed([rect({ id: 'r1', createdBy: 'someone-else' })]);
        uiStore.getState().setSelection(['r1']);
        clipboard.copy();

        clipboard.paste(0, 0);

        const pasted = doc.added[0];
        expect(pasted[0].createdBy).toBe('author-2');
        expect(uiStore.getState().selection).toEqual([pasted[0].id]);
    });

    it('duplicate offsets the selection down-right with fresh ids, on top, and re-selects', () => {
        doc.seed([rect({ id: 'r1', x: 10, y: 10, z: 3 })]);
        uiStore.getState().setSelection(['r1']);

        clipboard.duplicate(20, 20);

        const clones = doc.added[0];
        expect(clones).toHaveLength(1);
        expect(clones[0].id).not.toBe('r1');
        expect(clones[0].x).toBe(30);
        expect(clones[0].y).toBe(30);
        expect(clones[0].z).toBeGreaterThan(3);
        expect(uiStore.getState().selection).toEqual([clones[0].id]);
    });

    it('duplicate is a no-op when nothing is selected', () => {
        doc.seed([rect({ id: 'r1' })]);
        clipboard.duplicate(20, 20);
        expect(doc.added).toHaveLength(0);
    });

    it('repeated duplicates cascade because clones become the selection', () => {
        doc.seed([rect({ id: 'r1', x: 0, y: 0 })]);
        uiStore.getState().setSelection(['r1']);

        clipboard.duplicate(20, 20);
        const first = doc.added[0][0];
        clipboard.duplicate(20, 20);
        const second = doc.added[1][0];

        expect(first.x).toBe(20);
        expect(first.y).toBe(20);
        expect(second.x).toBe(40);
        expect(second.y).toBe(40);
    });

    it('duplicate does not disturb the copy/paste clipboard buffer', () => {
        doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 }), rect({ id: 'r2', x: 100, y: 100, w: 20, h: 20 })]);
        // Copy r1, then duplicate a different selection (r2).
        uiStore.getState().setSelection(['r1']);
        clipboard.copy();
        uiStore.getState().setSelection(['r2']);
        clipboard.duplicate(20, 20);

        // Paste should still reproduce r1 (the copied shape), not r2.
        clipboard.paste(0, 0);
        const pasted = doc.added[doc.added.length - 1];
        expect(pasted).toHaveLength(1);
        // r1's 20x20 box centered at (0,0) => top-left (-10,-10).
        expect(pasted[0].x).toBe(-10);
        expect(pasted[0].y).toBe(-10);
    });
});
