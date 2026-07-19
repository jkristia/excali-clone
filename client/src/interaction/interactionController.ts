import { nanoid } from 'nanoid';
import type { ArrowShape, Bounds, Shape } from '../model/types';
import type { Camera, Style, Tool as ToolName } from '../state/uiStore';
import type { Interaction, PointerInfo } from './interaction';
import type { ToolContext } from '../tools/tool';
import { ToolRegistry } from '../tools/toolRegistry';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Handles } from '../util/handles';
import { ResizeMath } from '../util/resizeMath';
import { VectorMath } from '../util/vectorMath';
import { ArrowEndpoints } from '../util/arrowEndpoints';

// Indexed by Handle (NW, N, NE, E, SE, S, SW, W).
const HANDLE_CURSORS = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];

/** Store surface the controller needs — a subset of uiStore's state + actions. */
export interface InteractionStore {
    tool: ToolName;
    style: Style;
    camera: Camera;
    selection: string[];
    setSelection: (ids: string[]) => void;
    toggleSelection: (id: string, additive: boolean) => void;
    clearSelection: () => void;
    setTool: (tool: ToolName) => void;
    panBy: (dxScreen: number, dyScreen: number) => void;
    activateEditing: (id: string) => void;
}

/** Document mutation surface (document/canvasDocument.ts), injected so the controller stays testable. */
export interface InteractionDoc {
    addShape: (shape: Shape) => void;
    updateShapes: (patches: Array<{ id: string; patch: Partial<Shape> }>) => void;
}

export interface InteractionDeps {
    shapes: () => Shape[];
    getStore: () => InteractionStore;
    doc: InteractionDoc;
    author: () => string;
    topZ: () => number;
}

/**
 * Owns the whiteboard's pointer-interaction state machine, extracted from
 * Whiteboard.tsx. Framework-agnostic: no React import, no DOM event types —
 * the view layer translates DOM pointer events into `PointerInfo` (world +
 * screen coords already resolved) and calls these methods.
 *
 * Tool classes (tools/) decide what interaction a pointer-down *starts*; this
 * controller owns what happens *while* an interaction is in progress, since
 * that part (resize/move/marquee/pan stepping) doesn't vary by tool.
 */
export class InteractionController {
    private interaction: Interaction = { kind: 'none' };
    private cursor: string | null = null;

    constructor(
        private readonly deps: InteractionDeps,
        private readonly toolRegistry: ToolRegistry,
        private readonly shapeRegistry: ShapeRegistry,
    ) {}

    public getInteraction(): Interaction {
        return this.interaction;
    }

    public getCursor(): string | null {
        return this.cursor;
    }

    public reset(): void {
        this.interaction = { kind: 'none' };
    }

    private toolContext(): ToolContext {
        const { deps } = this;
        return {
            shapes: deps.shapes,
            selection: () => deps.getStore().selection,
            camera: () => deps.getStore().camera,
            style: () => deps.getStore().style,
            author: deps.author,
            newId: () => nanoid(),
            nextZ: () => deps.topZ() + 1,
            addShape: deps.doc.addShape,
            setSelection: (ids) => deps.getStore().setSelection(ids),
            toggleSelection: (id, additive) => deps.getStore().toggleSelection(id, additive),
            activateEditing: (id) => deps.getStore().activateEditing(id),
        };
    }

    /** `spaceDown` / middle-mouse pan overrides whatever tool is active. */
    public onPointerDown(p: PointerInfo, spaceDown: boolean): void {
        const store = this.deps.getStore();

        if (p.button === 1 || spaceDown || store.tool === 'pan') {
            this.interaction = { kind: 'pan', lastX: p.clientX, lastY: p.clientY };
            return;
        }
        if (p.button !== 0) return;

        const tool = this.toolRegistry.get(store.tool);
        const next = tool.onPointerDown(this.toolContext(), p);
        if (next) this.interaction = next;
    }

