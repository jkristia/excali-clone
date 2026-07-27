import type { Interaction, MarqueeMode, PointerInfo, RotateOrigin } from '../interaction/interaction';
import type { Shape } from '../model/shapeTypes';
import type { Tool, ToolContext } from './tool';
import { NO_PANEL_CAPABILITIES } from './tool';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Handles } from '../util/handles';
import { RotationMath } from '../util/rotationMath';
import { ArrowPoints } from '../util/arrowPoints';
import { SplineMath } from '../util/splineMath';
import { SceneTree } from '../util/sceneTree';

/**
 * Select tool: resize-handle / arrow-endpoint grab takes priority when exactly one
 * resizable shape is selected, then shape drag, then marquee.
 */
export class SelectTool implements Tool {
    public readonly panelCapabilities = NO_PANEL_CAPABILITIES;

    constructor(private readonly shapeRegistry: ShapeRegistry) { }

    public onPointerDown(ctx: ToolContext, p: PointerInfo): Interaction | null {
        const selection = ctx.selection();
        const selShape = selection.length === 1 ? ctx.shapes().find((s) => s.id === selection[0]) : undefined;
        // A single group behaves like a multi-selection (one union frame with a
        // rotate handle), not a single shape with its own resize/rotate handles.
        if (selShape && selShape.type !== 'group') {
            if (selShape.type === 'arrow') {
                const arrowPoint = this.tryStartArrowPoint(ctx, selShape, p);
                if (arrowPoint !== undefined) return arrowPoint;
            } else {
                const bounds = this.shapeRegistry.getBounds(selShape);
                const rot = selShape.rotation ?? 0;
                const radius = ArrowPoints.HIT_RADIUS / ctx.camera().zoom;
                // Handles are drawn in the shape's rotated frame, so test the
                // pointer un-rotated into that local frame.
                const c = RotationMath.center(bounds);
                const local = RotationMath.rotatePoint(p.x, p.y, c.x, c.y, -rot);

                if (this.shapeRegistry.isRotatable(selShape)) {
                    const [rx, ry] = Handles.rotateHandlePoint(bounds, Handles.ROTATE_OFFSET / ctx.camera().zoom);
                    if (Math.hypot(local.x - rx, local.y - ry) <= radius) {
                        return {
                            kind: 'rotate', id: selShape.id, cx: c.x, cy: c.y,
                            startPointerAngle: Math.atan2(p.y - c.y, p.x - c.x), origRotation: rot,
                        };
                    }
                }
                if (this.shapeRegistry.isResizable(selShape)) {
                    const allowed = Handles.activeHandles(this.shapeRegistry.resizeAxis(selShape));
                    const hIdx = Handles.hitTest(bounds, local.x, local.y, radius, allowed);
                    if (hIdx !== -1) {
                        return {
                            kind: 'resize', id: selShape.id, handle: hIdx,
                            orig: { ...bounds, type: selShape.type, rotation: rot },
                        };
                    }
                }
            }
        }
        // A single group takes the same union-frame rotate handle as a multi-selection.
        if (selection.length > 1 || (selShape && selShape.type === 'group')) {
            const rotate = this.tryStartSelectionRotate(ctx, selection, p);
            if (rotate) return rotate;
        }

        const hit = this.shapeRegistry.topShapeAt(ctx.shapes(), p.x, p.y);
        if (hit) {
            // Resolve the hit member up to the group that should select as a unit
            // (or, while scoped into a group, to the member itself).
            const target = SceneTree.resolveContainer(ctx.shapes(), hit.id, ctx.editingGroupId());
            const already = selection.includes(target);
            if (p.shiftKey) {
                ctx.toggleSelection(target, true);
                return this.startMove(ctx, ctx.selection(), p);
            }
            if (already) {
                const move = this.startMove(ctx, selection, p);
                // A plain click (no drag) on the single already-selected inline-editable
                // shape opens its editor with the caret at the click point — resolved on
                // pointer-up so a drag still moves it. Double-click (select-all) is handled
                // separately by the canvas dblclick handler.
                if (selShape && this.isInlineEditable(selShape) && !p.ctrlKey && !p.metaKey) {
                    move.pendingEdit = { id: selShape.id, x: p.x, y: p.y };
                }
                return move;
            }
            // `target` is unselected. If the CURRENT selection is plural (several ids, or
            // a single group standing in for its members) and one of its shapes sits under
            // the pointer too, a drag should move that existing selection and only a plain
            // click should switch — defer to pointer-up. A lone selected shape never steals
            // a drag aimed at a different shape that merely overlaps it at this point —
            // that click means "grab the thing under the pointer," not "keep dragging what
            // I had selected before."
            const isPluralSelection = selection.length > 1 || (selShape && selShape.type === 'group');
            const overlapsSelection = isPluralSelection && ctx.shapes().some(
                (s) => this.shapeRegistry.hitTest(s, p.x, p.y)
                    && selection.includes(SceneTree.resolveContainer(ctx.shapes(), s.id, ctx.editingGroupId())),
            );
            if (overlapsSelection) {
                return this.startMove(ctx, selection, p, target);
            }
            ctx.setSelection([target]);
            return this.startMove(ctx, [target], p);
        }

        const mode: MarqueeMode = p.shiftKey ? 'add' : p.ctrlKey || p.metaKey ? 'subtract' : 'replace';
        // Only a plain (replace) drag clears up front; add/subtract keep the
        // existing selection so pointer-up can combine against it.
        if (mode === 'replace') ctx.setSelection([]);
        return { kind: 'marquee', startX: p.x, startY: p.y, curX: p.x, curY: p.y, mode };
    }

