import { describe, expect, it } from 'vitest';
import { Handle, Handles } from './handles';

const b = { x: 10, y: 20, w: 100, h: 50 };

describe('Handles.points', () => {
    it('returns the 8 corner/edge-midpoint positions clockwise from top-left', () => {
        expect(Handles.points(b)).toEqual([
            [10, 20], [60, 20], [110, 20],
            [110, 45],
            [110, 70], [60, 70], [10, 70],
            [10, 45],
        ]);
    });
});

describe('Handles.hitTest', () => {
    it('returns the handle within radius', () => {
        expect(Handles.hitTest(b, 10, 20, 5)).toBe(Handle.NW);
        expect(Handles.hitTest(b, 110, 70, 5)).toBe(Handle.SE);
    });

    it('returns -1 when no handle is within radius', () => {
        expect(Handles.hitTest(b, 60, 45, 5)).toBe(-1);
    });

    it('matches render.ts drawHandles / Whiteboard.tsx hitHandle layout (regression net)', () => {
        // Both call sites now delegate to Handles.points, so this pins the single
        // source of truth the two previously duplicated independently.
        expect(Handles.points(b).length).toBe(8);
    });
});

describe('Handles.rotateHandlePoint', () => {
    it('floats above the top-edge midpoint by the given world offset', () => {
        expect(Handles.rotateHandlePoint(b, 24)).toEqual([60, -4]);
    });
});

describe('Handles.isCorner', () => {
    it('is true for the four corners, false for the four edges', () => {
        expect([Handle.NW, Handle.NE, Handle.SE, Handle.SW].every(Handles.isCorner)).toBe(true);
        expect([Handle.N, Handle.E, Handle.S, Handle.W].some(Handles.isCorner)).toBe(false);
    });
});

describe('Handles.cursor', () => {
    it('maps each handle to its axis-aligned cursor when unrotated', () => {
        expect(Handles.cursor(Handle.NW, 0)).toBe('nwse-resize');
        expect(Handles.cursor(Handle.SE, 0)).toBe('nwse-resize');
        expect(Handles.cursor(Handle.NE, 0)).toBe('nesw-resize');
        expect(Handles.cursor(Handle.SW, 0)).toBe('nesw-resize');
        expect(Handles.cursor(Handle.N, 0)).toBe('ns-resize');
        expect(Handles.cursor(Handle.S, 0)).toBe('ns-resize');
        expect(Handles.cursor(Handle.E, 0)).toBe('ew-resize');
        expect(Handles.cursor(Handle.W, 0)).toBe('ew-resize');
    });

    it('rotates the cursor axis with the shape at 90deg', () => {
        const q = Math.PI / 2;
        expect(Handles.cursor(Handle.N, q)).toBe('ew-resize');
        expect(Handles.cursor(Handle.E, q)).toBe('ns-resize');
        expect(Handles.cursor(Handle.NW, q)).toBe('nesw-resize');
        expect(Handles.cursor(Handle.NE, q)).toBe('nwse-resize');
    });

    it('snaps a near-axis rotation to the nearest cursor bucket', () => {
        const tenDeg = (10 * Math.PI) / 180;
        expect(Handles.cursor(Handle.N, tenDeg)).toBe('ns-resize');
        expect(Handles.cursor(Handle.E, tenDeg)).toBe('ew-resize');
    });
});
