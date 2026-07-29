import { describe, expect, it, vi } from 'vitest';
import { ImageShapeDef, IMAGE_MAX_INITIAL_DIM } from './imageShapeDef';
import { ImageCache } from '../util/imageCache';
import type { ImageShape } from '../model/shapeTypes';

/** Records draw calls without needing a real canvas. */
function recordingContext(): { ctx: CanvasRenderingContext2D; calls: string[] } {
    const calls: string[] = [];
    const ctx = {
        save: () => calls.push('save'),
        restore: () => calls.push('restore'),
        drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => calls.push(`drawImage(${x},${y},${w},${h})`),
        fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect(${x},${y},${w},${h})`),
        strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect(${x},${y},${w},${h})`),
    } as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
}

function shape(over: Partial<ImageShape> = {}): ImageShape {
    return { id: 'i1', type: 'image', x: 10, y: 10, z: 1, createdBy: 'u', w: 20, h: 30, src: 'data:img', ...over };
}

describe('ImageShapeDef.getBounds/hitTest', () => {
    it('normalizes negative w/h', () => {
        const def = new ImageShapeDef(new ImageCache());
        expect(def.getBounds(shape({ x: 10, y: 10, w: -20, h: -30 }))).toEqual({ x: -10, y: -20, w: 20, h: 30 });
    });

    it('hits within the padded bounds', () => {
        const def = new ImageShapeDef(new ImageCache());
        expect(def.hitTest(shape(), 15, 15, 0)).toBe(true);
        expect(def.hitTest(shape(), 100, 100, 0)).toBe(false);
    });
});

describe('ImageShapeDef.draw', () => {
    it('draws a placeholder box while the image has not decoded yet', () => {
        const { ctx, calls } = recordingContext();
        const def = new ImageShapeDef(new ImageCache());
        def.draw(ctx, shape());
        expect(calls).toContain('fillRect(10,10,20,30)');
        expect(calls).toContain('strokeRect(10,10,20,30)');
        expect(calls.some((c) => c.startsWith('drawImage'))).toBe(false);
    });

    it('draws the decoded image once the cache has it', () => {
        const { ctx, calls } = recordingContext();
        const cache = new ImageCache();
        vi.spyOn(cache, 'get').mockReturnValue({} as HTMLImageElement);
        const def = new ImageShapeDef(cache);
        def.draw(ctx, shape());
        expect(calls).toEqual(['drawImage(10,10,20,30)']);
    });
});

describe('ImageShapeDef.initialSize', () => {
    it('returns the natural size when already within the max dimension', () => {
        expect(ImageShapeDef.initialSize(100, 50)).toEqual({ w: 100, h: 50 });
    });

    it('scales the longer side down to the max, preserving aspect ratio', () => {
        expect(ImageShapeDef.initialSize(1600, 800)).toEqual({ w: IMAGE_MAX_INITIAL_DIM, h: IMAGE_MAX_INITIAL_DIM / 2 });
    });

    it('scales by the taller side when height is the longer dimension', () => {
        expect(ImageShapeDef.initialSize(400, 1600)).toEqual({ w: IMAGE_MAX_INITIAL_DIM / 4, h: IMAGE_MAX_INITIAL_DIM });
    });
});
