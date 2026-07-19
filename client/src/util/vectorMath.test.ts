import { describe, expect, it } from 'vitest';
import { VectorMath } from './vectorMath';

describe('VectorMath.snapAngle', () => {
    it('zero-length vector passes through unchanged', () => {
        expect(VectorMath.snapAngle(0, 0)).toEqual({ dx: 0, dy: 0 });
    });

    it('snaps to the nearest step while preserving length', () => {
        const len = 100;
        // 1 degree off from horizontal (0 rad) should snap back to 0 rad.
        const angle = (1 * Math.PI) / 180;
        const dx = Math.cos(angle) * len;
        const dy = Math.sin(angle) * len;
        const result = VectorMath.snapAngle(dx, dy);
        expect(result.dx).toBeCloseTo(len, 5);
        expect(result.dy).toBeCloseTo(0, 5);
    });

    it('an already-snapped 45-degree vector is unchanged (within float tolerance)', () => {
        const len = 50;
        const dx = Math.cos(Math.PI / 4) * len;
        const dy = Math.sin(Math.PI / 4) * len;
        const result = VectorMath.snapAngle(dx, dy);
        expect(result.dx).toBeCloseTo(dx, 5);
        expect(result.dy).toBeCloseTo(dy, 5);
    });
});
