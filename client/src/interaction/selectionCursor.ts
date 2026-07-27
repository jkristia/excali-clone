import type { Camera } from '../state/uiStore';
import type { Shape } from '../model/shapeTypes';
import { ShapeRegistry } from '../shapes/shapeRegistry';
import { Handles } from '../util/handles';
import { RotationMath } from '../util/rotationMath';
import { ArrowPoints } from '../util/arrowPoints';
import { SceneTree } from '../util/sceneTree';

/** Hover-cursor lookups for the select tool's idle state — hovering a resize/rotate
 *  handle, an arrow anchor/midpoint, or a multi-selection's rotate handle. Extracted
 *  from InteractionController so its pointer-event plumbing doesn't have to carry this
 *  geometry too. */
export class SelectionCursor {
    constructor(private readonly shapeRegistry: ShapeRegistry) { }

    /** Hover cursor for the single selected shape's endpoints / handles, else null. */
    public forSelectedShape(selShape: Shape, pointEditId: string | null, camera: Camera, px: number, py: number): string | null {
        if (selShape.type === 'arrow') {
            const zoom = camera.zoom;
            if (ArrowPoints.hitTestAnchor(selShape, px, py, zoom) !== null) return 'crosshair';
            if (pointEditId === selShape.id && ArrowPoints.hitTestMidpoint(selShape, px, py, zoom) !== null) return 'crosshair';
            return null;
        }
        const bounds = this.shapeRegistry.getBounds(selShape);
        const radius = ArrowPoints.HIT_RADIUS / camera.zoom;
        const c = RotationMath.center(bounds);
        const local = RotationMath.rotatePoint(px, py, c.x, c.y, -(selShape.rotation ?? 0));
        if (this.shapeRegistry.isRotatable(selShape)) {
            const [rx, ry] = Handles.rotateHandlePoint(bounds, Handles.ROTATE_OFFSET / camera.zoom);
            if (Math.hypot(local.x - rx, local.y - ry) <= radius) return 'grab';
        }
        if (this.shapeRegistry.isResizable(selShape)) {
            const allowed = Handles.activeHandles(this.shapeRegistry.resizeAxis(selShape));
            const h = Handles.hitTest(bounds, local.x, local.y, radius, allowed);
            if (h !== -1) return Handles.cursor(h, selShape.rotation ?? 0);
        }
        return null;
    }

    /** Hover cursor over a multi-selection's rotate handle (off the padded union frame), else null. */
    public forMultiSelection(selection: string[], shapes: Shape[], camera: Camera, px: number, py: number): string | null {
        const members = selection.flatMap((id) => SceneTree.boundableDescendants(shapes, id));
        const union = this.shapeRegistry.unionBounds(members);
        if (!union) return null;
        const zoom = camera.zoom;
        const frame = Handles.padBounds(union, Handles.SELECTION_PAD / zoom);
        const [rx, ry] = Handles.rotateHandlePoint(frame, Handles.ROTATE_OFFSET / zoom);
        const radius = ArrowPoints.HIT_RADIUS / zoom;
        return Math.hypot(px - rx, py - ry) <= radius ? 'grab' : null;
    }
}
