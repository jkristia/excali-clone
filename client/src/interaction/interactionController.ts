import { nanoid } from 'nanoid';
import type { ArrowShape, Bounds, Font, Shape } from '../model/shapeTypes';
import type { Camera, Style, Tool as ToolName } from '../state/uiStore';
import type { Interaction, MarqueeMode, PointerInfo, RotateOrigin } from './interaction';
import { MultiPointBuilder } from './multiPointBuilder';
import type { ToolContext } from '../tools/tool';
import { ToolRegistry } from '../tools/toolRegistry';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Handles } from '../util/handles';
import { ResizeMath } from '../util/resizeMath';
import type { ResizeGeometry } from '../util/resizeMath';
import { RotationMath } from '../util/rotationMath';
import { VectorMath } from '../util/vectorMath';
import { GridMath } from '../util/gridMath';
import { ArrowPoints } from '../util/arrowPoints';
import { SceneTree } from '../util/sceneTree';
import { TextOptionsUtil } from '../util/textOptions';
import { SelectionCursor } from './selectionCursor';

/** Store surface the controller needs — a subset of uiStore's state + actions. */
export interface InteractionStore {
    tool: ToolName;
    style: Style;
    camera: Camera;
    snapToGrid: boolean;
    selection: string[];
    editingGroupId: string | null;
    pointEditId: string | null;
    pointEditNodes: readonly number[];
    setSelection: (ids: string[]) => void;
    toggleSelection: (id: string, additive: boolean) => void;
    clearSelection: () => void;
    setTool: (tool: ToolName) => void;
    panBy: (dxScreen: number, dyScreen: number) => void;
    activateEditing: (id: string) => void;
    setEditing: (id: string | null, caret?: { x: number; y: number } | null) => void;
    setPointEditing: (id: string | null) => void;
    setPointEditNodes: (indices: readonly number[]) => void;
    togglePointEditNode: (index: number, additive: boolean) => void;
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
    /** Height a text shape's word-wrapped text needs at the given fixed width. Injected so the
     *  controller can reflow text on horizontal resize without depending on the DOM measurer. */
    measureTextWrap: (text: string, fontSize: number, width: number, fontFamily: Font) => number;
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
    private readonly selectionCursor: SelectionCursor;

    constructor(
        private readonly deps: InteractionDeps,
        private readonly toolRegistry: ToolRegistry,
        private readonly shapeRegistry: ShapeRegistry,
    ) {
        this.selectionCursor = new SelectionCursor(shapeRegistry);
    }

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
            pointEditId: () => deps.getStore().pointEditId,
            pointEditNodes: () => deps.getStore().pointEditNodes,
            setPointEditNodes: (indices) => deps.getStore().setPointEditNodes(indices),
            togglePointEditNode: (index, additive) => deps.getStore().togglePointEditNode(index, additive),
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

        if (this.interaction.kind === 'arrow-multi') {
            const snap = store.snapToGrid && !p.ctrlKey && !p.metaKey;
            this.stepMultiPoint(this.interaction.builder, p, snap, p.shiftKey);
            return;
        }

