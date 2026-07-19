import { describe, expect, it, beforeEach } from 'vitest';
import { InteractionController, type InteractionStore } from './interactionController';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { ToolRegistry } from '../tools/toolRegistry';
import type { Shape } from '../model/types';
import type { PointerInfo } from './interaction';

function makeStore(overrides: Partial<InteractionStore> = {}): InteractionStore {
    return {
        tool: 'select',
        style: {
            stroke: '#000', fill: 'transparent', strokeWidth: 2, fontSize: 20, textAlign: 'left',
            noteFill: '#fff', startCap: 'none', endCap: 'arrow',
        },
        camera: { x: 0, y: 0, zoom: 1 },
        selection: [],
        setSelection(ids) { this.selection = ids; },
        toggleSelection: () => {},
        clearSelection: () => {},
        setTool: () => {},
        panBy: () => {},
        activateEditing: () => {},
        ...overrides,
    };
}

function pointer(x: number, y: number, extra: Partial<PointerInfo> = {}): PointerInfo {
    return { x, y, clientX: x, clientY: y, button: 0, shiftKey: false, ...extra };
}

const rect: Shape = {
    id: 'r1', type: 'rectangle', x: 0, y: 0, z: 0, createdBy: 'u',
    w: 100, h: 50, fill: 'transparent', stroke: '#000', strokeWidth: 2,
};

describe('InteractionController', () => {
    let addedShapes: Shape[];
    let patches: Array<{ id: string; patch: Partial<Shape> }>;
    let store: InteractionStore;
    let controller: InteractionController;
    let shapes: Shape[];

    beforeEach(() => {
        addedShapes = [];
        patches = [];
        shapes = [rect];
        store = makeStore();
        const shapeRegistry = new ShapeRegistry();
        controller = new InteractionController({
            shapes: () => shapes,
            getStore: () => store,
            doc: {
                addShape: (s) => addedShapes.push(s),
                updateShapes: (p) => patches.push(...p),
            },
            author: () => 'u',
            topZ: () => 0,
        }, new ToolRegistry(shapeRegistry), shapeRegistry);
    });

    it('pan tool: pointer-down + move updates camera via store.panBy', () => {
        store.tool = 'pan';
        let panned: [number, number] | null = null;
        store.panBy = (dx, dy) => { panned = [dx, dy]; };

        controller.onPointerDown(pointer(10, 10), false);
        expect(controller.getInteraction().kind).toBe('pan');
        controller.onPointerMove(pointer(15, 25), false);
        expect(panned).toEqual([5, 15]);
    });

    it('select tool: dragging an unselected shape moves it via updateShapes', () => {
        controller.onPointerDown(pointer(10, 10), false);
        expect(controller.getInteraction().kind).toBe('move');
        controller.onPointerMove(pointer(20, 30), false);
        expect(patches).toEqual([{ id: 'r1', patch: { x: 10, y: 20 } }]);
        controller.onPointerUp();
        expect(controller.getInteraction().kind).toBe('none');
    });

    it('select tool: empty-space drag starts a marquee and selects contained shapes', () => {
        let selected: string[] | null = null;
        store.setSelection = (ids) => { selected = ids; };

        controller.onPointerDown(pointer(-10, -10), false);
        expect(controller.getInteraction().kind).toBe('marquee');
        controller.onPointerMove(pointer(200, 200), false);
        controller.onPointerUp();
        expect(selected).toEqual(['r1']);
    });

    it('select tool: resize handle drag patches the shape via ResizeMath', () => {
        store.selection = ['r1'];
        controller.onPointerDown(pointer(0, 0), false); // top-left handle
        expect(controller.getInteraction().kind).toBe('resize');
        controller.onPointerMove(pointer(10, 5), false);
        expect(patches).toEqual([{ id: 'r1', patch: { x: 10, y: 5, w: 90, h: 45 } }]);
    });

    it('rectangle tool: drag creates a draft and commits on pointer-up if big enough', () => {
        store.tool = 'rectangle';
        let toolAfter: string | null = null;
        store.setTool = (t) => { toolAfter = t; };

        controller.onPointerDown(pointer(0, 0), false);
        const inter = controller.getInteraction();
        expect(inter.kind).toBe('create');
        controller.onPointerMove(pointer(50, 40), false);
        controller.onPointerUp();

        expect(addedShapes).toHaveLength(1);
        expect(addedShapes[0]).toMatchObject({ type: 'rectangle', w: 50, h: 40 });
        expect(toolAfter).toBe('select');
    });

    it('rectangle tool: tiny drag does not commit a shape', () => {
        store.tool = 'rectangle';
        controller.onPointerDown(pointer(0, 0), false);
        controller.onPointerMove(pointer(1, 1), false);
        controller.onPointerUp();
        expect(addedShapes).toHaveLength(0);
    });

    it('text tool: click adds a shape immediately without entering a drag interaction', () => {
        store.tool = 'text';
        let editingId: string | null = null;
        store.activateEditing = (id) => { editingId = id; };

        controller.onPointerDown(pointer(5, 5), false);
        expect(controller.getInteraction().kind).toBe('none');
        expect(addedShapes).toHaveLength(1);
        expect(addedShapes[0].type).toBe('text');
        expect(editingId).toBe(addedShapes[0].id);
    });

    it('space-drag pans regardless of the active tool', () => {
        store.tool = 'rectangle';
        controller.onPointerDown(pointer(0, 0), true);
        expect(controller.getInteraction().kind).toBe('pan');
    });
});
