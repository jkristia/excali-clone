import { describe, expect, it } from 'vitest';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import type { Bounds, Shape } from './shapeTypes';
import { arrow, draw, ellipse, note, rect, text } from '../test-support/shapeFactories';

// Shape geometry now lives on ShapeRegistry; these wrappers keep the cases below unchanged.
const reg = new ShapeRegistry();
const getBounds = (s: Shape): Bounds => reg.getBounds(s);
const hitTest = (s: Shape, px: number, py: number, tol?: number): boolean => reg.hitTest(s, px, py, tol);
const shapesInRect = (shapes: Shape[], sel: Bounds): Shape[] => reg.shapesInRect(shapes, sel);
const topShapeAt = (shapes: Shape[], px: number, py: number): Shape | null => reg.topShapeAt(shapes, px, py);
const unionBounds = (shapes: Shape[]): Bounds | null => reg.unionBounds(shapes);

describe('getBounds', () => {
    it('rectangle: normalizes negative w/h', () => {
        expect(getBounds(rect({ x: 10, y: 10, w: -20, h: -10 }))).toEqual({ x: -10, y: 0, w: 20, h: 10 });
    });

    it('rectangle: positive w/h passes through', () => {
        expect(getBounds(rect({ x: 10, y: 10, w: 20, h: 20 }))).toEqual({ x: 10, y: 10, w: 20, h: 20 });
    });

    it('ellipse: uses same normalization as rectangle', () => {
        expect(getBounds(ellipse({ x: 0, y: 0, w: 40, h: 20 }))).toEqual({ x: 0, y: 0, w: 40, h: 20 });
    });

    it('note: uses same normalization as rectangle', () => {
        expect(getBounds(note({ x: 5, y: 5, w: 100, h: 80 }))).toEqual({ x: 5, y: 5, w: 100, h: 80 });
    });

    it('text: bounds pass through x/y/w/h as-is (no normalization)', () => {
        expect(getBounds(text({ x: 3, y: 4, w: 20, h: 25 }))).toEqual({ x: 3, y: 4, w: 20, h: 25 });
    });

    it('arrow: bounds from x/y + points, normalized', () => {
        expect(getBounds(arrow({ x: 5, y: 5, points: [0, 0, -10, 20] }))).toEqual({ x: -5, y: 5, w: 10, h: 20 });
    });

    it('draw: bounds from min/max of points relative to x/y', () => {
        expect(getBounds(draw({ x: 100, y: 100, points: [0, 0, 10, -5, -5, 10] }))).toEqual({
            x: 95, y: 95, w: 15, h: 15,
        });
    });

    it('draw: empty points collapses to a zero-size box at the anchor', () => {
        expect(getBounds(draw({ x: 7, y: 8, points: [] }))).toEqual({ x: 7, y: 8, w: 0, h: 0 });
    });
});

describe('hitTest', () => {
    it('arrow: hits near the segment within tolerance + strokeWidth', () => {
        const s = arrow({ x: 0, y: 0, points: [0, 0, 100, 0], strokeWidth: 2 });
        expect(hitTest(s, 50, 0, 6)).toBe(true);
        expect(hitTest(s, 50, 20, 6)).toBe(false);
    });

    it('draw: hits near any segment of the polyline', () => {
        const s = draw({ x: 0, y: 0, points: [0, 0, 10, 0, 10, 10], strokeWidth: 2 });
        expect(hitTest(s, 5, 0, 6)).toBe(true);
        expect(hitTest(s, 10, 5, 6)).toBe(true);
        expect(hitTest(s, 50, 50, 6)).toBe(false);
    });

    it('ellipse: uses normalized-radius test with 1.15 slack (hits just outside the strict ellipse)', () => {
        const s = ellipse({ x: 0, y: 0, w: 40, h: 20 }); // rx=20, ry=10, center (20,10)
        expect(hitTest(s, 20, 10, 0)).toBe(true); // center
        expect(hitTest(s, 20, 0, 0)).toBe(true); // exactly on rim (ny=1 -> 1 <= 1.15)
        expect(hitTest(s, 20, -2, 0)).toBe(false); // clearly outside slack
    });

    it('default (rectangle/note/text): falls back to pointInBounds with tol padding', () => {
        const s = rect({ x: 10, y: 10, w: 20, h: 20 });
        expect(hitTest(s, 10, 10, 0)).toBe(true);
        expect(hitTest(s, 9, 10, 0)).toBe(false);
        expect(hitTest(s, 9, 10, 2)).toBe(true);
    });
});

describe('topShapeAt', () => {
    it('returns the highest-z shape among overlapping hits', () => {
        const low = rect({ id: 'low', x: 0, y: 0, w: 50, h: 50, z: 1 });
        const high = rect({ id: 'high', x: 0, y: 0, w: 50, h: 50, z: 5 });
        expect(topShapeAt([low, high], 10, 10)?.id).toBe('high');
    });

    it('returns null when nothing is hit', () => {
        expect(topShapeAt([rect({ x: 0, y: 0, w: 10, h: 10 })], 100, 100)).toBeNull();
    });
});

describe('shapesInRect', () => {
    it('requires full containment, not mere intersection', () => {
        const inside = rect({ id: 'inside', x: 10, y: 10, w: 10, h: 10 });
        const straddling = rect({ id: 'straddling', x: 15, y: 15, w: 30, h: 30 });
        const selection = { x: 0, y: 0, w: 30, h: 30 };
        const result = shapesInRect([inside, straddling], selection).map((s) => s.id);
        expect(result).toEqual(['inside']);
    });
});

describe('unionBounds', () => {
    it('returns null for an empty list', () => {
        expect(unionBounds([])).toBeNull();
    });

    it('returns the bounding box spanning all shapes', () => {
        const a = rect({ id: 'a', x: 0, y: 0, w: 10, h: 10 });
        const b = rect({ id: 'b', x: 20, y: 30, w: 10, h: 10 });
        expect(unionBounds([a, b])).toEqual({ x: 0, y: 0, w: 30, h: 40 });
    });
});
