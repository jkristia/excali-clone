import { describe, expect, it } from 'vitest';
import { MultiPointBuilder } from './multiPointBuilder';
import { arrow } from '../test-support/shapeFactories';

describe('MultiPointBuilder', () => {
    it('starts with one placed anchor at the entry click', () => {
        const b = new MultiPointBuilder(arrow({ x: 10, y: 20, points: [0, 0] }), 10, 20);
        expect(b.lastAnchor()).toEqual({ x: 10, y: 20 });
        expect(b.placedAnchors()).toEqual([10, 20]);
    });

    it('preview() adds a live anchor at the cursor without mutating the placed anchors', () => {
        const b = new MultiPointBuilder(arrow({ x: 0, y: 0, points: [0, 0] }), 0, 0);
        b.moveCursor(30, 40);
        expect(b.preview().points).toEqual([0, 0, 30, 40]);
        expect(b.placedAnchors()).toEqual([0, 0]); // moveCursor alone never places an anchor
    });

    it('appendAnchor places a new anchor and becomes the new "last"', () => {
        const b = new MultiPointBuilder(arrow({ x: 0, y: 0, points: [0, 0] }), 0, 0);
        b.appendAnchor(30, 40);
        expect(b.placedAnchors()).toEqual([0, 0, 30, 40]);
        expect(b.lastAnchor()).toEqual({ x: 30, y: 40 });
        // preview() now shows one more anchor than placed: 2 placed + 1 live at the cursor.
        b.moveCursor(30, 40); // appendAnchor also moved the cursor to match
        expect(b.preview().points).toEqual([0, 0, 30, 40, 30, 40]);
    });

    it('isOnLastAnchor respects the given radius', () => {
        const b = new MultiPointBuilder(arrow({ x: 0, y: 0, points: [0, 0] }), 0, 0);
        b.appendAnchor(100, 0);
        expect(b.isOnLastAnchor(101, 0, 5)).toBe(true);
        expect(b.isOnLastAnchor(110, 0, 5)).toBe(false);
    });

    describe('finish', () => {
        it('returns null for just the entry anchor (nothing placed beyond it)', () => {
            const b = new MultiPointBuilder(arrow({ x: 0, y: 0, points: [0, 0] }), 0, 0);
            expect(b.finish()).toBeNull();
        });

        it('returns null for a 2-anchor result under the minimum span', () => {
            const b = new MultiPointBuilder(arrow({ x: 0, y: 0, points: [0, 0] }), 0, 0);
            b.appendAnchor(2, 0); // span 2, below the 4-unit threshold
            expect(b.finish()).toBeNull();
        });

        it('commits a 2-anchor result past the minimum span', () => {
            const b = new MultiPointBuilder(arrow({ x: 0, y: 0, points: [0, 0] }), 0, 0);
            b.appendAnchor(10, 0);
            expect(b.finish()?.points).toEqual([0, 0, 10, 0]);
        });

        it('commits a 3+ anchor result regardless of span (no fast-path threshold applies)', () => {
            const b = new MultiPointBuilder(arrow({ x: 0, y: 0, points: [0, 0] }), 0, 0);
            b.appendAnchor(1, 0);
            b.appendAnchor(2, 0);
            expect(b.finish()?.points).toEqual([0, 0, 1, 0, 2, 0]);
        });
    });
});
