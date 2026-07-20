import type { Interaction, MarqueeMode, PointerInfo } from '../interaction/interaction';
import type { Tool, ToolContext } from './tool';
import { NO_PANEL_CAPABILITIES } from './tool';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Handles } from '../util/handles';
import { RotationMath } from '../util/rotationMath';
import { ArrowEndpoints } from '../util/arrowEndpoints';

/**
 * Select tool: resize-handle / arrow-endpoint grab takes priority when exactly one
 * resizable shape is selected, then shape drag, then marquee.
 */
export class SelectTool implements Tool {
    public readonly panelCapabilities = NO_PANEL_CAPABILITIES;

    constructor(private readonly shapeRegistry: ShapeRegistry) {}

    public onPointerDown(ctx: ToolContext, p: PointerInfo): Interaction | null {
        const selection = ctx.selection();
        if (selection.length === 1) {
            const selShape = ctx.shapes().find((s) => s.id === selection[0]);
            if (selShape?.type === 'arrow') {
                const ep = ArrowEndpoints.hitTest(selShape, p.x, p.y, ctx.camera().zoom);
                if (ep !== null) {
                    return {
                        kind: 'arrow-endpoint', id: selShape.id, endpoint: ep,
                        origX: selShape.x, origY: selShape.y, origDx: selShape.dx, origDy: selShape.dy,
                    };
                }
            } else if (selShape) {
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

        const hit = this.shapeRegistry.topShapeAt(ctx.shapes(), p.x, p.y);
        if (hit) {
            const already = selection.includes(hit.id);
            if (p.shiftKey) {
                ctx.toggleSelection(hit.id, true);
                return this.startMove(ctx, ctx.selection(), p);
            }
            if (already) {
                return this.startMove(ctx, selection, p);
            }
            // `hit` is unselected. If a currently-selected shape sits under the
            // pointer too (overlap), a drag should move the existing selection
            // and only a plain click should switch to `hit` — so keep the
            // selection now and defer the switch to pointer-up.
            const overlapsSelection = ctx.shapes().some(
                (s) => selection.includes(s.id) && this.shapeRegistry.hitTest(s, p.x, p.y),
            );
            if (overlapsSelection) {
                return this.startMove(ctx, selection, p, hit.id);
            }
            ctx.setSelection([hit.id]);
            return this.startMove(ctx, [hit.id], p);
        }

        const mode: MarqueeMode = p.shiftKey ? 'add' : p.ctrlKey || p.metaKey ? 'subtract' : 'replace';
        // Only a plain (replace) drag clears up front; add/subtract keep the
        // existing selection so pointer-up can combine against it.
        if (mode === 'replace') ctx.setSelection([]);
        return { kind: 'marquee', startX: p.x, startY: p.y, curX: p.x, curY: p.y, mode };
    }

    private startMove(ctx: ToolContext, ids: string[], p: PointerInfo, pendingSelect?: string): Interaction {
        const origins = new Map<string, { x: number; y: number }>();
        const moved = ctx.shapes().filter((s) => ids.includes(s.id));
        for (const s of moved) origins.set(s.id, { x: s.x, y: s.y });
        // The group's bounding-box origin so snap-to-grid can align the whole
        // selection as a unit rather than each shape's anchor.
        const group = this.shapeRegistry.unionBounds(moved);
        return {
            kind: 'move', ids, startX: p.x, startY: p.y, origins, moved: false, pendingSelect,
            groupX: group?.x ?? p.x, groupY: group?.y ?? p.y,
        };
    }
}
