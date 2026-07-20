import type { Bounds, Shape } from '../model/types';
import type { ShapeRegistry } from '../shapes/shapeRegistry';

/** The six ways multiple shapes can be lined up against their combined bounding box. */
export type AlignOp = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/**
 * Computes the position patches that line selected shapes up against the edges or
 * centers of their combined (union) bounding box. Pure geometry, framework-agnostic —
 * the caller feeds the result to `CanvasDocument.updateShapes` for one batched, undoable
 * mutation.
 */
export class ShapeAligner {
    public constructor(private readonly shapeRegistry: ShapeRegistry) {}

    /**
     * New x/y patches for `op`. Deltas are applied to each shape's *anchor* (x/y), computed
     * from its unrotated AABB, so shapes whose anchor differs from their bounds (arrows with
     * negative dx, draw strokes, normalized rects) move correctly. No-op moves are omitted.
     * Returns `[]` when there is nothing to align (fewer than two shapes).
     */
    public align(shapes: Shape[], op: AlignOp): Array<{ id: string; patch: Partial<Shape> }> {
        if (shapes.length < 2) return [];
        const group = this.shapeRegistry.unionBounds(shapes);
        if (!group) return [];

        const patches: Array<{ id: string; patch: Partial<Shape> }> = [];
        for (const shape of shapes) {
            const bounds = this.shapeRegistry.getBounds(shape);
            const delta = this.delta(op, group, bounds);
            if (delta.dx === 0 && delta.dy === 0) continue;
            patches.push({ id: shape.id, patch: { x: shape.x + delta.dx, y: shape.y + delta.dy } });
        }
        return patches;
    }

    private delta(op: AlignOp, group: Bounds, b: Bounds): { dx: number; dy: number } {
        switch (op) {
            case 'left':
                return { dx: group.x - b.x, dy: 0 };
            case 'right':
                return { dx: group.x + group.w - (b.x + b.w), dy: 0 };
            case 'hcenter':
                return { dx: group.x + group.w / 2 - (b.x + b.w / 2), dy: 0 };
            case 'top':
                return { dx: 0, dy: group.y - b.y };
            case 'bottom':
                return { dx: 0, dy: group.y + group.h - (b.y + b.h) };
            case 'vcenter':
                return { dx: 0, dy: group.y + group.h / 2 - (b.y + b.h / 2) };
        }
    }
}
