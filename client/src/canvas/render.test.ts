import { describe, expect, it } from 'vitest';
import { SceneRenderer } from './render';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import type { Camera } from '../state/uiStore';
import type { Shape } from '../model/shapeTypes';

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
        'bezierCurveTo', 'closePath', 'stroke', 'fill', 'arc', 'arcTo', 'ellipse', 'fillText', 'measureText',
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
        draftAnchors: null,
        editingId: null,
        editingGroupId: null,
        pointEditId: null,
        pointEditNodes: [] as readonly number[],
        showGrid: false,
        rotatingSelection: false,
    };
}

describe('renderScene characterization', () => {
    it('rectangle: draws fill then stroke when both present', () => {
        // RoughJS sketches the outline as bezier curves rather than a single strokeRect/
        // fillRect call, even at 'plain' (roughness 0) — assert the fill-then-stroke
        // sequence and colors instead of the old exact-geometry calls.
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'r1', type: 'rectangle', x: 0, y: 0, z: 1, createdBy: 'u',
            w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2,
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        const fillCallIdx = calls.indexOf('fill("evenodd")');
        const strokeCallIdx = calls.indexOf('stroke()');
        expect(calls).toContain('set fillStyle="#fff"');
        expect(calls).toContain('set strokeStyle="#000"');
        expect(fillCallIdx).toBeGreaterThanOrEqual(0);
        expect(strokeCallIdx).toBeGreaterThan(fillCallIdx);
    });

    it('rectangle: still fills when hatched (fillStyle set)', () => {
        // A hatch/cross-hatch fill has no enclosed region to fillRect — RoughJS paints it
        // as hachure lines stroked in the fill color (a 'fillSketch' opset), so assert
        // that instead of a fillRect call.
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'r1', type: 'rectangle', x: 0, y: 0, z: 1, createdBy: 'u',
            w: 10, h: 10, fill: '#fff', stroke: '#000', strokeWidth: 2, fillStyle: 'hatch',
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls).toContain('set strokeStyle="#fff"'); // hachure lines stroked in the fill color
        expect(calls.filter((c) => c === 'stroke()').length).toBeGreaterThanOrEqual(2); // hachure + outline
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

    it('ellipse: sketches a closed bezier curve inscribed in its bounds', () => {
        // RoughJS approximates an ellipse with a chain of bezier curves rather than
        // ctx.ellipse() — assert it's actually drawn (fill + stroke), not the old exact call.
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'e1', type: 'ellipse', x: 0, y: 0, z: 1, createdBy: 'u',
            w: 40, h: 20, fill: '#fff', stroke: '#000', strokeWidth: 2,
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls.some((c) => c.startsWith('bezierCurveTo('))).toBe(true);
        // 'nonzero', not 'evenodd' — RoughJS's own renderer fills an ellipse's sketchy
        // double-stroke fillPath with 'nonzero'; 'evenodd' would cancel the two curves'
        // shared interior and leave only a sliver filled (see roughDraw.test.ts).
        expect(calls).toContain('fill("nonzero")');
        expect(calls).toContain('stroke()');
    });

    it('arrow: draws the line plus an arrowhead at the end cap', () => {
        // The shaft is sketched via RoughJS (bezier ops, even at roughness 0); the
        // arrowhead cap is still drawn exactly, as two lineTo segments from the tip.
        const { ctx, calls } = createRecordingContext();
        const shape: Shape = {
            id: 'a1', type: 'arrow', x: 0, y: 0, z: 1, createdBy: 'u',
            points: [0, 0, 100, 0], stroke: '#000', strokeWidth: 2, startCap: 'none', endCap: 'arrow',
        };
        sceneRenderer.render({ ctx, ...baseInput([shape]) });
        expect(calls.some((c) => c.startsWith('bezierCurveTo('))).toBe(true);
        expect(calls.filter((c) => c.startsWith('lineTo(')).length).toBe(2);
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

describe('arrow point-edit handles', () => {
    // 3 anchors → 3 anchor handles, and 2 midpoint insert dots once in point-edit mode.
    const curve: Shape = {
        id: 'a1', type: 'arrow', x: 0, y: 0, z: 1, createdBy: 'u',
        points: [0, 0, 50, 50, 100, 0], stroke: '#000', strokeWidth: 2, startCap: 'none', endCap: 'none',
    };
    const arcCalls = (calls: string[]) => calls.filter((c) => c.startsWith('arc('));

    it('a selected arrow draws one handle per anchor and no insert dots', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({ ctx, ...baseInput([curve]), selection: ['a1'] });
        expect(arcCalls(calls)).toHaveLength(3);
    });

    it('point-edit mode adds a midpoint dot per segment', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({ ctx, ...baseInput([curve]), selection: ['a1'], pointEditId: 'a1' });
        expect(arcCalls(calls)).toHaveLength(5); // 3 anchors + 2 midpoints
    });

    // A selected anchor inverts its fill/stroke, so a white *stroke* is the marker that
    // identifies one — the solid midpoint dots also fill in SELECT_COLOR, so fill alone
    // can't tell them apart.
    const SELECTED_NODE = 'set strokeStyle="#fff"';

    it('selected nodes invert their fill so they read as picked', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({
            ctx, ...baseInput([curve]), selection: ['a1'], pointEditId: 'a1', pointEditNodes: [1],
        });
        expect(calls).toContain(SELECTED_NODE);
        expect(calls).toContain('set fillStyle="#fff"'); // the two unselected anchors
    });

    it('ignores node indices past the end — a peer can shrink points under the selection', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({
            ctx, ...baseInput([curve]), selection: ['a1'], pointEditId: 'a1', pointEditNodes: [99],
        });
        expect(arcCalls(calls)).toHaveLength(5); // still drawn, just nothing highlighted
        expect(calls).not.toContain(SELECTED_NODE);
    });

    it('draws no node highlight when the arrow is selected but not point-edited', () => {
        const { ctx, calls } = createRecordingContext();
        sceneRenderer.render({ ctx, ...baseInput([curve]), selection: ['a1'], pointEditNodes: [1] });
        expect(calls).not.toContain(SELECTED_NODE);
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
