import { describe, expect, it, vi } from 'vitest';
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
        'setTransform', 'translate', 'scale', 'setLineDash', 'createPattern',
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
        editingGroupId: null,
        showGrid: false,
        rotatingSelection: false,
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

    it('rectangle: still fills when hatched (fillStyle set)', () => {
        // fillFor builds an offscreen tile via document.createElement; stub it for the node env.
        vi.stubGlobal('document', {
            createElement: () => ({ width: 0, height: 0, getContext: () => null }),
        });
        try {
            const { ctx, calls } = createRecordingContext();
            const shape: Shape = {
                id: 'r1', type: 'rectangle', x: 0, y: 0, z: 1, createdBy: 'u',
                w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2, fillStyle: 'hatch',
            };
            sceneRenderer.render({ ctx, ...baseInput([shape]) });
            expect(calls).toContain('fillRect(0,0,10,10)');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('opacity: sets globalAlpha from shape.opacity, defaulting to 1 when absent', () => {
        const faint = createRecordingContext();
        const faintShape: Shape = {
            id: 'r1', type: 'rectangle', x: 0, y: 0, z: 1, createdBy: 'u',
            w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2, opacity: 0.5,
        };
        sceneRenderer.render({ ctx: faint.ctx, ...baseInput([faintShape]) });
        expect(faint.calls).toContain('set globalAlpha=0.5');

        const opaque = createRecordingContext();
        const opaqueShape: Shape = {
            id: 'r2', type: 'rectangle', x: 0, y: 0, z: 1, createdBy: 'u',
            w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2,
        };
        sceneRenderer.render({ ctx: opaque.ctx, ...baseInput([opaqueShape]) });
        expect(opaque.calls).toContain('set globalAlpha=1');
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
            text: 'a\nb', color: '#000', textOptions: { fontSize: 18, hAlign: 'left' }, w: 20, h: 50,
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls.filter((c) => c.startsWith('fillText(')).length).toBe(2);
    });

    it('note: draws a rounded background then wrapped text', () => {
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'n1', type: 'note', x: 0, y: 0, z: 1, createdBy: 'u',
            w: 180, h: 120, text: 'hello', fill: '#ff0', textOptions: { fontSize: 14, hAlign: 'left' },
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls).toContain('fill()');
        expect(calls.some((c) => c.startsWith('fillText('))).toBe(true);
    });
});

describe('multi-selection rotate handle', () => {
    // r1 (0,0,10,10) + r2 (0,20,10,10) → union (0,0,10,30), padded (-4,-4,18,38),
    // handle circle centered at [5, -4 - ROTATE_OFFSET] = [5, -28].
    const twoRects: Shape[] = [
        { id: 'r1', type: 'rectangle', x: 0, y: 0, z: 1, createdBy: 'u', w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2 },
        { id: 'r2', type: 'rectangle', x: 0, y: 20, z: 2, createdBy: 'u', w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2 },
    ];

    it('draws the rotate handle circle on the padded union frame when 2+ are selected', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({ ctx, ...baseInput(twoRects), selection: ['r1', 'r2'] });
        expect(calls.some((c) => c.startsWith('arc(5,-28,'))).toBe(true);
    });

    it('draws no rotate handle when nothing is selected', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({ ctx, ...baseInput(twoRects), selection: [] });
        expect(calls.some((c) => c.startsWith('arc('))).toBe(false);
    });

    it('hides the rotate handle while a selection rotate is in progress', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({ ctx, ...baseInput(twoRects), selection: ['r1', 'r2'], rotatingSelection: true });
        expect(calls.some((c) => c.startsWith('arc('))).toBe(false);
        // the dashed union box still draws so the set stays framed while turning
        expect(calls.some((c) => c.startsWith('strokeRect('))).toBe(true);
    });
});

describe('selection outline: groups within a multi-selection', () => {
    // g is a group over r1 (0,0,10,10); r2 (0,20,10,10) is a separate, ungrouped shape.
    const groupAndShape: Shape[] = [
        { id: 'g', type: 'group', x: 0, y: 0, z: 1, createdBy: 'u' },
        { id: 'r1', type: 'rectangle', x: 0, y: 0, z: 1, createdBy: 'u', w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2, parentId: 'g' },
        { id: 'r2', type: 'rectangle', x: 0, y: 20, z: 2, createdBy: 'u', w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2 },
    ];

    it('a lone selected group draws no per-shape outline — only the framed union box covers it', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({ ctx, ...baseInput(groupAndShape), selection: ['g'] });
        // drawOutline (the per-shape outline) pads by 2px; the framed union box pads by 4px.
        expect(calls).not.toContain('strokeRect(-2,-2,14,14)'); // no individual outline for the lone group
        expect(calls).toContain('strokeRect(-4,-4,18,18)'); // framed union box over its member r1
    });

    it('a group selected alongside another shape gets its own outline, same as the plain shape', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({ ctx, ...baseInput(groupAndShape), selection: ['g', 'r2'] });
        // drawOutline pads its box by 2px (the SELECT_COLOR outline's padScreen) before stroking.
        expect(calls).toContain('strokeRect(-2,-2,14,14)'); // group's own outline, over its member r1's bounds
        expect(calls).toContain('strokeRect(-2,18,14,14)'); // r2's own outline
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
