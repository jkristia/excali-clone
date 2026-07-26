import { describe, expect, it } from 'vitest';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { ShapeAligner } from './shapeAligner';
import { arrow, group, rect } from '../test-support/shapeFactories';
import type { Shape } from '../model/shapeTypes';

const aligner = new ShapeAligner(new ShapeRegistry());

/** Resolve the aligned x/y of a shape by id, applying the patch the aligner produced.
 *  Selects every shape in `shapes` by default — the common case in these specs, where
 *  the whole fixture list is also the selection. */
function alignedXY(
    shapes: Shape[],
    op: Parameters<ShapeAligner['align']>[2],
    id: string,
    selection: string[] = shapes.map((s) => s.id),
): { x: number; y: number } {
    const patch = aligner.align(shapes, selection, op).find((p) => p.id === id)?.patch ?? {};
    const original = shapes.find((s) => s.id === id)!;
    return { x: patch.x ?? original.x, y: patch.y ?? original.y };
}

describe('ShapeAligner', () => {
    // Two rects: A at x 0..20, B at x 100..140 → group box x 0..140.
    const a = rect({ id: 'a', x: 0, y: 0, w: 20, h: 20 });
    const b = rect({ id: 'b', x: 100, y: 100, w: 40, h: 40 });
    const pair = [a, b];
    const pairIds = pair.map((s) => s.id);

    it('left: moves shapes to the group left edge, leaves y untouched', () => {
        expect(alignedXY(pair, 'left', 'b')).toEqual({ x: 0, y: 100 });
        // A is already at the left edge → no patch emitted for it.
        expect(aligner.align(pair, pairIds, 'left').some((p) => p.id === 'a')).toBe(false);
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
        expect(aligner.align(aligned, ['x', 'y'], 'left')).toEqual([]);
    });

    it('returns [] for fewer than two selected units', () => {
        expect(aligner.align([a], ['a'], 'left')).toEqual([]);
        expect(aligner.align([], [], 'left')).toEqual([]);
        expect(aligner.align(pair, ['a'], 'left')).toEqual([]); // only one id selected
    });

    it('patches the anchor for shapes whose anchor differs from their bounds (arrow with negative dx)', () => {
        // Arrow anchored at x=200 pointing left: bounds x 150..200. Group with a rect at 0..20
        // spans x 0..200; aligning left should put the arrow's *bounds* left edge at 0, i.e.
        // its left endpoint (200 + dx = 150) moves by -150, so the anchor becomes 50.
        const leftArrow = arrow({ id: 'ar', x: 200, y: 0, dx: -50, dy: 0 });
        const r = rect({ id: 'r', x: 0, y: 0, w: 20, h: 20 });
        expect(alignedXY([r, leftArrow], 'left', 'ar')).toEqual({ x: 50, y: 0 });
    });

    describe('groups: align as one rigid block over the selected top-level ids', () => {
        // r at x 0..20 (leftmost). Group g: two members 30px apart, m1 x 50..70, m2 x 80..100
        // (group union x 50..100, so also the rightmost element) → overall union x 0..100.
        const r = rect({ id: 'r', x: 0, y: 0, w: 20, h: 20 });
        const g = group({ id: 'g' });
        const m1 = rect({ id: 'm1', x: 50, y: 0, w: 20, h: 20, parentId: 'g' });
        const m2 = rect({ id: 'm2', x: 80, y: 0, w: 20, h: 20, parentId: 'g' });
        const shapes = [r, g, m1, m2];
        const selection = ['g', 'r'];

        it('left: moves every member of the group by the same delta, preserving their relative offset', () => {
            const patches = aligner.align(shapes, selection, 'left');
            expect(patches.some((p) => p.id === 'r')).toBe(false); // r is already at the overall left edge
            const byId = new Map(patches.map((p) => [p.id, p.patch]));
            expect(byId.get('m1')!.x).toBe(0); // group shifts by -50 so its left edge (50) lands at 0
            expect(byId.get('m2')!.x).toBe(30);
            expect(byId.get('m2')!.x! - byId.get('m1')!.x!).toBe(30); // members keep their original 30px offset
        });

        it('right: moves the lone rect to the group\'s already-flush right edge', () => {
            const patches = aligner.align(shapes, selection, 'right');
            expect(patches.some((p) => p.id === 'm1' || p.id === 'm2')).toBe(false); // group already flush right
            expect(patches).toEqual([{ id: 'r', patch: { x: 80, y: 0 } }]); // right edge 20 -> 100
        });

        it('never patches the group shape itself — it has no geometry to move', () => {
            const patches = aligner.align(shapes, selection, 'left');
            expect(patches.some((p) => p.id === 'g')).toBe(false);
        });

        it('a lone selected group (only one unit) has nothing to align against', () => {
            expect(aligner.align(shapes, ['g'], 'left')).toEqual([]);
        });
    });
});
