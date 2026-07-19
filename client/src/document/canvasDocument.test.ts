import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Shape } from '../model/types';
import type { IdentityStore } from './identity';

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

const { CanvasDocument } = await import('./canvasDocument');

function rect(id: string, z: number): Shape {
    return { id, type: 'rectangle', x: 0, y: 0, z, w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 1, createdBy: 'x' };
}

function makeDoc() {
    const identityStore = { load: () => ({ name: 'Bold Fox', color: '#ef4444' }) } as unknown as IdentityStore;
    return new CanvasDocument(identityStore, 'ws://localhost:1234');
}

let doc: ReturnType<typeof makeDoc>;

beforeEach(() => {
    doc = makeDoc();
});

describe('CanvasDocument', () => {
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

    it('clearBoard removes all shapes', () => {
        doc.addShape(rect('a', 0));
        doc.addShape(rect('b', 1));
        doc.clearBoard();
        expect(doc.readAllShapes()).toEqual([]);
    });
});
