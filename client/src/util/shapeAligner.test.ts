import { describe, expect, it } from 'vitest';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { ShapeAligner } from './shapeAligner';
import { arrow, rect } from '../test-support/shapeFactories';
import type { Shape } from '../model/types';

const aligner = new ShapeAligner(new ShapeRegistry());

/** Resolve the aligned x/y of a shape by id, applying the patch the aligner produced. */
function alignedXY(shapes: Shape[], op: Parameters<ShapeAligner['align']>[1], id: string): { x: number; y: number } {
    const patch = aligner.align(shapes, op).find((p) => p.id === id)?.patch ?? {};
    const original = shapes.find((s) => s.id === id)!;
    return { x: patch.x ?? original.x, y: patch.y ?? original.y };
}

describe('ShapeAligner', () => {
    // Two rects: A at x 0..20, B at x 100..140 → group box x 0..140.
    const a = rect({ id: 'a', x: 0, y: 0, w: 20, h: 20 });
    const b = rect({ id: 'b', x: 100, y: 100, w: 40, h: 40 });
    const pair = [a, b];

    it('left: moves shapes to the group left edge, leaves y untouched', () => {
        expect(alignedXY(pair, 'left', 'b')).toEqual({ x: 0, y: 100 });
        // A is already at the left edge → no patch emitted for it.
        expect(aligner.align(pair, 'left').some((p) => p.id === 'a')).toBe(false);
    });

    it('right: aligns right edges to the group right edge (x=140)', () => {
        expect(alignedXY(pair, 'right', 'a').x).toBe(120); // 140 - width 20
        expect(alignedXY(pair, 'right', 'b').x).toBe(100); // already flush → unchanged
    });

    it('hcenter: centers each shape on the group center x (70)', () => {
        expect(alignedXY(pair, 'hcenter', 'a').x).toBe(60); // center 70 - half-width 10
        expect(alignedXY(pair, 'hcenter', 'b').x).toBe(50); // 70 - 20
    });

    it('top: aligns top edges to the group top (y=0), leaves x untouched', () => {
        expect(alignedXY(pair, 'top', 'b')).toEqual({ x: 100, y: 0 });
    });

    it('bottom: aligns bottom edges to the group bottom (y=140)', () => {
        expect(alignedXY(pair, 'bottom', 'a').y).toBe(120); // 140 - height 20
    });

    it('vcenter: centers each shape on the group center y (70)', () => {
        expect(alignedXY(pair, 'vcenter', 'a').y).toBe(60);
        expect(alignedXY(pair, 'vcenter', 'b').y).toBe(50);
    });

    it('omits no-op patches (shapes already aligned produce no patch)', () => {
        // Both rects already share the same left edge → nothing to move.
        const aligned = [rect({ id: 'x', x: 5, y: 0, w: 10, h: 10 }), rect({ id: 'y', x: 5, y: 50, w: 30, h: 10 })];
        expect(aligner.align(aligned, 'left')).toEqual([]);
    });

    it('returns [] for fewer than two shapes', () => {
        expect(aligner.align([a], 'left')).toEqual([]);
        expect(aligner.align([], 'left')).toEqual([]);
    });

    it('patches the anchor for shapes whose anchor differs from their bounds (arrow with negative dx)', () => {
        // Arrow anchored at x=200 pointing left: bounds x 150..200. Group with a rect at 0..20
        // spans x 0..200; aligning left should put the arrow's *bounds* left edge at 0, i.e.
        // its left endpoint (200 + dx = 150) moves by -150, so the anchor becomes 50.
        const leftArrow = arrow({ id: 'ar', x: 200, y: 0, dx: -50, dy: 0 });
        const r = rect({ id: 'r', x: 0, y: 0, w: 20, h: 20 });
        expect(alignedXY([r, leftArrow], 'left', 'ar').x).toBe(50);
    });
});
