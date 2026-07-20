import { describe, expect, it } from 'vitest';
import { RotationMath } from './rotationMath';

describe('RotationMath.center', () => {
    it('returns the bounds center', () => {
        expect(RotationMath.center({ x: 10, y: 20, w: 100, h: 50 })).toEqual({ x: 60, y: 45 });
    });
});

describe('RotationMath.rotatePoint', () => {
    it('is a no-op at angle 0', () => {
        expect(RotationMath.rotatePoint(5, 7, 0, 0, 0)).toEqual({ x: 5, y: 7 });
    });

    it('rotates 90deg clockwise about the pivot (screen y-down)', () => {
        const r = RotationMath.rotatePoint(1, 0, 0, 0, Math.PI / 2);
        expect(r.x).toBeCloseTo(0, 10);
        expect(r.y).toBeCloseTo(1, 10);
    });

    it('un-rotating reverses rotating', () => {
        const a = RotationMath.rotatePoint(30, 12, 5, 5, 0.7);
        const back = RotationMath.rotatePoint(a.x, a.y, 5, 5, -0.7);
        expect(back.x).toBeCloseTo(30, 10);
        expect(back.y).toBeCloseTo(12, 10);
    });
});

describe('RotationMath.snap', () => {
    it('snaps to the nearest 5-degree step', () => {
        expect(RotationMath.snap(0)).toBe(0);
        // 0.0997 rad (~5.7deg) snaps down to one 5deg step.
        expect(RotationMath.snap(0.0997)).toBeCloseTo(RotationMath.SNAP_STEP, 10);
        // A multiple of the step is left unchanged.
        expect(RotationMath.snap(RotationMath.SNAP_STEP * 4)).toBeCloseTo(RotationMath.SNAP_STEP * 4, 10);
    });
});
