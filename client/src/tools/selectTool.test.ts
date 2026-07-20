import { describe, expect, it } from 'vitest';
import { SelectTool } from './selectTool';
import type { ToolContext } from './tool';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Handle } from '../util/handles';
import type { ArrowShape, RectShape, Shape } from '../model/types';
import type { PointerInfo } from '../interaction/interaction';

/** Records the mutations the tool asks its context to perform. */
interface CtxState {
    selection: string[];
    setSelectionCalls: string[][];
    toggleCalls: Array<{ id: string; additive: boolean }>;
}

function makeCtx(shapes: Shape[], selection: string[] = [], zoom = 1): { ctx: ToolContext; state: CtxState } {
    const state: CtxState = { selection: [...selection], setSelectionCalls: [], toggleCalls: [] };
    const ctx: ToolContext = {
        shapes: () => shapes,
        selection: () => state.selection,
        camera: () => ({ x: 0, y: 0, zoom }),
        style: () => ({
            stroke: '#000', fill: 'transparent', strokeWidth: 2, strokeStyle: 'solid', fontSize: 20, textAlign: 'left',
            noteFill: '#fff', startCap: 'none', endCap: 'arrow', edges: 'sharp',
        }),
        author: () => 'u',
        newId: () => 'new',
        nextZ: () => 0,
        addShape: () => {},
        setSelection: (ids) => { state.setSelectionCalls.push(ids); state.selection = ids; },
        toggleSelection: (id, additive) => { state.toggleCalls.push({ id, additive }); state.selection = [...state.selection, id]; },
        activateEditing: () => {},
    };
    return { ctx, state };
}

function pointer(x: number, y: number, extra: Partial<PointerInfo> = {}): PointerInfo {
    return { x, y, clientX: x, clientY: y, button: 0, shiftKey: false, ctrlKey: false, metaKey: false, ...extra };
}

// 100x50 rectangle anchored at the origin, so bounds center is (50, 25) and its
// resize handles sit on the 0/50/100 x and 0/25/50 y grid.
function rect(over: Partial<RectShape> = {}): RectShape {
    return {
        id: 'r1', type: 'rectangle', x: 0, y: 0, z: 0, createdBy: 'u',
        w: 100, h: 50, fill: 'transparent', stroke: '#000', strokeWidth: 2, ...over,
    };
}

// Horizontal arrow from (0,0) to (100,0): tail endpoint 0, head endpoint 1.
function arrow(over: Partial<ArrowShape> = {}): ArrowShape {
    return {
        id: 'a1', type: 'arrow', x: 0, y: 0, z: 0, createdBy: 'u',
        dx: 100, dy: 0, stroke: '#000', strokeWidth: 2, startCap: 'none', endCap: 'arrow', ...over,
    };
}

