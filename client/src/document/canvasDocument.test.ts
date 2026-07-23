import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shape } from '../model/types';
import type { IdentityStore } from './identity';
import { FakeBroadcastChannel } from '../test-support/fakeBroadcastChannel';

vi.mock('y-websocket', () => ({
    WebsocketProvider: vi.fn().mockImplementation(function WebsocketProvider(this: object) {
        Object.assign(this, {
            awareness: { clientID: 1, on: vi.fn(), getStates: vi.fn(() => new Map()) },
            on: vi.fn(),
            wsconnected: false,
        });
    }),
}));

vi.mock('y-indexeddb', () => ({
    IndexeddbPersistence: vi.fn().mockImplementation(function IndexeddbPersistence() {}),
}));

vi.stubGlobal('window', { location: { search: '', hostname: 'localhost' } });
vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);

const { CanvasDocument } = await import('./canvasDocument');

function rect(id: string, z: number, parentId?: string): Shape {
    return { id, type: 'rectangle', x: 0, y: 0, z, w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 1, createdBy: 'x', parentId };
}

function makeDoc() {
    const identityStore = { load: () => ({ name: 'Bold Fox', color: '#ef4444' }) } as unknown as IdentityStore;
    return new CanvasDocument(identityStore, 'ws://localhost:1234');
}

let doc: ReturnType<typeof makeDoc>;

beforeEach(() => {
    FakeBroadcastChannel.reset();
    doc = makeDoc();
});

