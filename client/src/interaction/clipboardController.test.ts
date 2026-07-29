import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipboardController } from './clipboardController';
import { UIStore } from '../state/uiStore';
import { ToolRegistry } from '../tools/toolRegistry';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { ImageCache } from '../util/imageCache';
import type { CanvasDocument } from '../document/canvasDocument';
import type { Shape } from '../model/shapeTypes';
import { rect, ellipse } from '../test-support/shapeFactories';
import { FakeImage } from '../test-support/fakeImage';

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
    public readAllShapes(): Shape[] {
        return [...this.shapes.values()];
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

/** A minimal `ClipboardItem`-shaped object — just enough for `pasteImage` to find an
 *  `image/*` entry and read its `Blob`. */
class FakeClipboardItem {
    constructor(public readonly types: string[], private readonly blob: Blob) { }
    public async getType(): Promise<Blob> {
        return this.blob;
    }
}

/** In-memory stand-in for the OS clipboard, installed as `navigator.clipboard`. The
 *  same instance shared by two controllers models two tabs backed by one OS clipboard.
 *  `image`, when set, is what `read()` returns — modeling an image on the OS clipboard
 *  (as opposed to `text`, the app's own tagged shape envelope). */
class FakeClipboard {
    public text = '';
    public image: FakeClipboardItem | null = null;
    public failWrite = false;
    public failRead = false;
    public failBinaryRead = false;

    public async writeText(text: string): Promise<void> {
        if (this.failWrite) throw new Error('clipboard write denied');
        this.text = text;
    }
    public async readText(): Promise<string> {
        if (this.failRead) throw new Error('clipboard read denied');
        return this.text;
    }
    public async read(): Promise<FakeClipboardItem[]> {
        if (this.failBinaryRead) throw new Error('binary clipboard read denied');
        return this.image ? [this.image] : [];
    }
}

const shapeRegistry = new ShapeRegistry();
let uiStore: UIStore;
let doc: FakeDoc;
let clipboard: ClipboardController;
let fakeClipboard: FakeClipboard;
let imageCache: ImageCache;

function makeClipboard(author = 'me', docArg: FakeDoc = doc, store: UIStore = uiStore, cache: ImageCache = imageCache): ClipboardController {
    return new ClipboardController(
        store,
        docArg as unknown as CanvasDocument,
        shapeRegistry,
        () => author,
        cache,
    );
}

beforeEach(() => {
    uiStore = new UIStore(new ToolRegistry(shapeRegistry));
    doc = new FakeDoc();
    imageCache = new ImageCache();
    clipboard = makeClipboard();
    fakeClipboard = new FakeClipboard();
    vi.stubGlobal('navigator', { clipboard: fakeClipboard });
    vi.stubGlobal('Image', FakeImage);
    FakeImage.instances = [];
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('ClipboardController', () => {
    it('starts empty', () => {
        expect(clipboard.hasContents()).toBe(false);
    });

    it('copies the current selection', async () => {
        doc.seed([rect({ id: 'r1' })]);
        uiStore.getState().setSelection(['r1']);
        await clipboard.copy();
        expect(clipboard.hasContents()).toBe(true);
    });

    it('an empty-selection copy keeps previous contents', async () => {
        doc.seed([rect({ id: 'r1' })]);
        uiStore.getState().setSelection(['r1']);
        await clipboard.copy();
        uiStore.getState().clearSelection();
        await clipboard.copy();
        expect(clipboard.hasContents()).toBe(true);
    });

    it('paste is a no-op when nothing was copied', async () => {
        await clipboard.paste(0, 0);
        expect(doc.added).toHaveLength(0);
    });

    it('centers the pasted group at the anchor and assigns fresh ids', async () => {
        // A 20x20 rect at (10,10) — bounds center (20,20).
        doc.seed([rect({ id: 'r1', x: 10, y: 10, w: 20, h: 20 })]);
        uiStore.getState().setSelection(['r1']);
        await clipboard.copy();

        await clipboard.paste(100, 100);

        expect(doc.added).toHaveLength(1);
        const pasted = doc.added[0];
        expect(pasted).toHaveLength(1);
        expect(pasted[0].id).not.toBe('r1');
        // center moves from (20,20) to (100,100): offset (+80,+80).
        expect(pasted[0].x).toBe(90);
        expect(pasted[0].y).toBe(90);
    });

    it('preserves relative offsets and z-order across a multi-shape paste', async () => {
        const a = rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20, z: 1 });
        const b = ellipse({ id: 'e1', x: 40, y: 0, w: 20, h: 20, z: 2 });
        doc.seed([a, b]);
        uiStore.getState().setSelection(['r1', 'e1']);
        await clipboard.copy();

        await clipboard.paste(0, 0);

        const pasted = doc.added[0];
        // group bounds: x 0..60, y 0..20 -> center (30,10); anchor (0,0) => offset (-30,-10).
        const pastedRect = pasted.find((s) => s.type === 'rectangle')!;
        const pastedEllipse = pasted.find((s) => s.type === 'ellipse')!;
        expect(pastedRect.x - pastedEllipse.x).toBe(a.x - b.x); // relative offset preserved
        expect(pastedRect.z).toBeLessThan(pastedEllipse.z); // z-order preserved
    });

    it('re-mints a pasted group and rewrites its members\' parentId', async () => {
        const g: Shape = { id: 'g', type: 'group', x: 0, y: 0, z: 3, createdBy: 'u' };
        const a = rect({ id: 'r1', parentId: 'g', z: 0 });
        const b = rect({ id: 'r2', parentId: 'g', z: 1 });
        doc.seed([g, a, b]);
        uiStore.getState().setSelection(['g']); // select the group as a unit
        await clipboard.copy();

        await clipboard.paste(0, 0);

        const pasted = doc.added[0];
        expect(pasted).toHaveLength(3); // group + both members carried along
        const newGroup = pasted.find((s) => s.type === 'group');
        expect(newGroup).toBeDefined();
        expect(newGroup?.id).not.toBe('g');
        const members = pasted.filter((s) => s.type !== 'group');
        expect(members).toHaveLength(2);
        for (const m of members) expect(m.parentId).toBe(newGroup?.id);
        // the pasted group is selected as a unit, not its members individually.
        expect(uiStore.getState().selection).toEqual([newGroup?.id]);
    });

    it('stacks pastes on top with increasing z', async () => {
        doc.seed([rect({ id: 'r1', z: 5 })]);
        uiStore.getState().setSelection(['r1']);
        await clipboard.copy();

        await clipboard.paste(0, 0);
        const firstZ = doc.added[0][0].z;
        await clipboard.paste(0, 0);
        const secondZ = doc.added[1][0].z;

        expect(firstZ).toBeGreaterThan(5);
        expect(secondZ).toBeGreaterThan(firstZ);
    });

    it('tags pasted shapes with the current author and selects them', async () => {
        clipboard = makeClipboard('author-2');
        doc.seed([rect({ id: 'r1', createdBy: 'someone-else' })]);
        uiStore.getState().setSelection(['r1']);
        await clipboard.copy();

        await clipboard.paste(0, 0);

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

    it('duplicate does not disturb the copy/paste clipboard buffer', async () => {
        doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 }), rect({ id: 'r2', x: 100, y: 100, w: 20, h: 20 })]);
        // Copy r1, then duplicate a different selection (r2).
        uiStore.getState().setSelection(['r1']);
        await clipboard.copy();
        uiStore.getState().setSelection(['r2']);
        clipboard.duplicate(20, 20);

        // Paste should still reproduce r1 (the copied shape), not r2.
        await clipboard.paste(0, 0);
        const pasted = doc.added[doc.added.length - 1];
        expect(pasted).toHaveLength(1);
        // r1's 20x20 box centered at (0,0) => top-left (-10,-10).
        expect(pasted[0].x).toBe(-10);
        expect(pasted[0].y).toBe(-10);
    });

    describe('OS clipboard (cross-tab)', () => {
        it('writes a tagged envelope of the copied shapes to the OS clipboard', async () => {
            doc.seed([rect({ id: 'r1', x: 10, y: 10, w: 20, h: 20 })]);
            uiStore.getState().setSelection(['r1']);
            await clipboard.copy();

            const envelope = JSON.parse(fakeClipboard.text);
            expect(envelope.kind).toBe('whiteboard/shapes@1');
            expect(envelope.shapes).toHaveLength(1);
            expect(envelope.shapes[0].id).toBe('r1');
        });

        it('pastes shapes copied in another instance via the shared OS clipboard', async () => {
            // Instance A copies into the shared (stubbed) OS clipboard.
            doc.seed([rect({ id: 'r1', x: 10, y: 10, w: 20, h: 20, createdBy: 'author-A' })]);
            uiStore.getState().setSelection(['r1']);
            await clipboard.copy();

            // Instance B is a fresh controller with its own empty doc and buffer.
            const docB = new FakeDoc();
            const storeB = new UIStore(new ToolRegistry(shapeRegistry));
            const clipboardB = makeClipboard('author-B', docB, storeB);
            expect(clipboardB.hasContents()).toBe(false); // nothing copied locally in B

            await clipboardB.paste(100, 100);

            expect(docB.added).toHaveLength(1);
            const pasted = docB.added[0];
            expect(pasted).toHaveLength(1);
            expect(pasted[0].id).not.toBe('r1'); // fresh id, no cross-tab collision
            expect(pasted[0].createdBy).toBe('author-B');
            expect(pasted[0].x).toBe(90); // center (20,20) -> anchor (100,100)
            expect(pasted[0].y).toBe(90);
        });

        it('falls back to the in-memory buffer when the clipboard holds foreign text', async () => {
            doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 })]);
            uiStore.getState().setSelection(['r1']);
            await clipboard.copy();

            fakeClipboard.text = 'not our json';
            await clipboard.paste(0, 0);

            const pasted = doc.added[doc.added.length - 1];
            expect(pasted).toHaveLength(1);
            expect(pasted[0].x).toBe(-10); // reproduces r1 from the in-memory buffer
        });

        it('falls back to the in-memory buffer when the clipboard holds a wrong-kind envelope', async () => {
            doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 })]);
            uiStore.getState().setSelection(['r1']);
            await clipboard.copy();

            fakeClipboard.text = JSON.stringify({ kind: 'something/else', shapes: [] });
            await clipboard.paste(0, 0);

            const pasted = doc.added[doc.added.length - 1];
            expect(pasted[0].x).toBe(-10); // still reproduces r1
        });

        it('falls back to the in-memory buffer when reading the clipboard is denied', async () => {
            doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 })]);
            uiStore.getState().setSelection(['r1']);
            await clipboard.copy();

            fakeClipboard.failRead = true;
            await clipboard.paste(0, 0);

            const pasted = doc.added[doc.added.length - 1];
            expect(pasted[0].x).toBe(-10); // reproduces r1 from the in-memory buffer
        });

        it('a denied clipboard write does not throw and keeps the in-memory buffer usable', async () => {
            fakeClipboard.failWrite = true;
            doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 })]);
            uiStore.getState().setSelection(['r1']);

            await expect(clipboard.copy()).resolves.toBeUndefined();
            expect(clipboard.hasContents()).toBe(true);

            // Clipboard read yields the failed-write's stale empty text -> foreign -> fallback.
            await clipboard.paste(0, 0);
            const pasted = doc.added[doc.added.length - 1];
            expect(pasted[0].x).toBe(-10);
        });
    });

    describe('pasting an image from the OS clipboard', () => {
        it('inserts a fresh ImageShape centered at the anchor, sized to the decoded image', async () => {
            const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
            fakeClipboard.image = new FakeClipboardItem(['image/png'], blob);

            const pastePromise = clipboard.paste(50, 50);
            await vi.waitFor(() => expect(FakeImage.instances).toHaveLength(1));
            FakeImage.instances[0].onload?.(); // FakeImage defaults to a 100x50 decode
            await pastePromise;

            expect(doc.added).toHaveLength(1);
            const pasted = doc.added[0];
            expect(pasted).toHaveLength(1);
            expect(pasted[0].type).toBe('image');
            expect(pasted[0]).toMatchObject({ w: 100, h: 50, x: 0, y: 25 }); // centered at (50,50)
            expect(uiStore.getState().selection).toEqual([pasted[0].id]);
        });

        it('takes priority over a stale in-memory shape buffer', async () => {
            doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 })]);
            uiStore.getState().setSelection(['r1']);
            await clipboard.copy(); // populates the in-memory shape buffer

            const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
            fakeClipboard.image = new FakeClipboardItem(['image/png'], blob);

            const pastePromise = clipboard.paste(0, 0);
            await vi.waitFor(() => expect(FakeImage.instances).toHaveLength(1));
            FakeImage.instances[0].onload?.();
            await pastePromise;

            expect(doc.added[0][0].type).toBe('image'); // not the buffered rectangle
        });

        it('falls back to the shape-paste path when no image is on the OS clipboard', async () => {
            doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 })]);
            uiStore.getState().setSelection(['r1']);
            await clipboard.copy();

            await clipboard.paste(0, 0); // fakeClipboard.image is null

            expect(doc.added[0][0].type).toBe('rectangle');
            expect(FakeImage.instances).toHaveLength(0);
        });

        it('falls back to the shape-paste path when the binary clipboard read is denied', async () => {
            doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 })]);
            uiStore.getState().setSelection(['r1']);
            await clipboard.copy();

            fakeClipboard.failBinaryRead = true;
            await clipboard.paste(0, 0);

            expect(doc.added[doc.added.length - 1][0].type).toBe('rectangle');
        });

        it('falls back to the shape-paste path when clipboard.read is unsupported', async () => {
            doc.seed([rect({ id: 'r1', x: 0, y: 0, w: 20, h: 20 })]);
            uiStore.getState().setSelection(['r1']);
            await clipboard.copy();

            // A clipboard that only supports readText/writeText (no binary read).
            vi.stubGlobal('navigator', {
                clipboard: { readText: () => fakeClipboard.readText(), writeText: (t: string) => fakeClipboard.writeText(t) },
            });

            await clipboard.paste(0, 0);

            expect(doc.added[doc.added.length - 1][0].type).toBe('rectangle');
        });
    });
});
