import { describe, expect, it } from 'vitest';
import type { Shape } from '../model/types';
import { SceneTree } from './sceneTree';

function rect(id: string, z: number, parentId?: string): Shape {
    return { id, type: 'rectangle', x: 0, y: 0, z, w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 1, createdBy: 'x', parentId };
}

function group(id: string, z: number, parentId?: string): Shape {
    return { id, type: 'group', x: 0, y: 0, z, createdBy: 'x', parentId };
}

describe('SceneTree', () => {
    describe('flattenToPaintOrder', () => {
        it('sorts root siblings by z', () => {
            const shapes = [rect('b', 2), rect('a', 1)];
            expect(SceneTree.flattenToPaintOrder(shapes).map((s) => s.id)).toEqual(['a', 'b']);
        });

        it('emits a group before its members so they paint on top, in z order', () => {
            const shapes = [rect('outside', 5), group('g', 1), rect('m2', 1, 'g'), rect('m1', 0, 'g')];
            expect(SceneTree.flattenToPaintOrder(shapes).map((s) => s.id)).toEqual(['g', 'm1', 'm2', 'outside']);
        });

        it('stacks whole bands: every member of the higher group is above the lower group', () => {
            // g1 (z=0) below g2 (z=1); member z within each is independent.
            const shapes = [
                group('g1', 0),
                group('g2', 1),
                rect('g1m', 9, 'g1'), // high member z, but its band is lower
                rect('g2m', 0, 'g2'),
            ];
            const order = SceneTree.flattenToPaintOrder(shapes).map((s) => s.id);
            expect(order.indexOf('g1m')).toBeLessThan(order.indexOf('g2m'));
        });

        it('treats a dangling parentId as root', () => {
            const shapes = [rect('a', 0, 'missing')];
            expect(SceneTree.flattenToPaintOrder(shapes).map((s) => s.id)).toEqual(['a']);
        });

        it('still renders shapes caught in a parent cycle', () => {
            const a = rect('a', 0, 'b');
            const b = rect('b', 0, 'a'); // b is not a group, so this is malformed anyway
            expect(SceneTree.flattenToPaintOrder([a, b]).map((s) => s.id).sort()).toEqual(['a', 'b']);
        });
    });

    describe('childrenOf', () => {
        it('returns direct children sorted by z', () => {
            const shapes = [group('g', 0), rect('m2', 1, 'g'), rect('m1', 0, 'g'), rect('root', 0)];
            expect(SceneTree.childrenOf(shapes, 'g').map((s) => s.id)).toEqual(['m1', 'm2']);
        });

        it('returns root shapes for undefined parent', () => {
            const shapes = [group('g', 1), rect('root', 0), rect('m', 0, 'g')];
            expect(SceneTree.childrenOf(shapes, undefined).map((s) => s.id)).toEqual(['root', 'g']);
        });
    });

    describe('subtreeIds', () => {
        it('returns the id plus all descendants', () => {
            const shapes = [group('g', 0), rect('m1', 0, 'g'), group('inner', 1, 'g'), rect('m2', 0, 'inner')];
            expect(SceneTree.subtreeIds(shapes, 'g').sort()).toEqual(['g', 'inner', 'm1', 'm2']);
        });
    });

    describe('boundableDescendants', () => {
        it('returns a leaf shape as itself', () => {
            const shapes = [rect('a', 0)];
            expect(SceneTree.boundableDescendants(shapes, 'a').map((s) => s.id)).toEqual(['a']);
        });

        it('returns only geometry-bearing descendants of a group', () => {
            const shapes = [group('g', 0), rect('m1', 0, 'g'), group('inner', 1, 'g'), rect('m2', 0, 'inner')];
            expect(SceneTree.boundableDescendants(shapes, 'g').map((s) => s.id).sort()).toEqual(['m1', 'm2']);
        });
    });

    describe('resolveContainer', () => {
        it('walks to the outermost container', () => {
            const shapes = [group('g', 0), rect('m', 0, 'g')];
            expect(SceneTree.resolveContainer(shapes, 'm')).toBe('g');
        });

        it('resolves a top-level shape to itself', () => {
            const shapes = [rect('a', 0)];
            expect(SceneTree.resolveContainer(shapes, 'a')).toBe('a');
        });

        it('stops at the member directly under the entered group', () => {
            const shapes = [group('g', 0), group('inner', 0, 'g'), rect('m', 0, 'inner')];
            // scoped into g: a click on m selects `inner` (the member under g), not g.
            expect(SceneTree.resolveContainer(shapes, 'm', 'g')).toBe('inner');
        });

        it('selects the member itself when it is a direct child of the entered group', () => {
            const shapes = [group('g', 0), rect('m', 0, 'g')];
            expect(SceneTree.resolveContainer(shapes, 'm', 'g')).toBe('m');
        });
    });
});