    /**
     * Anchor / midpoint grab on the single selected line or arrow. Returns the drag to
     * start, `null` when the press was consumed but starts no drag (a shift-click that
     * *de*selects a node), or `undefined` when nothing was hit so the caller should fall
     * through to a body drag.
     *
     * Anchors are tested before midpoints and grab from much further
     * (`ANCHOR_HIT_RADIUS` vs `MID_HIT_RADIUS`) — shaping an existing curve must never
     * be misread as "insert a node here".
     */
    private tryStartArrowPoint(
        ctx: ToolContext,
        shape: Extract<Shape, { type: 'arrow' }>,
        p: PointerInfo,
    ): Interaction | null | undefined {
        const zoom = ctx.camera().zoom;
        const origin = { origX: shape.x, origY: shape.y };
        const anchor = ArrowPoints.hitTestAnchor(shape, p.x, p.y, zoom);
        if (anchor !== null) {
            // Outside point-edit mode there is no node selection to speak of — dragging an
            // endpoint of a merely-selected line behaves exactly as it always has.
            if (ctx.pointEditId() !== shape.id) {
                return { kind: 'arrow-point', id: shape.id, primary: anchor, indices: [anchor], ...origin, origPoints: shape.points };
            }
            if (p.shiftKey) {
                ctx.togglePointEditNode(anchor, true);
                const after = ctx.pointEditNodes();
                // The shift-click removed it: that gesture is a deselect, not a drag.
                if (!after.includes(anchor)) return null;
                return { kind: 'arrow-point', id: shape.id, primary: anchor, indices: after, ...origin, origPoints: shape.points };
            }
            // Pressing an unselected node makes it the selection; pressing one that is
            // already selected keeps the set, so a drag moves all of them together.
            if (!ctx.pointEditNodes().includes(anchor)) ctx.setPointEditNodes([anchor]);
            return { kind: 'arrow-point', id: shape.id, primary: anchor, indices: ctx.pointEditNodes(), ...origin, origPoints: shape.points };
        }

        if (ctx.pointEditId() === shape.id) {
            const seg = ArrowPoints.hitTestMidpoint(shape, p.x, p.y, zoom);
            if (seg !== null) {
                // Insert the new anchor now; it commits on the first pointermove of
                // the drag that follows (a click that never drags inserts nothing).
                const mid = SplineMath.segmentMidpoint(shape.points, seg);
                const origPoints = [...shape.points];
                origPoints.splice((seg + 1) * 2, 0, mid.x, mid.y);
                ctx.setPointEditNodes([seg + 1]); // the new node becomes the selection
                return { kind: 'arrow-point', id: shape.id, primary: seg + 1, indices: [seg + 1], ...origin, origPoints };
            }
        }
        return undefined;
    }

    /**
     * Rotate handle for a multi-selection: hit-tested off the axis-aligned padded
     * union frame (the same box the renderer draws), so no un-rotation is needed.
     * Returns the interaction if the handle is grabbed, else null.
     */
    private tryStartSelectionRotate(ctx: ToolContext, selection: string[], p: PointerInfo): Interaction | null {
        // Rotate the concrete members: a selected group contributes its descendant
        // leaves, so rotating a group runs the same primitive over its shapes.
        const members = selection.flatMap((id) => SceneTree.boundableDescendants(ctx.shapes(), id));
        const union = this.shapeRegistry.unionBounds(members);
        if (!union) return null;
        const zoom = ctx.camera().zoom;
        const frame = Handles.padBounds(union, Handles.SELECTION_PAD / zoom);
        const [rx, ry] = Handles.rotateHandlePoint(frame, Handles.ROTATE_OFFSET / zoom);
        const radius = ArrowPoints.HIT_RADIUS / zoom;
        if (Math.hypot(p.x - rx, p.y - ry) > radius) return null;

        const pivot = RotationMath.center(frame);
        const origins = new Map<string, RotateOrigin>();
        for (const s of members) origins.set(s.id, this.rotateOrigin(s));
        return {
            kind: 'rotate-selection', pivot,
            startPointerAngle: Math.atan2(p.y - pivot.y, p.x - pivot.x), origins,
        };
    }

    private rotateOrigin(s: Shape): RotateOrigin {
        if (s.type === 'arrow' || s.type === 'draw') return { kind: 'points', x: s.x, y: s.y, points: s.points };
        const b = this.shapeRegistry.getBounds(s);
        const c = RotationMath.center(b);
        return { kind: 'box', cx: c.x, cy: c.y, hw: b.w / 2, hh: b.h / 2, origRotation: s.rotation ?? 0 };
    }

    /** Shapes whose body is edited inline via a textarea (text/note). Structured as a
     *  predicate so click-to-edit can later extend to captioned shapes. */
    private isInlineEditable(shape: Shape): boolean {
        return shape.type === 'text' || shape.type === 'note';
    }

    private startMove(ctx: ToolContext, ids: string[], p: PointerInfo, pendingSelect?: string): Extract<Interaction, { kind: 'move' }> {
        // Expand any selected group id to its descendant leaves — the group shape
        // itself has no geometry, so we move its members (and never its 0×0 anchor,
        // which would corrupt the snap bounding box).
        const moved = ids.flatMap((id) => SceneTree.boundableDescendants(ctx.shapes(), id));
        const origins = new Map<string, { x: number; y: number }>();
        for (const s of moved) origins.set(s.id, { x: s.x, y: s.y });
        // The group's bounding-box origin so snap-to-grid can align the whole
        // selection as a unit rather than each shape's anchor.
        const group = this.shapeRegistry.unionBounds(moved);
        return {
            kind: 'move', ids: moved.map((s) => s.id), startX: p.x, startY: p.y, origins, moved: false, pendingSelect,
            groupX: group?.x ?? p.x, groupY: group?.y ?? p.y,
        };
    }
}
