import { describe, expect, it } from 'vitest';
import { GridMath } from './gridMath';

describe('GridMath.snap', () => {
    it('rounds to the nearest minor grid line', () => {
        expect(GridMath.snap(0)).toBe(0);
        expect(GridMath.snap(9)).toBe(0);
        expect(GridMath.snap(11)).toBe(GridMath.MINOR);
        expect(GridMath.snap(GridMath.MINOR * 3 + 2)).toBe(GridMath.MINOR * 3);
    });

    it('rounds half up (toward +infinity)', () => {
        expect(GridMath.snap(GridMath.MINOR / 2)).toBe(GridMath.MINOR);
    });

    it('handles negative coordinates', () => {
        expect(GridMath.snap(-9)).toBeCloseTo(0); // -0 is fine

        expect(GridMath.snap(-11)).toBe(-GridMath.MINOR);
        expect(GridMath.snap(-GridMath.MINOR * 2 - 1)).toBe(-GridMath.MINOR * 2);
    });

    it('leaves exact multiples unchanged', () => {
        expect(GridMath.snap(GridMath.MINOR * 7)).toBe(GridMath.MINOR * 7);
        expect(GridMath.snap(GridMath.MAJOR)).toBe(GridMath.MAJOR);
    });

    it('MAJOR is DIVISIONS minor lines', () => {
        expect(GridMath.MAJOR).toBe(GridMath.MINOR * GridMath.DIVISIONS);
    });
});
