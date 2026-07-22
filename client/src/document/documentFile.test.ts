import { describe, expect, it } from 'vitest';
import { DocumentFile, type WhiteboardView } from './documentFile';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { rect, ellipse } from '../test-support/shapeFactories';

const codec = new DocumentFile(new ShapeRegistry());
const view: WhiteboardView = { camera: { x: 12, y: -34, zoom: 1.5 }, snapToGrid: true };

describe('DocumentFile', () => {
    it('round-trips shapes and view', () => {
        const shapes = [rect(), ellipse()];
        const restored = codec.deserialize(codec.serialize(shapes, view));
        expect(restored).not.toBeNull();
        expect(restored?.shapes).toEqual(shapes);
        expect(restored?.view).toEqual(view);
    });

    it('writes the kind and version', () => {
        const parsed = JSON.parse(codec.serialize([rect()], view));
        expect(parsed.kind).toBe('whiteboard/document');
        expect(parsed.version).toBe('0.01');
    });

    it('rejects a foreign kind', () => {
        expect(codec.deserialize(JSON.stringify({ kind: 'other', version: '0.01', shapes: [] }))).toBeNull();
    });

    it('rejects a shape with an unknown type', () => {
        const bad = { kind: 'whiteboard/document', version: '0.01', shapes: [{ ...rect(), type: 'bogus' }] };
        expect(codec.deserialize(JSON.stringify(bad))).toBeNull();
    });

    it('rejects non-JSON text without throwing', () => {
        expect(codec.deserialize('not json {')).toBeNull();
    });

    it('tolerates a missing view (board still loads)', () => {
        const restored = codec.deserialize(
            JSON.stringify({ kind: 'whiteboard/document', version: '0.01', shapes: [rect()] }),
        );
        expect(restored?.shapes).toHaveLength(1);
        expect(restored?.view).toBeUndefined();
    });

    it('drops a malformed view but keeps the shapes', () => {
        const restored = codec.deserialize(
            JSON.stringify({
                kind: 'whiteboard/document',
                version: '0.01',
                shapes: [rect()],
                view: { camera: { x: 1 }, snapToGrid: 'yes' },
            }),
        );
        expect(restored?.shapes).toHaveLength(1);
        expect(restored?.view).toBeUndefined();
    });
});
