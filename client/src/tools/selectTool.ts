import type { Interaction, PointerInfo } from '../interaction/interaction';
import type { Tool, ToolContext } from './tool';
import { NO_PANEL_CAPABILITIES } from './tool';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Handles } from '../util/handles';
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
            } else if (selShape && (selShape.type === 'rectangle' || selShape.type === 'ellipse')) {
                const hIdx = Handles.hitTest(this.shapeRegistry.getBounds(selShape), p.x, p.y, ArrowEndpoints.HIT_RADIUS / ctx.camera().zoom);
                if (hIdx !== -1) {
                    return {
                        kind: 'resize', id: selShape.id, handle: hIdx,
                        orig: { x: selShape.x, y: selShape.y, w: selShape.w, h: selShape.h, type: selShape.type },
                    };
                }
            }
        }

        const hit = this.shapeRegistry.topShapeAt(ctx.shapes(), p.x, p.y);
        if (hit) {
            const already = selection.includes(hit.id);
            if (p.shiftKey) {
                ctx.toggleSelection(hit.id, true);
            } else if (!already) {
                ctx.setSelection([hit.id]);
            }
            const ids = ctx.selection();
            const origins = new Map<string, { x: number; y: number }>();
            for (const s of ctx.shapes()) {
                if (ids.includes(s.id)) origins.set(s.id, { x: s.x, y: s.y });
            }
            return { kind: 'move', ids, startX: p.x, startY: p.y, origins, moved: false };
        }

        if (!p.shiftKey) ctx.setSelection([]);
        return { kind: 'marquee', startX: p.x, startY: p.y, curX: p.x, curY: p.y };
    }
}
