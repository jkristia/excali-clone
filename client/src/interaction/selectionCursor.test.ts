import { describe, expect, it } from 'vitest';
import { SelectionCursor } from './selectionCursor';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import type { Camera } from '../state/uiStore';
import { arrow, rect } from '../test-support/shapeFactories';

const camera: Camera = { x: 0, y: 0, zoom: 1 };
const cursor = new SelectionCursor(new ShapeRegistry());

describe('SelectionCursor.forSelectedShape', () => {
    it('shows crosshair over an arrow anchor', () => {
        const s = arrow({ x: 0, y: 0, points: [0, 0, 100, 0] });
        expect(cursor.forSelectedShape(s, null, camera, 0, 0)).toBe('crosshair');
        expect(cursor.forSelectedShape(s, null, camera, 50, 0)).toBeNull();
    });

    it('shows crosshair over a midpoint only in point-edit mode', () => {
        const s = arrow({ id: 'a1', x: 0, y: 0, points: [0, 0, 100, 0] });
        expect(cursor.forSelectedShape(s, null, camera, 50, 0)).toBeNull();
        expect(cursor.forSelectedShape(s, 'a1', camera, 50, 0)).toBe('crosshair');
    });

    it('shows a resize cursor over a box shape\'s handle', () => {
        const s = rect({ x: 0, y: 0, w: 100, h: 50 });
        expect(cursor.forSelectedShape(s, null, camera, 0, 0)).toBe('nwse-resize');
    });

    it('returns null away from any handle', () => {
        const s = rect({ x: 0, y: 0, w: 100, h: 50 });
        expect(cursor.forSelectedShape(s, null, camera, 50, 25)).toBeNull();
    });
});

describe('SelectionCursor.forMultiSelection', () => {
    it('shows grab over the union frame\'s rotate handle', () => {
        const shapes = [rect({ id: 'r1', x: 0, y: 0, w: 100, h: 50 }), rect({ id: 'r2', x: 0, y: 100, w: 100, h: 50 })];
        // union (0,0,100,150), padded (-4,-4,108,158), center (50,75), handle [50, -28].
        expect(cursor.forMultiSelection(['r1', 'r2'], shapes, camera, 50, -28)).toBe('grab');
        expect(cursor.forMultiSelection(['r1', 'r2'], shapes, camera, 50, 75)).toBeNull();
    });

    it('returns null for an empty selection', () => {
        expect(cursor.forMultiSelection([], [], camera, 0, 0)).toBeNull();
    });
});
