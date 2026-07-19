import { describe, expect, it } from 'vitest';
import { CameraMath } from './camera';
import type { Camera } from '../state/uiStore';

describe('CameraMath', () => {
    it('screenToWorld / worldToScreen round-trip', () => {
        const cam: Camera = { x: 10, y: 20, zoom: 2 };
        const world = CameraMath.screenToWorld(40, 60, cam);
        expect(world).toEqual({ x: 30, y: 50 });
        expect(CameraMath.worldToScreen(world.x, world.y, cam)).toEqual({ x: 40, y: 60 });
    });

    it('clampZoom clamps to [MIN_ZOOM, MAX_ZOOM]', () => {
        expect(CameraMath.clampZoom(0)).toBe(CameraMath.MIN_ZOOM);
        expect(CameraMath.clampZoom(100)).toBe(CameraMath.MAX_ZOOM);
        expect(CameraMath.clampZoom(1)).toBe(1);
    });

    it('zoomAt keeps the world point under the anchor fixed on screen', () => {
        const cam: Camera = { x: 0, y: 0, zoom: 1 };
        const next = CameraMath.zoomAt(cam, 2, 100, 50);
        const worldAtAnchor = CameraMath.screenToWorld(100, 50, next);
        expect(worldAtAnchor.x).toBeCloseTo(100);
        expect(worldAtAnchor.y).toBeCloseTo(50);
        expect(next.zoom).toBe(2);
    });

    it('zoomAt returns the same camera object when zoom does not change (clamped)', () => {
        const cam: Camera = { x: 0, y: 0, zoom: CameraMath.MAX_ZOOM };
        expect(CameraMath.zoomAt(cam, 2, 0, 0)).toBe(cam);
    });

    it('fitBounds centers the bounds in the viewport', () => {
        // 200x100 box centered at (150,100); 800x600 viewport, 10% margin.
        const cam = CameraMath.fitBounds({ x: 50, y: 50, w: 200, h: 100 }, 800, 600);
        // Limiting axis is width: 800/200 * 0.9 = 3.6.
        expect(cam.zoom).toBeCloseTo(3.6);
        // The bounds center must map to the viewport center.
        const center = CameraMath.worldToScreen(150, 100, cam);
        expect(center.x).toBeCloseTo(400);
        expect(center.y).toBeCloseTo(300);
    });

    it('fitBounds clamps zoom and stays finite for zero-size bounds', () => {
        const cam = CameraMath.fitBounds({ x: 0, y: 0, w: 0, h: 0 }, 800, 600);
        expect(cam.zoom).toBe(CameraMath.MAX_ZOOM);
        expect(Number.isFinite(cam.x)).toBe(true);
        expect(Number.isFinite(cam.y)).toBe(true);
    });
});
