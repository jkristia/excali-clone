import { nanoid } from 'nanoid';
import type { ArrowShape, Bounds, Shape } from '../model/types';
import type { Camera, Style, Tool as ToolName } from '../state/uiStore';
import type { Interaction, MarqueeMode, PointerInfo, RotateOrigin } from './interaction';
import type { ToolContext } from '../tools/tool';
import { ToolRegistry } from '../tools/toolRegistry';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Handles } from '../util/handles';
import { ResizeMath } from '../util/resizeMath';
import { RotationMath } from '../util/rotationMath';
import { VectorMath } from '../util/vectorMath';
import { GridMath } from '../util/gridMath';
import { ArrowEndpoints } from '../util/arrowEndpoints';
import { SceneTree } from '../util/sceneTree';

/** Store surface the controller needs — a subset of uiStore's state + actions. */
export interface InteractionStore {
    tool: ToolName;
    style: Style;
    camera: Camera;
    snapToGrid: boolean;
    selection: string[];
    editingGroupId: string | null;
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
            editingGroupId: () => deps.getStore().editingGroupId,
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
        // Snap to grid when the mode is on; Ctrl/Cmd held temporarily disables it.
        const snap = store.snapToGrid && !p.ctrlKey && !p.metaKey;
        switch (inter.kind) {
            case 'pan': {
                store.panBy(p.clientX - inter.lastX, p.clientY - inter.lastY);
                this.interaction = { kind: 'pan', lastX: p.clientX, lastY: p.clientY };
                break;
            }
            case 'resize': {
                // Snapping the world pointer lands the grabbed edge/corner on the
                // grid; only meaningful axis-aligned, so skip it for rotated shapes.
                const snapH = snap && !inter.orig.rotation;
                const rx = snapH ? GridMath.snap(p.x) : p.x;
                const ry = snapH ? GridMath.snap(p.y) : p.y;
                const geom = inter.orig.rotation
                    ? ResizeMath.computeRotated(inter.orig, inter.handle, inter.orig.rotation, p.x, p.y, shiftKey)
                    : ResizeMath.compute(inter.orig, inter.handle, rx, ry, shiftKey);
                this.deps.doc.updateShapes([{ id: inter.id, patch: {
                    x: geom.w < 0 ? geom.x + geom.w : geom.x,
                    y: geom.h < 0 ? geom.y + geom.h : geom.y,
                    w: Math.abs(geom.w),
                    h: Math.abs(geom.h),
                } }]);
                break;
            }
            case 'rotate': {
                let rot = inter.origRotation + (Math.atan2(p.y - inter.cy, p.x - inter.cx) - inter.startPointerAngle);
                if (shiftKey) rot = RotationMath.snap(rot);
                this.deps.doc.updateShapes([{ id: inter.id, patch: { rotation: rot } }]);
                break;
            }
            case 'rotate-selection': {
                const { pivot } = inter;
                let theta = Math.atan2(p.y - pivot.y, p.x - pivot.x) - inter.startPointerAngle;
                if (shiftKey) theta = RotationMath.snap(theta);
                const patches = [...inter.origins].map(([id, o]) => ({ id, patch: this.rotatePatch(o, pivot, theta) }));
                this.deps.doc.updateShapes(patches);
                break;
            }
            case 'arrow-endpoint': {
                const { origX, origY, origDx, origDy, endpoint, id } = inter;
                // Snap the dragged endpoint to a grid node (matching create); the
                // fixed end stays put and Shift still angle-snaps on top.
                const px = snap ? GridMath.snap(p.x) : p.x;
                const py = snap ? GridMath.snap(p.y) : p.y;
                let patch: Partial<ArrowShape>;
                if (endpoint === 1) {
                    let dx = px - origX;
                    let dy = py - origY;
                    if (shiftKey) ({ dx, dy } = VectorMath.snapAngle(dx, dy));
                    patch = { dx, dy };
                } else {
                    const headX = origX + origDx;
                    const headY = origY + origDy;
                    let vx = px - headX;
                    let vy = py - headY;
                    if (shiftKey) ({ dx: vx, dy: vy } = VectorMath.snapAngle(vx, vy));
                    patch = { x: headX + vx, y: headY + vy, dx: -vx, dy: -vy };
                }
                this.deps.doc.updateShapes([{ id, patch }]);
                break;
            }
            case 'create': {
                if (inter.draft.type === 'arrow') {
                    // Snap both endpoints to grid nodes; Shift still angle-snaps.
                    const ax = snap ? GridMath.snap(inter.startX) : inter.startX;
                    const ay = snap ? GridMath.snap(inter.startY) : inter.startY;
                    let dx = (snap ? GridMath.snap(p.x) : p.x) - ax;
                    let dy = (snap ? GridMath.snap(p.y) : p.y) - ay;
                    if (shiftKey) ({ dx, dy } = VectorMath.snapAngle(dx, dy));
                    inter.draft = { ...inter.draft, x: ax, y: ay, dx, dy };
                } else if (
                    inter.draft.type === 'rectangle' ||
                    inter.draft.type === 'ellipse' ||
                    inter.draft.type === 'diamond'
                ) {
                    // Snap the box by snapping both the start and the moving corner.
                    const x0 = snap ? GridMath.snap(inter.startX) : inter.startX;
                    const y0 = snap ? GridMath.snap(inter.startY) : inter.startY;
                    let w = (snap ? GridMath.snap(p.x) : p.x) - x0;
                    let h = (snap ? GridMath.snap(p.y) : p.y) - y0;
                    if (shiftKey && inter.draft.type === 'ellipse') {
                        const side = Math.sign(w) * Math.min(Math.abs(w), Math.abs(h)) || Math.sign(h) * Math.abs(h);
                        w = side; h = side;
                    }
                    inter.draft = { ...inter.draft, x: x0, y: y0, w, h };
                }
                break;
            }
            case 'draw': {
                inter.draft.points.push(p.x - inter.startX, p.y - inter.startY);
                break;
            }
            case 'move': {
                let dx = p.x - inter.startX;
                let dy = p.y - inter.startY;
                if (!inter.moved && Math.hypot(dx, dy) < 2) break;
                inter.moved = true;
                // Snap the selection's bounding box (not each anchor) so the group
                // moves as a unit and arrows/draw shapes snap by their visible box.
                if (snap) {
                    const gx = inter.groupX + dx;
                    const gy = inter.groupY + dy;
                    dx += GridMath.snap(gx) - gx;
                    dy += GridMath.snap(gy) - gy;
                }
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

    /** Geometry patch for one shape in a multi-selection rotate by `theta` about `pivot`.
     *  Box shapes accumulate the `rotation` field; arrow/draw rotate coordinates directly. */
    private rotatePatch(o: RotateOrigin, pivot: { x: number; y: number }, theta: number): Partial<Shape> {
        if (o.kind === 'box') {
            const c = RotationMath.rotatePoint(o.cx, o.cy, pivot.x, pivot.y, theta);
            return { x: c.x - o.hw, y: c.y - o.hh, rotation: o.origRotation + theta };
        }
        if (o.kind === 'arrow') {
            const s = RotationMath.rotatePoint(o.x, o.y, pivot.x, pivot.y, theta);
            const e = RotationMath.rotatePoint(o.x + o.dx, o.y + o.dy, pivot.x, pivot.y, theta);
            return { x: s.x, y: s.y, dx: e.x - s.x, dy: e.y - s.y };
        }
        const a = RotationMath.rotatePoint(o.x, o.y, pivot.x, pivot.y, theta);
        const points: number[] = [];
        for (let i = 0; i + 1 < o.points.length; i += 2) {
            const rp = RotationMath.rotatePoint(o.points[i], o.points[i + 1], 0, 0, theta);
            points.push(rp.x, rp.y);
        }
        return { x: a.x, y: a.y, points };
    }

    private updateCursor(store: InteractionStore, p: PointerInfo): void {
        if (store.tool !== 'select') {
            this.cursor = null;
            return;
        }
        const inter = this.interaction;
        let newCursor: string | null = null;
        if (inter.kind === 'none') {
            const single = store.selection.length === 1
                ? this.deps.shapes().find((s) => s.id === store.selection[0])
                : undefined;
            if (single && single.type !== 'group') {
                newCursor = this.selectedShapeCursor(store, p);
            } else if (store.selection.length >= 1) {
                // A single group behaves like a multi-selection: one union frame.
                newCursor = this.multiSelectionCursor(store, p);
            }
            // Over any shape body a click selects+moves it (see SelectTool), so
            // show the move cursor there — but never over an anchor of the
            // selected shape, which was resolved above.
            if (!newCursor && this.shapeRegistry.topShapeAt(this.deps.shapes(), p.x, p.y)) {
                newCursor = 'move';
            }
        } else if (inter.kind === 'resize') {
            newCursor = Handles.cursor(inter.handle, inter.orig.rotation);
        } else if (inter.kind === 'rotate' || inter.kind === 'rotate-selection') {
            newCursor = 'grabbing';
        } else if (inter.kind === 'arrow-endpoint') {
            newCursor = 'crosshair';
        }
        this.cursor = newCursor;
    }

    /** Hover cursor for the single selected shape's endpoints / handles, else null. */
    private selectedShapeCursor(store: InteractionStore, p: PointerInfo): string | null {
        const selShape = this.deps.shapes().find((s) => s.id === store.selection[0]);
        if (!selShape) return null;
        if (selShape.type === 'arrow') {
            const ep = ArrowEndpoints.hitTest(selShape, p.x, p.y, store.camera.zoom);
            return ep !== null ? 'crosshair' : null;
        }
        const bounds = this.shapeRegistry.getBounds(selShape);
        const radius = ArrowEndpoints.HIT_RADIUS / store.camera.zoom;
        const c = RotationMath.center(bounds);
        const local = RotationMath.rotatePoint(p.x, p.y, c.x, c.y, -(selShape.rotation ?? 0));
        if (this.shapeRegistry.isRotatable(selShape)) {
            const [rx, ry] = Handles.rotateHandlePoint(bounds, Handles.ROTATE_OFFSET / store.camera.zoom);
            if (Math.hypot(local.x - rx, local.y - ry) <= radius) return 'grab';
        }
        if (this.shapeRegistry.isResizable(selShape)) {
            const h = Handles.hitTest(bounds, local.x, local.y, radius);
            if (h !== -1) return Handles.cursor(h, selShape.rotation ?? 0);
        }
        return null;
    }

    /** Hover cursor over a multi-selection's rotate handle (off the padded union frame), else null. */
    private multiSelectionCursor(store: InteractionStore, p: PointerInfo): string | null {
        const members = store.selection.flatMap((id) => SceneTree.boundableDescendants(this.deps.shapes(), id));
        const union = this.shapeRegistry.unionBounds(members);
        if (!union) return null;
        const zoom = store.camera.zoom;
        const frame = Handles.padBounds(union, Handles.SELECTION_PAD / zoom);
        const [rx, ry] = Handles.rotateHandlePoint(frame, Handles.ROTATE_OFFSET / zoom);
        const radius = ArrowEndpoints.HIT_RADIUS / zoom;
        return Math.hypot(p.x - rx, p.y - ry) <= radius ? 'grab' : null;
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
                const enclosed = this.shapeRegistry.shapesInRect(this.deps.shapes(), rect);
                const inside = this.resolveMarquee(enclosed.map((s) => s.id), store.editingGroupId);
                store.setSelection(this.combineMarquee(inter.mode, store.selection, inside));
            }
        } else if (inter.kind === 'move') {
            // A deferred (overlap) selection switch: apply it only if this was a
            // click, not a drag — a drag has already moved the existing selection.
            if (!inter.moved && inter.pendingSelect !== undefined) {
                store.setSelection([inter.pendingSelect]);
            }
        }

        this.interaction = { kind: 'none' };
    }

