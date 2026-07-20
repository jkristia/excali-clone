import { describe, expect, it } from 'vitest';
import { ShapeRegistry } from './shapeRegistry';
import { RectangleShapeDef } from './rectangleShapeDef';
import { NoteShapeDef } from './noteShapeDef';
import type { Shape } from '../model/types';

function rect(): Shape {
    return { id: 'a', type: 'rectangle', x: 0, y: 0, z: 0, w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 1, createdBy: 'x' };
}

describe('ShapeRegistry', () => {
    it('getDefinition returns the definition matching the shape type', () => {
        const registry = new ShapeRegistry();
        expect(registry.getDefinition(rect())).toBeInstanceOf(RectangleShapeDef);
    });

    it('getCapabilities returns the capabilities for a shape type', () => {
        const registry = new ShapeRegistry();
        expect(registry.getCapabilities('note')).toEqual(new NoteShapeDef().capabilities);
    });

    it('isKnownType accepts registered types and rejects everything else', () => {
        const registry = new ShapeRegistry();
        expect(registry.isKnownType('rectangle')).toBe(true);
        expect(registry.isKnownType('note')).toBe(true);
        expect(registry.isKnownType('bogus')).toBe(false);
        expect(registry.isKnownType('toString')).toBe(false); // not tricked by prototype members
    });
});
