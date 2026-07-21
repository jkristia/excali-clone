import { describe, expect, it } from 'vitest';
import { ShapeRegistry } from './shapeRegistry';
import { RectangleShapeDef } from './rectangleShapeDef';
import { NoteShapeDef } from './noteShapeDef';
import { GroupShapeDef } from './groupShapeDef';
import type { Shape } from '../model/types';

function rect(over: Partial<Extract<Shape, { type: 'rectangle' }>> = {}): Shape {
    return { id: 'a', type: 'rectangle', x: 0, y: 0, z: 0, w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 1, createdBy: 'x', ...over };
}

function group(over: Partial<Extract<Shape, { type: 'group' }>> = {}): Shape {
    return { id: 'g', type: 'group', x: 0, y: 0, z: 0, createdBy: 'x', ...over };
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

    it('unionBounds spans only the given (e.g. selected) subset of shapes', () => {
        const registry = new ShapeRegistry();
        // A far-away shape that must NOT influence the bounds when it isn't in the subset.
        const shapes = [
            rect({ id: 'a', x: 0, y: 0, w: 10, h: 10 }),
            rect({ id: 'b', x: 100, y: 40, w: 20, h: 10 }),
            rect({ id: 'far', x: 1000, y: 1000, w: 10, h: 10 }),
        ];
        const selected = new Set(['a', 'b']);
        const subset = shapes.filter((s) => selected.has(s.id));
        expect(registry.unionBounds(subset)).toEqual({ x: 0, y: 0, w: 120, h: 50 });
    });

    it('unionBounds returns null for an empty subset (empty selection is a no-op)', () => {
        const registry = new ShapeRegistry();
        expect(registry.unionBounds([])).toBeNull();
    });

    describe('group container', () => {
        it('registers the group type with a no-op definition', () => {
            const registry = new ShapeRegistry();
            expect(registry.isKnownType('group')).toBe(true);
            expect(registry.getDefinition(group())).toBeInstanceOf(GroupShapeDef);
        });

        it('is never hit directly (members carry the geometry)', () => {
            const registry = new ShapeRegistry();
            expect(registry.hitTest(group(), 0, 0)).toBe(false);
        });

        it('is not resizable but is rotatable (rotates its members)', () => {
            const registry = new ShapeRegistry();
            expect(registry.isResizable(group())).toBe(false);
            expect(registry.isRotatable(group())).toBe(true);
        });

        it('is excluded from marquee containment (has no bounds of its own)', () => {
            const registry = new ShapeRegistry();
            const inside = registry.shapesInRect([group()], { x: -50, y: -50, w: 100, h: 100 });
            expect(inside).toEqual([]);
        });
    });
});