    public onPointerMove(p: PointerInfo, shiftKey: boolean): void {
        const store = this.deps.getStore();
        const inter = this.interaction;
        switch (inter.kind) {
            case 'pan': {
                store.panBy(p.clientX - inter.lastX, p.clientY - inter.lastY);
                this.interaction = { kind: 'pan', lastX: p.clientX, lastY: p.clientY };
                break;
            }
            case 'resize': {
                const geom = ResizeMath.compute(inter.orig, inter.handle, p.x, p.y, shiftKey);
                this.deps.doc.updateShapes([{ id: inter.id, patch: {
                    x: geom.w < 0 ? geom.x + geom.w : geom.x,
                    y: geom.h < 0 ? geom.y + geom.h : geom.y,
                    w: Math.abs(geom.w),
                    h: Math.abs(geom.h),
                } }]);
                break;
            }
            case 'arrow-endpoint': {
                const { origX, origY, origDx, origDy, endpoint, id } = inter;
                let patch: Partial<ArrowShape>;
                if (endpoint === 1) {
                    let dx = p.x - origX;
                    let dy = p.y - origY;
                    if (shiftKey) ({ dx, dy } = VectorMath.snapAngle(dx, dy));
                    patch = { dx, dy };
                } else {
                    const headX = origX + origDx;
                    const headY = origY + origDy;
                    let vx = p.x - headX;
                    let vy = p.y - headY;
                    if (shiftKey) ({ dx: vx, dy: vy } = VectorMath.snapAngle(vx, vy));
                    patch = { x: headX + vx, y: headY + vy, dx: -vx, dy: -vy };
                }
                this.deps.doc.updateShapes([{ id, patch }]);
                break;
            }
            case 'create': {
                if (inter.draft.type === 'arrow') {
                    let dx = p.x - inter.startX;
                    let dy = p.y - inter.startY;
                    if (shiftKey) ({ dx, dy } = VectorMath.snapAngle(dx, dy));
                    inter.draft = { ...inter.draft, dx, dy };
                } else if (inter.draft.type === 'rectangle' || inter.draft.type === 'ellipse') {
                    let w = p.x - inter.startX;
                    let h = p.y - inter.startY;
                    if (shiftKey && inter.draft.type === 'ellipse') {
                        const side = Math.sign(w) * Math.min(Math.abs(w), Math.abs(h)) || Math.sign(h) * Math.abs(h);
                        w = side; h = side;
                    }
                    inter.draft = { ...inter.draft, w, h };
                }
                break;
            }
            case 'draw': {
                inter.draft.points.push(p.x - inter.startX, p.y - inter.startY);
                break;
            }
            case 'move': {
                const dx = p.x - inter.startX;
                const dy = p.y - inter.startY;
                if (!inter.moved && Math.hypot(dx, dy) < 2) break;
                inter.moved = true;
                const patches = inter.ids.map((id) => {
                    const o = inter.origins.get(id)!;
                    return { id, patch: { x: o.x + dx, y: o.y + dy } };
                });
                this.deps.doc.updateShapes(patches);
                break;
            }
            case 'marquee': {
                inter.curX = p.x;
                inter.curY = p.y;
                break;
            }
        }

        this.updateCursor(store, p);
    }

    private updateCursor(store: InteractionStore, p: PointerInfo): void {
        if (store.tool !== 'select') {
            this.cursor = null;
            return;
        }
        const inter = this.interaction;
        let newCursor: string | null = null;
        if (inter.kind === 'none' && store.selection.length === 1) {
            const selShape = this.deps.shapes().find((s) => s.id === store.selection[0]);
            if (selShape?.type === 'arrow') {
                const ep = ArrowEndpoints.hitTest(selShape, p.x, p.y, store.camera.zoom);
                if (ep !== null) newCursor = 'crosshair';
            } else if (selShape && (selShape.type === 'rectangle' || selShape.type === 'ellipse')) {
                const h = Handles.hitTest(this.shapeRegistry.getBounds(selShape), p.x, p.y, ArrowEndpoints.HIT_RADIUS / store.camera.zoom);
                if (h !== -1) newCursor = HANDLE_CURSORS[h];
            }
        } else if (inter.kind === 'resize') {
            newCursor = HANDLE_CURSORS[inter.handle];
        } else if (inter.kind === 'arrow-endpoint') {
            newCursor = 'crosshair';
        }
        this.cursor = newCursor;
    }

    public onPointerUp(): void {
        const store = this.deps.getStore();
        const inter = this.interaction;

        if (inter.kind === 'create') {
            const d = inter.draft;
            const bounds = this.boundsOfDraft(d);
            const bigEnough =
                d.type === 'arrow' ? Math.hypot(d.dx, d.dy) > 4 : bounds.w > 3 || bounds.h > 3;
            if (bigEnough) {
                this.deps.doc.addShape(InteractionController.normalizeDraft(d));
                store.setSelection([d.id]);
                store.setTool('select');
            }
        } else if (inter.kind === 'draw') {
            if (inter.draft.points.length >= 4) {
                this.deps.doc.addShape(inter.draft);
            }
        } else if (inter.kind === 'marquee') {
            const rect: Bounds = {
                x: inter.startX,
                y: inter.startY,
                w: inter.curX - inter.startX,
                h: inter.curY - inter.startY,
            };
            if (Math.abs(rect.w) > 3 || Math.abs(rect.h) > 3) {
                const inside = this.shapeRegistry.shapesInRect(this.deps.shapes(), rect).map((s) => s.id);
                store.setSelection(inside);
            }
        }

        this.interaction = { kind: 'none' };
    }

    public onPointerLeave(): void {
        this.cursor = null;
    }

    public boundsOfDraft(d: Shape): Bounds {
        if (d.type === 'rectangle' || d.type === 'ellipse') {
            return { x: d.x, y: d.y, w: Math.abs(d.w), h: Math.abs(d.h) };
        }
        if (d.type === 'arrow') return { x: d.x, y: d.y, w: Math.abs(d.dx), h: Math.abs(d.dy) };
        return this.shapeRegistry.unionBounds([d]) ?? { x: d.x, y: d.y, w: 0, h: 0 };
    }

    /** Normalize negative-extent rectangles/ellipses so x/y is the top-left. */
    public static normalizeDraft(d: Shape): Shape {
        if ((d.type === 'rectangle' || d.type === 'ellipse') && (d.w < 0 || d.h < 0)) {
            return {
                ...d,
                x: d.w < 0 ? d.x + d.w : d.x,
                y: d.h < 0 ? d.y + d.h : d.y,
                w: Math.abs(d.w),
                h: Math.abs(d.h),
            };
        }
        return d;
    }
}