    public onPointerLeave(): void {
        this.cursor = null;
    }

    /**
     * Map marquee-enclosed leaf ids to what should actually be selected: each leaf's
     * top-level container (so enclosing a group's members selects the group), deduped.
     * While scoped inside a group, restrict to that group's own members.
     */
    private resolveMarquee(leafIds: string[], editingGroupId: string | null): string[] {
        const shapes = this.deps.shapes();
        let ids = leafIds;
        if (editingGroupId) {
            const scope = new Set(SceneTree.subtreeIds(shapes, editingGroupId));
            ids = ids.filter((id) => id !== editingGroupId && scope.has(id));
        }
        const resolved = new Set<string>();
        for (const id of ids) resolved.add(SceneTree.resolveContainer(shapes, id, editingGroupId));
        return [...resolved];
    }

    /** Combine the marquee-enclosed ids with the prior selection per the drag's modifier mode. */
    private combineMarquee(mode: MarqueeMode, prior: string[], inside: string[]): string[] {
        switch (mode) {
            case 'replace':
                return inside;
            case 'add':
                return [...prior, ...inside.filter((id) => !prior.includes(id))];
            case 'subtract':
                return prior.filter((id) => !inside.includes(id));
        }
    }

    public boundsOfDraft(d: Shape): Bounds {
        if (d.type === 'rectangle' || d.type === 'ellipse' || d.type === 'diamond') {
            return { x: d.x, y: d.y, w: Math.abs(d.w), h: Math.abs(d.h) };
        }
        if (d.type === 'arrow') return { x: d.x, y: d.y, w: Math.abs(d.dx), h: Math.abs(d.dy) };
        return this.shapeRegistry.unionBounds([d]) ?? { x: d.x, y: d.y, w: 0, h: 0 };
    }

    /** Normalize negative-extent box shapes (rectangle/ellipse/diamond) so x/y is the top-left. */
    public static normalizeDraft(d: Shape): Shape {
        if ((d.type === 'rectangle' || d.type === 'ellipse' || d.type === 'diamond') && (d.w < 0 || d.h < 0)) {
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
