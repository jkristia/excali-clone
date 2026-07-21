import type { Interaction, MarqueeMode, PointerInfo, RotateOrigin } from '../interaction/interaction';
import type { Shape } from '../model/types';
import type { Tool, ToolContext } from './tool';
import { NO_PANEL_CAPABILITIES } from './tool';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Handles } from '../util/handles';
import { RotationMath } from '../util/rotationMath';
import { ArrowEndpoints } from '../util/arrowEndpoints';
import { SceneTree } from '../util/sceneTree';

/**
 * Select tool: resize-handle / arrow-endpoint grab takes priority when exactly one
 * resizable shape is selected, then shape drag, then marquee.
 */
export class SelectTool implements Tool {
    public readonly panelCapabilities = NO_PANEL_CAPABILITIES;

    constructor(private readonly shapeRegistry: ShapeRegistry) {}

    public onPointerDown(ctx: ToolContext, p: PointerInfo): Interaction | null {
        const selection = ctx.selection();
        const selShape = selection.length === 1 ? ctx.shapes().find((s) => s.id === selection[0]) : undefined;
        // A single group behaves like a multi-selection (one union frame with a
        // rotate handle), not a single shape with its own resize/rotate handles.
        if (selShape && selShape.type !== 'group') {
            if (selShape.type === 'arrow') {
                const ep = ArrowEndpoints.hitTest(selShape, p.x, p.y, ctx.camera().zoom);
                if (ep !== null) {
                    return {
                        kind: 'arrow-endpoint', id: selShape.id, endpoint: ep,
                        origX: selShape.x, origY: selShape.y, origDx: selShape.dx, origDy: selShape.dy,
                    };
                }
            } else {
                const bounds = this.shapeRegistry.getBounds(selShape);
                const rot = selShape.rotation ?? 0;
                const radius = ArrowEndpoints.HIT_RADIUS / ctx.camera().zoom;
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
                    const hIdx = Handles.hitTest(bounds, local.x, local.y, radius);
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
                return this.startMove(ctx, selection, p);
            }
            // `target` is unselected. If a currently-selected shape (resolved to its
            // container) sits under the pointer too, a drag should move the existing
            // selection and only a plain click should switch — defer to pointer-up.
            const overlapsSelection = ctx.shapes().some(
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
        const radius = ArrowEndpoints.HIT_RADIUS / zoom;
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
        if (s.type === 'arrow') return { kind: 'arrow', x: s.x, y: s.y, dx: s.dx, dy: s.dy };
        if (s.type === 'draw') return { kind: 'draw', x: s.x, y: s.y, points: s.points };
        const b = this.shapeRegistry.getBounds(s);
        const c = RotationMath.center(b);
        return { kind: 'box', cx: c.x, cy: c.y, hw: b.w / 2, hh: b.h / 2, origRotation: s.rotation ?? 0 };
    }

    private startMove(ctx: ToolContext, ids: string[], p: PointerInfo, pendingSelect?: string): Interaction {
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