describe('CanvasDocument', () => {
    it('is local-only (no room, no provider) when the URL has no ?room', () => {
        expect(doc.room).toBeNull();
        expect(doc.provider).toBeNull();
        expect(doc.localChannel).not.toBeNull();
    });

    it('addShape + getShape round-trips a shape', () => {
        doc.addShape(rect('a', 0));
        expect(doc.getShape('a')).toMatchObject({ id: 'a', type: 'rectangle' });
    });

    it('readAllShapes returns shapes sorted by z', () => {
        doc.addShape(rect('b', 2));
        doc.addShape(rect('a', 1));
        expect(doc.readAllShapes().map((s) => s.id)).toEqual(['a', 'b']);
    });

    it('updateShape on a missing id is a no-op', () => {
        expect(() => doc.updateShape('missing', { x: 5 })).not.toThrow();
        expect(doc.getShape('missing')).toBeNull();
    });

    it('deleteShapes removes the given shapes', () => {
        doc.addShape(rect('a', 0));
        doc.addShape(rect('b', 1));
        doc.deleteShapes(['a']);
        expect(doc.readAllShapes().map((s) => s.id)).toEqual(['b']);
    });

    describe('reorderShapes', () => {
        beforeEach(() => {
            doc.addShape(rect('a', 0));
            doc.addShape(rect('b', 1));
            doc.addShape(rect('c', 2));
        });

        it('toFront moves selected shapes to the top, preserving relative order', () => {
            doc.reorderShapes(['a'], 'toFront');
            expect(doc.readAllShapes().map((s) => s.id)).toEqual(['b', 'c', 'a']);
        });

        it('toBack moves selected shapes to the bottom, preserving relative order', () => {
            doc.reorderShapes(['c'], 'toBack');
            expect(doc.readAllShapes().map((s) => s.id)).toEqual(['c', 'a', 'b']);
        });

        it('forward moves a shape one step toward the front', () => {
            doc.reorderShapes(['a'], 'forward');
            expect(doc.readAllShapes().map((s) => s.id)).toEqual(['b', 'a', 'c']);
        });

        it('backward moves a shape one step toward the back', () => {
            doc.reorderShapes(['c'], 'backward');
            expect(doc.readAllShapes().map((s) => s.id)).toEqual(['a', 'c', 'b']);
        });
    });

    describe('groupShapes / ungroup', () => {
        it('mints a group, reparents members, and renumbers their z 0..n-1', () => {
            doc.addShape(rect('a', 3));
            doc.addShape(rect('b', 7));
            const gid = doc.groupShapes(['a', 'b']);
            expect(gid).not.toBeNull();
            const a = doc.getShape('a');
            const b = doc.getShape('b');
            expect(a?.parentId).toBe(gid);
            expect(b?.parentId).toBe(gid);
            // members renumbered to a contiguous 0..n-1 in their prior order.
            expect([a?.z, b?.z].sort()).toEqual([0, 1]);
            // the group sits at the root, on top of remaining siblings.
            const group = gid ? doc.getShape(gid) : null;
            expect(group?.type).toBe('group');
            expect(group?.parentId).toBeUndefined();
        });

        it('rejects a mixed-parent selection', () => {
            doc.addShape(rect('a', 0));
            doc.addShape(rect('b', 1));
            const gid = doc.groupShapes(['a', 'b']);
            // Now `a` is grouped; grouping it together with a root shape must fail.
            doc.addShape(rect('c', 2));
            expect(doc.groupShapes(['a', 'c'])).toBeNull();
            expect(gid).not.toBeNull();
        });

        it('rejects grouping fewer than two shapes', () => {
            doc.addShape(rect('a', 0));
            expect(doc.groupShapes(['a'])).toBeNull();
        });

        it('ungroup reparents members to root and deletes the group', () => {
            doc.addShape(rect('a', 0));
            doc.addShape(rect('b', 1));
            const gid = doc.groupShapes(['a', 'b']);
            if (!gid) throw new Error('group failed');
            doc.ungroup(gid);
            expect(doc.getShape(gid)).toBeNull();
            expect(doc.getShape('a')?.parentId).toBeUndefined();
            expect(doc.getShape('b')?.parentId).toBeUndefined();
        });
    });

    describe('grouped stacking', () => {
        it('deletes a group together with its members', () => {
            doc.addShape(rect('a', 0));
            doc.addShape(rect('b', 1));
            doc.addShape(rect('loose', 2));
            const gid = doc.groupShapes(['a', 'b']);
            if (!gid) throw new Error('group failed');
            doc.deleteShapes([gid]);
            expect(doc.readAllShapes().map((s) => s.id)).toEqual(['loose']);
        });

        it('stacks whole bands: reordering a group carries its members past another group', () => {
            doc.addShape(rect('a', 0));
            doc.addShape(rect('b', 1));
            doc.addShape(rect('c', 2));
            doc.addShape(rect('d', 3));
            const g1 = doc.groupShapes(['a', 'b']);
            const g2 = doc.groupShapes(['c', 'd']);
            if (!g1 || !g2) throw new Error('group failed');
            // g1 currently below g2. Bring g1 to the front: every member of g1 must
            // now sit above every member of g2 in draw order.
            doc.reorderShapes([g1], 'toFront');
            const order = doc.readAllShapes().map((s) => s.id);
            const g1Members = ['a', 'b'].map((id) => order.indexOf(id));
            const g2Members = ['c', 'd'].map((id) => order.indexOf(id));
            expect(Math.min(...g1Members)).toBeGreaterThan(Math.max(...g2Members));
        });
    });

    it('clearBoard removes all shapes', () => {
        doc.addShape(rect('a', 0));
        doc.addShape(rect('b', 1));
        doc.clearBoard();
        expect(doc.readAllShapes()).toEqual([]);
    });

    describe('replaceAllShapes', () => {
        it('drops existing shapes and inserts the new ones with their original ids', () => {
            doc.addShape(rect('old', 0));
            doc.replaceAllShapes([rect('a', 0), rect('b', 1)]);
            expect(doc.readAllShapes().map((s) => s.id)).toEqual(['a', 'b']);
            expect(doc.getShape('old')).toBeNull();
        });

        it('undoes the whole replace in a single step', () => {
            doc.addShape(rect('original', 0));
            // Force an undo boundary so the replace is its own item, not merged with the
            // setup add by the UndoManager's captureTimeout.
            doc.undoManager.stopCapturing();
            doc.replaceAllShapes([rect('a', 0), rect('b', 1)]);
            doc.undoManager.undo();
            expect(doc.readAllShapes().map((s) => s.id)).toEqual(['original']);
        });
    });
});
