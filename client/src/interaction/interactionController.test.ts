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
            stroke: '#000', fill: 'transparent', strokeWidth: 2, strokeStyle: 'solid', fillStyle: 'solid', opacity: 1, fontSize: 20, labelFontSize: 16, labelHAlign: 'center', labelVAlign: 'middle', textAlign: 'left',
            noteFill: '#fff', startCap: 'none', endCap: 'arrow', edges: 'sharp',
        },
        camera: { x: 0, y: 0, zoom: 1 },
        snapToGrid: false,
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
    return { x, y, clientX: x, clientY: y, button: 0, shiftKey: false, ctrlKey: false, metaKey: false, ...extra };
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

    describe('overlapping shape: move vs select', () => {
        // A second rectangle drawn on top of `rect`, overlapping it at (50, 25).
        const top: Shape = { ...rect, id: 'r2', z: 1 };

        beforeEach(() => {
            shapes = [rect, top];
            store.selection = ['r1']; // the lower shape is selected
        });

        it('drag over the overlap moves the selected (lower) shape, not the top one', () => {
            let selected: string[] | null = null;
            store.setSelection = (ids) => { selected = ids; };

            controller.onPointerDown(pointer(50, 25), false);
            expect(controller.getInteraction().kind).toBe('move');
            controller.onPointerMove(pointer(60, 45), false);
            controller.onPointerUp();

            expect(patches).toEqual([{ id: 'r1', patch: { x: 10, y: 20 } }]);
            expect(selected).toBeNull(); // selection untouched by a drag
        });

        it('click over the overlap selects the top shape on pointer-up', () => {
            let selected: string[] | null = null;
            store.setSelection = (ids) => { selected = ids; };

            controller.onPointerDown(pointer(50, 25), false);
            controller.onPointerUp(); // no move: a plain click
            expect(selected).toEqual(['r2']);
            expect(patches).toEqual([]);
        });

        it('press-drag on a non-overlapping unselected shape still selects and moves it', () => {
            const far: Shape = { ...rect, id: 'r3', x: 300, y: 300, z: 2 };
            shapes = [rect, far];
            let selected: string[] | null = null;
            store.setSelection = (ids) => { selected = ids; store.selection = ids; };

            controller.onPointerDown(pointer(350, 325), false);
            expect(selected).toEqual(['r3']);
            controller.onPointerMove(pointer(360, 345), false);
            expect(patches).toEqual([{ id: 'r3', patch: { x: 310, y: 320 } }]);
        });
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

    describe('modifier marquee combines with the existing selection', () => {
        // r2 sits far from r1, so a marquee over r1 never encloses it.
        const far: Shape = { ...rect, id: 'r2', x: 300, y: 300 };
        let selected: string[] | null;

        beforeEach(() => {
            shapes = [rect, far];
            selected = null;
            store.setSelection = (ids) => { selected = ids; };
        });

        it('shift-drag adds the enclosed shape to the existing selection', () => {
            store.selection = ['r2'];
            controller.onPointerDown(pointer(-10, -10, { shiftKey: true }), false);
            controller.onPointerMove(pointer(200, 200), false);
            controller.onPointerUp();
            expect(selected).toEqual(['r2', 'r1']);
        });

        it('shift-drag does not duplicate an already-selected enclosed shape', () => {
            store.selection = ['r1', 'r2'];
            controller.onPointerDown(pointer(-10, -10, { shiftKey: true }), false);
            controller.onPointerMove(pointer(200, 200), false);
            controller.onPointerUp();
            expect(selected).toEqual(['r1', 'r2']);
        });

        it('ctrl-drag removes the enclosed shape from the existing selection', () => {
            store.selection = ['r1', 'r2'];
            controller.onPointerDown(pointer(-10, -10, { ctrlKey: true }), false);
            controller.onPointerMove(pointer(200, 200), false);
            controller.onPointerUp();
            expect(selected).toEqual(['r2']);
        });
    });

    it('select tool: resize handle drag patches the shape via ResizeMath', () => {
        store.selection = ['r1'];
        controller.onPointerDown(pointer(0, 0), false); // top-left handle
        expect(controller.getInteraction().kind).toBe('resize');
        controller.onPointerMove(pointer(10, 5), false);
        expect(patches).toEqual([{ id: 'r1', patch: { x: 10, y: 5, w: 90, h: 45 } }]);
    });

    it('select tool: rotate handle drag patches the shape rotation', () => {
        store.selection = ['r1'];
        controller.onPointerDown(pointer(50, -24), false); // rotate handle above the top edge
        expect(controller.getInteraction().kind).toBe('rotate');
        controller.onPointerMove(pointer(99, 25), false); // drag to the right of the center
        const last = patches.at(-1) as { id: string; patch: { rotation: number } };
        expect(last.id).toBe('r1');
        expect(last.patch.rotation).toBeCloseTo(Math.PI / 2, 5);
    });

    it('select tool: shift snaps rotation to 5-degree steps', () => {
        store.selection = ['r1'];
        controller.onPointerDown(pointer(50, -24), false);
        controller.onPointerMove(pointer(54, -15), true); // ~5.7deg, shift-snapped
        const rot = (patches.at(-1) as { patch: { rotation: number } }).patch.rotation;
        const steps = rot / ((5 * Math.PI) / 180);
        expect(steps).toBeCloseTo(Math.round(steps), 6);
        expect(rot).toBeGreaterThan(0);
    });

    describe('multi-selection rotate about the union center', () => {
        // Grab the union rotate handle and drag to (150, 50) — directly right of the
        // pivot — which is a 90° clockwise turn from the handle's start angle (−π/2).
        function rotate90(startHandle: [number, number]) {
            controller.onPointerDown(pointer(startHandle[0], startHandle[1]), false);
            expect(controller.getInteraction().kind).toBe('rotate-selection');
            controller.onPointerMove(pointer(150, 50), false);
        }
        const last = (id: string) => patches.filter((p) => p.id === id).at(-1)?.patch;

        it('orbits box anchors and accumulates each rotation', () => {
            // r1 (0,0,100,50) + r2 (0,50,100,50) → union (0,0,100,100), pivot (50,50),
            // handle at [50, -28].
            const r2: Shape = { ...rect, id: 'r2', y: 50 };
            shapes = [rect, r2];
            store.selection = ['r1', 'r2'];
            rotate90([50, -28]);
            const p1 = last('r1') as { x: number; y: number; rotation: number };
            expect(p1.x).toBeCloseTo(25, 6);
            expect(p1.y).toBeCloseTo(25, 6);
            expect(p1.rotation).toBeCloseTo(Math.PI / 2, 6);
            const p2 = last('r2') as { x: number; y: number; rotation: number };
            expect(p2.x).toBeCloseTo(-25, 6);
            expect(p2.y).toBeCloseTo(25, 6);
            expect(p2.rotation).toBeCloseTo(Math.PI / 2, 6);
        });

        it('rotates arrow endpoints and draw points explicitly (no rotation field)', () => {
            const arrow: Shape = {
                id: 'a1', type: 'arrow', x: 0, y: 0, z: 0, createdBy: 'u',
                dx: 100, dy: 0, stroke: '#000', strokeWidth: 2, startCap: 'none', endCap: 'arrow',
            };
            const draw: Shape = {
                id: 'd1', type: 'draw', x: 0, y: 0, z: 0, createdBy: 'u',
                points: [0, 0, 0, 100], stroke: '#000', strokeWidth: 2,
            };
            shapes = [arrow, draw]; // union (0,0,100,100), pivot (50,50), handle [50,-28]
            store.selection = ['a1', 'd1'];
            rotate90([50, -28]);
            const pa = last('a1') as { x: number; y: number; dx: number; dy: number };
            expect(pa.x).toBeCloseTo(100, 6);
            expect(pa.y).toBeCloseTo(0, 6);
            expect(pa.dx).toBeCloseTo(0, 6);
            expect(pa.dy).toBeCloseTo(100, 6);
            expect('rotation' in (last('a1') as object)).toBe(false);
            const pd = last('d1') as { x: number; y: number; points: number[] };
            expect(pd.x).toBeCloseTo(100, 6);
            expect(pd.y).toBeCloseTo(0, 6);
            expect(pd.points[0]).toBeCloseTo(0, 6);
            expect(pd.points[1]).toBeCloseTo(0, 6);
            expect(pd.points[2]).toBeCloseTo(-100, 6);
            expect(pd.points[3]).toBeCloseTo(0, 6);
        });

        it('shift snaps the rotation delta to 5-degree steps', () => {
            const r2: Shape = { ...rect, id: 'r2', y: 50 };
            shapes = [rect, r2];
            store.selection = ['r1', 'r2'];
            controller.onPointerDown(pointer(50, -28), false);
            controller.onPointerMove(pointer(54, -19), true); // small drag, shift-snapped
            const rot = (last('r1') as { rotation: number }).rotation;
            const steps = rot / ((5 * Math.PI) / 180);
            expect(steps).toBeCloseTo(Math.round(steps), 6);
        });
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

    describe('snap to grid', () => {
        it('move snaps the selection bounding box to the grid', () => {
            store.snapToGrid = true;
            controller.onPointerDown(pointer(10, 10), false); // selects + moves r1 (origin 0,0)
            controller.onPointerMove(pointer(33, 27), false); // dx 23 / dy 17 -> snap group to 20/20
            expect(patches.at(-1)).toEqual({ id: 'r1', patch: { x: 20, y: 20 } });
        });

        it('Ctrl held during a move disables snapping', () => {
            store.snapToGrid = true;
            controller.onPointerDown(pointer(10, 10), false);
            controller.onPointerMove(pointer(33, 27, { ctrlKey: true }), false);
            expect(patches.at(-1)).toEqual({ id: 'r1', patch: { x: 23, y: 17 } });
        });

        it('resize snaps the grabbed corner to the grid', () => {
            store.snapToGrid = true;
            store.selection = ['r1'];
            controller.onPointerDown(pointer(0, 0), false); // NW handle
            controller.onPointerMove(pointer(23, 11), false); // snaps pointer to (20, 20)
            expect(patches.at(-1)).toEqual({ id: 'r1', patch: { x: 20, y: 20, w: 80, h: 30 } });
        });

        it('create snaps the new shape box to grid nodes', () => {
            store.tool = 'rectangle';
            store.snapToGrid = true;
            controller.onPointerDown(pointer(3, 4), false); // start snaps to (0, 0)
            controller.onPointerMove(pointer(57, 44), false); // corner snaps to (60, 40)
            controller.onPointerUp();
            expect(addedShapes[0]).toMatchObject({ type: 'rectangle', x: 0, y: 0, w: 60, h: 40 });
        });

        it('create snaps both endpoints of a line/arrow to grid nodes', () => {
            store.tool = 'arrow';
            store.snapToGrid = true;
            controller.onPointerDown(pointer(3, 4), false); // tail snaps to (0, 0)
            controller.onPointerMove(pointer(57, 44), false); // head snaps to (60, 40)
            controller.onPointerUp();
            expect(addedShapes[0]).toMatchObject({ type: 'arrow', x: 0, y: 0, dx: 60, dy: 40 });
        });

        it('dragging a line/arrow endpoint snaps it to the grid', () => {
            const arrow: Shape = {
                id: 'a1', type: 'arrow', x: 0, y: 0, z: 0, createdBy: 'u',
                dx: 100, dy: 0, stroke: '#000', strokeWidth: 2, startCap: 'none', endCap: 'arrow',
            };
            shapes = [arrow];
            store.selection = ['a1'];
            store.snapToGrid = true;
            controller.onPointerDown(pointer(100, 0), false); // grabs the head endpoint
            controller.onPointerMove(pointer(57, 44), false); // head snaps to (60, 40)
            expect(patches.at(-1)).toEqual({ id: 'a1', patch: { dx: 60, dy: 40 } });
        });
    });

    describe('hover cursor', () => {
        it('shows the move cursor over any shape body', () => {
            controller.onPointerMove(pointer(50, 25), false);
            expect(controller.getCursor()).toBe('move');
        });

        it('shows resize cursors over a selected shape\'s anchors', () => {
            store.selection = ['r1'];
            controller.onPointerMove(pointer(0, 0), false); // top-left corner
            expect(controller.getCursor()).toBe('nwse-resize');
            controller.onPointerMove(pointer(50, 0), false); // top-middle
            expect(controller.getCursor()).toBe('ns-resize');
        });

        it('rotates the anchor cursor with a rotated shape', () => {
            shapes = [{ ...rect, rotation: Math.PI / 2 }];
            store.selection = ['r1'];
            // Top-middle anchor un-rotates to the right-middle edge of the box.
            controller.onPointerMove(pointer(75, 25), false);
            expect(controller.getCursor()).toBe('ew-resize');
        });

        it('is null over empty space', () => {
            controller.onPointerMove(pointer(-50, -50), false);
            expect(controller.getCursor()).toBeNull();
        });
    });
});