        const tool = this.toolRegistry.get(store.tool);
        const next = tool.onPointerDown(this.toolContext(), p);
        if (next) this.interaction = next;
    }

    /** One click during multi-point placement: finish if it lands on the last placed
     *  anchor, else append a new anchor (grid-snapped, Shift angle-snapped off that
     *  anchor — matching a fresh 2-point line's snap behavior). */
    private stepMultiPoint(builder: MultiPointBuilder, p: PointerInfo, snap: boolean, shiftKey: boolean): void {
        const radius = ArrowPoints.HIT_RADIUS / this.deps.getStore().camera.zoom;
        if (builder.isOnLastAnchor(p.x, p.y, radius)) {
            this.finishMultiPoint();
            return;
        }
        const { x, y } = this.snapToward(builder.lastAnchor(), p, snap, shiftKey);
        builder.appendAnchor(x, y);
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
                this.deps.doc.updateShapes([{ id: inter.id, patch: this.resizePatch(inter, geom) }]);
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
            case 'arrow-point': {
                const { origX, origY, origPoints, primary, indices, id } = inter;
                // Angle-snap (Shift) relative to the adjacent anchor — for anchor 0 that's
                // anchor 1, otherwise the previous anchor — so Shift still means "5-degree
                // steps off the adjacent segment" as it does for a plain 2-point line.
                // `snapToward` works in world coordinates (matching `p`), so the neighbor
                // and the result must be converted to/from the shape-relative `points` frame.
                const neighborIdx = primary > 0 ? primary - 1 : Math.min(1, origPoints.length / 2 - 1);
                const neighbor = { x: origX + origPoints[neighborIdx * 2], y: origY + origPoints[neighborIdx * 2 + 1] };
                const { x, y } = this.snapToward(neighbor, p, snap, shiftKey);
                // Move every selected anchor by the delta the *grabbed* one travelled, so a
                // multi-node drag stays rigid while the grabbed node still lands on the grid.
                // With a single node this reduces to "put it exactly where it was snapped to".
                const dx = (x - origX) - origPoints[primary * 2];
                const dy = (y - origY) - origPoints[primary * 2 + 1];
                const points = [...origPoints];
                for (const i of indices) {
                    points[i * 2] = origPoints[i * 2] + dx;
                    points[i * 2 + 1] = origPoints[i * 2 + 1] + dy;
                }
                this.deps.doc.updateShapes([{ id, patch: { points } as Partial<ArrowShape> }]);
                break;
            }
            case 'arrow-multi': {
                const { x, y } = this.snapToward(inter.builder.lastAnchor(), p, snap, shiftKey);
                inter.builder.moveCursor(x, y);
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
                    inter.draft = { ...inter.draft, x: ax, y: ay, points: [0, 0, dx, dy] };
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

    /** Grid-snap `p` (independent of `from`), then — only when `shiftKey` is held —
     *  override with an angle-snapped position relative to `from`. Shared by anchor
     *  drags and multi-point placement, which both snap "off the adjacent anchor". */
    private snapToward(from: { x: number; y: number }, p: PointerInfo, snap: boolean, shiftKey: boolean): { x: number; y: number } {
        let x = snap ? GridMath.snap(p.x) : p.x;
        let y = snap ? GridMath.snap(p.y) : p.y;
        if (shiftKey) {
            const angled = VectorMath.snapAngle(x - from.x, y - from.y);
            x = from.x + angled.dx;
            y = from.y + angled.dy;
        }
        return { x, y };
    }

    /** Minimum width a text shape can be dragged to before its text stops wrapping narrower. */
    private static readonly MIN_TEXT_WIDTH = 20;

    /** The shape patch for a resize step. Text resizes width only: it fixes the wrap width,
     *  flags `wrap`, and derives height from the wrapped line count. Everything else is a
     *  generic box resize (normalizing a negative-extent drag to a top-left origin). */
    private resizePatch(inter: Extract<Interaction, { kind: 'resize' }>, geom: ResizeGeometry): Partial<Shape> {
        if (inter.orig.type === 'text') {
            const shape = this.deps.shapes().find((s) => s.id === inter.id);
            if (shape && shape.type === 'text') {
                const width = Math.max(InteractionController.MIN_TEXT_WIDTH, Math.abs(geom.w));
                const resolved = TextOptionsUtil.resolve(shape.textOptions, this.shapeRegistry.getDefinition(shape).defaultTextOptions);
                const h = this.deps.measureTextWrap(shape.text, resolved.fontSize, width, resolved.fontFamily);
                const x = geom.w < 0 ? geom.x + geom.w : geom.x;
                return { x, w: width, wrap: true, h } as Partial<Shape>;
            }
        }
        return {
            x: geom.w < 0 ? geom.x + geom.w : geom.x,
            y: geom.h < 0 ? geom.y + geom.h : geom.y,
            w: Math.abs(geom.w),
            h: Math.abs(geom.h),
        };
    }

    /** Geometry patch for one shape in a multi-selection rotate by `theta` about `pivot`.
     *  Box shapes accumulate the `rotation` field; arrow/draw (both "anchor + relative
     *  points") rotate their coordinates directly. */
    private rotatePatch(o: RotateOrigin, pivot: { x: number; y: number }, theta: number): Partial<Shape> {
        if (o.kind === 'box') {
            const c = RotationMath.rotatePoint(o.cx, o.cy, pivot.x, pivot.y, theta);
            return { x: c.x - o.hw, y: c.y - o.hh, rotation: o.origRotation + theta };
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
                newCursor = this.selectionCursor.forSelectedShape(single, store.pointEditId, store.camera, p.x, p.y);
            } else if (store.selection.length >= 1) {
                // A single group behaves like a multi-selection: one union frame.
                newCursor = this.selectionCursor.forMultiSelection(store.selection, this.deps.shapes(), store.camera, p.x, p.y);
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
        } else if (inter.kind === 'arrow-point' || inter.kind === 'arrow-multi') {
            newCursor = 'crosshair';
        }
        this.cursor = newCursor;
    }

    public onPointerUp(): void {
        const store = this.deps.getStore();
        const inter = this.interaction;

        // A click sequence, not a drag — pointer-up here is just the end of one click,
        // not a commit. Ending the gesture happens via finishMultiPoint.
        if (inter.kind === 'arrow-multi') return;

        if (inter.kind === 'create') {
            const d = inter.draft;
            const bigEnough = this.isBigEnough(d);
            if (!bigEnough && d.type === 'arrow') {
                // A click, not a drag: promote the discarded draft into multi-point mode
                // instead of throwing it away.
                this.interaction = {
                    kind: 'arrow-multi',
                    builder: new MultiPointBuilder({ ...d, points: [0, 0] }, inter.startX, inter.startY),
                };
                return;
            }
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
            // A plain click on the already-selected inline-editable shape opens its
            // editor with the caret at the click point (a drag moved it instead).
            if (!inter.moved && inter.pendingEdit) {
                store.setEditing(inter.pendingEdit.id, { x: inter.pendingEdit.x, y: inter.pendingEdit.y });
            }
        }

        this.interaction = { kind: 'none' };
    }

    public onPointerLeave(): void {
        this.cursor = null;
    }

    /** End the in-progress multi-point line/arrow: commit it when the builder has enough
     *  placed anchors to be worth keeping, otherwise discard it. Every way of ending the
     *  gesture — Enter, Escape, double-click, click-on-last-anchor — routes here, so
     *  ending it never silently throws away a line the user actually drew. A no-op unless
     *  the interaction is `arrow-multi`, so callers needn't check. */
    public finishMultiPoint(): void {
        if (this.interaction.kind !== 'arrow-multi') return;
        const shape = this.interaction.builder.finish();
        this.interaction = { kind: 'none' };
        if (!shape) return;
        const store = this.deps.getStore();
        this.deps.doc.addShape(shape);
        store.setSelection([shape.id]);
        store.setTool('select');
    }

    /** Whether a `create` draft is worth committing — a plain click (or a drag under
     *  the threshold) should be discarded rather than leaving a zero-size shape. */
    private isBigEnough(d: Shape): boolean {
        if (d.type === 'arrow') {
            const pts = d.points;
            return Math.hypot(pts[2] - pts[0], pts[3] - pts[1]) > 4;
        }
        const bounds = this.boundsOfDraft(d);
        return bounds.w > 3 || bounds.h > 3;
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
