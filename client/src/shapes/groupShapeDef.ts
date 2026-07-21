import type { Bounds, GroupShape } from '../model/types';
import type { ShapeDefinition } from './shapeDefinition';

/**
 * A group is a container, not a drawable: it paints nothing and is never hit
 * directly (its members are hit, then a click resolves up the `parentId` chain —
 * see {@link SceneTree.resolveContainer}). Its extent is the union of its
 * descendants, computed at the list level via `ShapeRegistry.unionBounds` over
 * {@link SceneTree.boundableDescendants}; the group shape carries no geometry of
 * its own, so `getBounds` here is a degenerate zero-box that is never the source
 * of a real bound. Rotation of a group runs as the shared selection-transform over
 * its members, so `rotatable` is true.
 */
export class GroupShapeDef implements ShapeDefinition<GroupShape> {
    public readonly capabilities = { stroke: false, fill: false, width: false, ends: false };
    public readonly resizable = false;
    public readonly rotatable = true;

    public getBounds(shape: GroupShape): Bounds {
        return { x: shape.x, y: shape.y, w: 0, h: 0 };
    }

    public hitTest(): boolean {
        return false;
    }

    public draw(): void {
        // Groups render nothing; their members draw themselves on top of them.
    }
}
