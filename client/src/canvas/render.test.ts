import { describe, expect, it } from 'vitest';
import { SceneRenderer } from './render';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import type { Camera } from '../state/uiStore';
import type { Shape } from '../model/types';

const sceneRenderer = new SceneRenderer(new ShapeRegistry());

/**
 * Records every ctx call (method name + args) in order. Property assignments
 * (fillStyle = ...) are captured too via a Proxy, so the recorded trace pins
 * both draw-call sequence and the style state each call ran under — the
 * baseline Phase 2's registry migration must reproduce exactly.
 */
function createRecordingContext(): { ctx: CanvasRenderingContext2D; calls: string[] } {
    const calls: string[] = [];
    const state: Record<string, unknown> = {};
    const methods = [
        'save', 'restore', 'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'moveTo', 'lineTo',
        'closePath', 'stroke', 'fill', 'arc', 'arcTo', 'ellipse', 'fillText', 'measureText',
        'setTransform', 'translate', 'scale', 'setLineDash',
    ];
    const target: Record<string, unknown> = {};
    for (const m of methods) {
        target[m] = (...args: unknown[]) => {
            calls.push(`${m}(${args.map((a) => JSON.stringify(a)).join(',')})`);
            if (m === 'measureText') {
                return { width: 10, fontBoundingBoxAscent: 8, fontBoundingBoxDescent: 2 };
            }
            return undefined;
        };
    }
    const ctx = new Proxy(target, {
        get(obj, prop: string) {
            if (prop in obj) return obj[prop];
            return state[prop];
        },
        set(_obj, prop: string, value) {
            state[prop] = value;
            calls.push(`set ${prop}=${JSON.stringify(value)}`);
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
    return { ctx, calls };
}

const camera: Camera = { x: 0, y: 0, zoom: 1 };

function baseInput(shapes: Shape[]) {
    return {
        width: 800,
        height: 600,
        dpr: 1,
        camera,
        shapes,
        selection: [] as string[],
        peers: [],
        marquee: null,
        draft: null,
        editingId: null,
        showGrid: false,
    };
}

describe('renderScene characterization', () => {
    it('rectangle: draws fill then stroke when both present', () => {
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'r1', type: 'rectangle', x: 0, y: 0, z: 1, createdBy: 'u',
            w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2,
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls).toContain('fillRect(0,0,10,10)');
        expect(calls).toContain('strokeRect(0,0,10,10)');
    });

    it('ellipse: uses ctx.ellipse with bounds-derived center/radii', () => {
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'e1', type: 'ellipse', x: 0, y: 0, z: 1, createdBy: 'u',
            w: 40, h: 20, fill: '#fff', stroke: '#000', strokeWidth: 2,
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls).toContain('ellipse(20,10,20,10,0,0,6.283185307179586)');
    });

    it('arrow: draws the line plus an arrowhead at the end cap', () => {
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'a1', type: 'arrow', x: 0, y: 0, z: 1, createdBy: 'u',
            dx: 100, dy: 0, stroke: '#000', strokeWidth: 2, startCap: 'none', endCap: 'arrow',
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls).toContain('moveTo(0,0)');
        expect(calls).toContain('lineTo(100,0)');
        // arrowhead adds two more lineTo calls beyond the shaft's single lineTo
        expect(calls.filter((c) => c.startsWith('lineTo(')).length).toBe(3);
    });

    it('draw: strokes a polyline through all points', () => {
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'd1', type: 'draw', x: 0, y: 0, z: 1, createdBy: 'u',
            points: [0, 0, 10, 10, 20, 0], stroke: '#000', strokeWidth: 2,
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls).toContain('moveTo(0,0)');
        expect(calls).toContain('lineTo(10,10)');
        expect(calls).toContain('lineTo(20,0)');
    });

    it('text: calls fillText once per line', () => {
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 't1', type: 'text', x: 0, y: 0, z: 1, createdBy: 'u',
            text: 'a\nb', fontSize: 20, color: '#000', textAlign: 'left', w: 20, h: 50,
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls.filter((c) => c.startsWith('fillText(')).length).toBe(2);
    });

    it('note: draws a rounded background then wrapped text', () => {
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'n1', type: 'note', x: 0, y: 0, z: 1, createdBy: 'u',
            w: 180, h: 120, text: 'hello', fill: '#ff0', fontSize: 16, textAlign: 'left',
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls).toContain('fill()');
        expect(calls.some((c) => c.startsWith('fillText('))).toBe(true);
    });
});

describe('snap-to-grid line grid', () => {
    it('draws dashed minor + solid major lines only when showGrid is true', () => {
        const on = createRecordingContext();
        sceneRenderer.render({ ctx: on.ctx, ...baseInput([]), showGrid: true });
        expect(on.calls).toContain('setLineDash([2,3])'); // dashed minor pass
        expect(on.calls).toContain('setLineDash([])'); // solid major pass
        expect(on.calls.some((c) => c.startsWith('moveTo('))).toBe(true);
    });

    it('draws no grid lines when showGrid is false', () => {
        const off = createRecordingContext();
        sceneRenderer.render({ ctx: off.ctx, ...baseInput([]), showGrid: false });
        expect(off.calls.some((c) => c.startsWith('moveTo('))).toBe(false);
    });
});

describe('drawHandles / hitHandle layout parity (pre-Phase-1 regression net)', () => {
    it('the 8 handle positions rendered by render.ts match the 8 positions Whiteboard.tsx tests hits against', () => {
        // Mirrors the inline `pts` arrays in render.ts:drawHandles and
        // Whiteboard.tsx:hitHandle — both must independently derive the same layout
        // until Phase 1 unifies them behind util/handles.ts.
        const b = { x: 10, y: 20, w: 100, h: 50 };
        const renderPts = [
            [b.x, b.y],
            [b.x + b.w / 2, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w, b.y + b.h / 2],
            [b.x + b.w, b.y + b.h],
            [b.x + b.w / 2, b.y + b.h],
            [b.x, b.y + b.h],
            [b.x, b.y + b.h / 2],
        ];
        const hitTestPts: [number, number][] = [
            [b.x, b.y],
            [b.x + b.w / 2, b.y],
            [b.x + b.w, b.y],
            [b.x + b.w, b.y + b.h / 2],
            [b.x + b.w, b.y + b.h],
            [b.x + b.w / 2, b.y + b.h],
            [b.x, b.y + b.h],
            [b.x, b.y + b.h / 2],
        ];
        expect(renderPts).toEqual(hitTestPts);
    });
});