describe('SelectTool', () => {
    const tool = () => new SelectTool(new ShapeRegistry());

    describe('single selected arrow: endpoint grab takes priority', () => {
        it('grabs the tail endpoint', () => {
            const { ctx } = makeCtx([arrow()], ['a1']);
            const result = tool().onPointerDown(ctx, pointer(0, 0));
            expect(result).toEqual({
                kind: 'arrow-endpoint', id: 'a1', endpoint: 0,
                origX: 0, origY: 0, origDx: 100, origDy: 0,
            });
        });

        it('grabs the head endpoint', () => {
            const { ctx } = makeCtx([arrow()], ['a1']);
            const result = tool().onPointerDown(ctx, pointer(100, 0));
            expect(result).toMatchObject({ kind: 'arrow-endpoint', id: 'a1', endpoint: 1 });
        });

        it('falls through to a body drag when the pointer misses both endpoints', () => {
            const { ctx, state } = makeCtx([arrow()], ['a1']);
            const result = tool().onPointerDown(ctx, pointer(50, 0)); // mid-line, > HIT_RADIUS from either end
            expect(result?.kind).toBe('move');
            expect(state.setSelectionCalls).toEqual([]); // already selected, selection untouched
        });
    });

    describe('single selected shape: rotate / resize handles', () => {
        it('grabs the rotate handle above the top edge', () => {
            const { ctx } = makeCtx([rect()], ['r1']);
            const result = tool().onPointerDown(ctx, pointer(50, -24)); // ROTATE_OFFSET above top-middle
            expect(result).toMatchObject({ kind: 'rotate', id: 'r1', cx: 50, cy: 25, origRotation: 0 });
            expect((result as { startPointerAngle: number }).startPointerAngle).toBeCloseTo(-Math.PI / 2, 6);
        });

        it('grabs the top-left resize handle with its original bounds', () => {
            const { ctx } = makeCtx([rect()], ['r1']);
            const result = tool().onPointerDown(ctx, pointer(0, 0));
            expect(result).toEqual({
                kind: 'resize', id: 'r1', handle: Handle.NW,
                orig: { x: 0, y: 0, w: 100, h: 50, type: 'rectangle', rotation: 0 },
            });
        });

        it('hit-tests handles in the shape\'s rotated local frame', () => {
            // Rotated 90° clockwise, the world point (75, 25) un-rotates onto the
            // top-middle (N) handle at local (50, 0).
            const { ctx } = makeCtx([rect({ rotation: Math.PI / 2 })], ['r1']);
            const result = tool().onPointerDown(ctx, pointer(75, 25));
            expect(result).toMatchObject({ kind: 'resize', id: 'r1', handle: Handle.N });
        });

        it('ignores handles when more than one shape is selected', () => {
            const shapes = [rect(), rect({ id: 'r2', x: 300 })];
            const { ctx } = makeCtx(shapes, ['r1', 'r2']);
            const result = tool().onPointerDown(ctx, pointer(0, 0)); // over r1's NW handle
            expect(result?.kind).not.toBe('resize');
        });
    });

    describe('shape body clicks', () => {
        it('selects and starts moving an unselected shape', () => {
            const { ctx, state } = makeCtx([rect()]);
            const result = tool().onPointerDown(ctx, pointer(50, 25));
            expect(state.setSelectionCalls).toEqual([['r1']]);
            expect(result).toEqual({
                kind: 'move', ids: ['r1'], startX: 50, startY: 25,
                origins: new Map([['r1', { x: 0, y: 0 }]]), moved: false,
            });
        });

        it('moves an already-selected shape without re-selecting it', () => {
            const { ctx, state } = makeCtx([rect()], ['r1']);
            const result = tool().onPointerDown(ctx, pointer(50, 25));
            expect(state.setSelectionCalls).toEqual([]);
            expect(result).toMatchObject({ kind: 'move', ids: ['r1'] });
        });

        it('shift-click adds the shape to the selection and moves the whole set', () => {
            const shapes = [rect(), rect({ id: 'r2', x: 300, y: 300 })];
            const { ctx, state } = makeCtx(shapes, ['r2']);
            const result = tool().onPointerDown(ctx, pointer(50, 25, { shiftKey: true }));
            expect(state.toggleCalls).toEqual([{ id: 'r1', additive: true }]);
            expect(result).toEqual({
                kind: 'move', ids: ['r2', 'r1'], startX: 50, startY: 25,
                origins: new Map([['r2', { x: 300, y: 300 }], ['r1', { x: 0, y: 0 }]]), moved: false,
            });
        });
    });

    describe('overlapping shapes: drag vs deferred select', () => {
        // r2 sits on top of the selected r1, overlapping it at (50, 25).
        const shapes = () => [rect(), rect({ id: 'r2', z: 1 })];

        it('drags the selected lower shape and defers switching to the top one', () => {
            const { ctx, state } = makeCtx(shapes(), ['r1']);
            const result = tool().onPointerDown(ctx, pointer(50, 25));
            expect(state.setSelectionCalls).toEqual([]); // selection kept for the drag
            expect(result).toMatchObject({ kind: 'move', ids: ['r1'], pendingSelect: 'r2' });
        });
    });

    describe('empty-space clicks start a marquee', () => {
        it('clears the selection and marks replace mode on a plain click', () => {
            const { ctx, state } = makeCtx([rect()], ['r1']);
            const result = tool().onPointerDown(ctx, pointer(-50, -50));
            expect(state.setSelectionCalls).toEqual([[]]);
            expect(result).toEqual({ kind: 'marquee', startX: -50, startY: -50, curX: -50, curY: -50, mode: 'replace' });
        });

        it('keeps the selection and marks add mode when shift is held', () => {
            const { ctx, state } = makeCtx([rect()], ['r1']);
            const result = tool().onPointerDown(ctx, pointer(-50, -50, { shiftKey: true }));
            expect(state.setSelectionCalls).toEqual([]);
            expect(result).toMatchObject({ kind: 'marquee', mode: 'add' });
        });

        it('keeps the selection and marks subtract mode when ctrl is held', () => {
            const { ctx, state } = makeCtx([rect()], ['r1']);
            const result = tool().onPointerDown(ctx, pointer(-50, -50, { ctrlKey: true }));
            expect(state.setSelectionCalls).toEqual([]);
            expect(result).toMatchObject({ kind: 'marquee', mode: 'subtract' });
        });

        it('marks subtract mode when meta (cmd) is held', () => {
            const { ctx, state } = makeCtx([rect()], ['r1']);
            const result = tool().onPointerDown(ctx, pointer(-50, -50, { metaKey: true }));
            expect(state.setSelectionCalls).toEqual([]);
            expect(result).toMatchObject({ kind: 'marquee', mode: 'subtract' });
        });
    });
});
