import type { Camera } from '../state/uiStore';
import type { Bounds } from '../model/shapeTypes';

export interface Point {
    x: number;
    y: number;
}

/** Screen <-> world coordinate conversion and zoom math for a Camera. */
export class CameraMath {
    public static readonly MIN_ZOOM = 0.1;
    public static readonly MAX_ZOOM = 8;

    /** Screen (CSS px) -> world coordinates. */
    public static screenToWorld(sx: number, sy: number, cam: Camera): Point {
        return { x: sx / cam.zoom + cam.x, y: sy / cam.zoom + cam.y };
    }

    /** World -> screen (CSS px) coordinates. */
    public static worldToScreen(wx: number, wy: number, cam: Camera): Point {
        return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom };
    }

    /** Zoom toward a fixed screen anchor (keeps the point under the cursor stable). */
    public static zoomAt(cam: Camera, factor: number, anchorX: number, anchorY: number): Camera {
        const nextZoom = CameraMath.clampZoom(cam.zoom * factor);
        if (nextZoom === cam.zoom) return cam;
        // Keep the world point under (anchorX, anchorY) fixed on screen.
        const worldBefore = CameraMath.screenToWorld(anchorX, anchorY, cam);
        const camAfter: Camera = { ...cam, zoom: nextZoom };
        const worldAfter = CameraMath.screenToWorld(anchorX, anchorY, camAfter);
        return {
            zoom: nextZoom,
            x: cam.x + (worldBefore.x - worldAfter.x),
            y: cam.y + (worldBefore.y - worldAfter.y),
        };
    }

    public static clampZoom(z: number): number {
        return Math.max(CameraMath.MIN_ZOOM, Math.min(CameraMath.MAX_ZOOM, z));
    }

    /** Camera that centers `b` in a `viewW`x`viewH` viewport, scaled to fit with `margin` slack around it. */
    public static fitBounds(b: Bounds, viewW: number, viewH: number, margin = 0.1): Camera {
        const zoom = CameraMath.clampZoom(
            Math.min(viewW / Math.max(b.w, 1), viewH / Math.max(b.h, 1)) * (1 - margin),
        );
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return { zoom, x: cx - viewW / (2 * zoom), y: cy - viewH / (2 * zoom) };
    }
}
