import type { Shape } from '../model/types';

/**
 * Membership/tree queries over a flat `Shape[]`. Groups form a scene tree via each
 * shape's {@link Shape.parentId} (membership points *up* — a container stores no
 * child list). `z` is order among siblings under the same parent, so draw order is
 * a depth-first traversal rather than a single global sort.
 *
 * Stateless, like {@link Geometry}: pure static methods over the caller's list.
 */
export class SceneTree {
    /**
     * Returns the same shapes reordered back-to-front, in the exact order they
     * should be painted — no shapes added or removed. The input `Shape[]` is in
     * arbitrary order (however shapes were created/synced) with a tree hidden
     * inside it via `parentId`; this linearizes that tree so the renderer can
     * loop once and draw, never needing to understand groups, `z`, or nesting:
     *   `for (const shape of SceneTree.flattenToPaintOrder(shapes)) draw(shape);`
     *
     * A single `z` sort won't do it, because `z` only orders siblings under the
     * same parent: paint order is a depth-first walk — draw a container, then
     * recurse into its members so they land on top of it.
     *
     * Robust to a malformed tree: a `parentId` with no matching group is treated
     * as root (dangling-parent rule), and any shape unreachable from the root
     * (e.g. a parent cycle) is appended at the end, so nothing ever disappears
     * from the canvas.
     */
    public static flattenToPaintOrder(shapes: Shape[]): Shape[] {
        // all children grouped by their parent key
        const byParent: Map<string, Shape[]> = SceneTree.childrenByParent(shapes);
        const out: Shape[] = [];
        const seen = new Set<string>();

        const visit = (parentKey: string): void => {
            for (const shape of byParent.get(parentKey) ?? []) {
                if (seen.has(shape.id)) continue;
                seen.add(shape.id);
                out.push(shape);
                if (shape.type === 'group') visit(shape.id);
            }
        };
        visit(SceneTree.ROOT_KEY);

        // Fallback: unreachable shapes (parent cycle) still render, at the top.
        for (const shape of shapes) {
            if (!seen.has(shape.id)) out.push(shape);
        }
        return out;
    }

    /** Direct children of `parentId` (undefined ⇒ root), sorted ascending by `z`. */
    public static childrenOf(shapes: Shape[], parentId: string | undefined): Shape[] {
        const key = SceneTree.effectiveParentKeyFor(shapes, parentId);
        return SceneTree.childrenByParent(shapes).get(key) ?? [];
    }

    /** `id` plus every descendant id (the whole subtree) — for delete/copy. */
    public static subtreeIds(shapes: Shape[], id: string): string[] {
        const byParent = SceneTree.childrenByParent(shapes);
        const out: string[] = [];
        const walk = (nodeId: string): void => {
            out.push(nodeId);
            for (const child of byParent.get(nodeId) ?? []) walk(child.id);
        };
        walk(id);
        return out;
    }

    /**
     * Geometry-bearing shapes under `id`: `id` itself when it is a leaf, or the
     * non-group descendants when it is a container. This is the set fed to
     * `ShapeRegistry.unionBounds` (a group has no bounds of its own) and the set a
     * selected group moves/rotates.
     */
    public static boundableDescendants(shapes: Shape[], id: string): Shape[] {
        const byId = SceneTree.indexById(shapes);
        const shape = byId.get(id);
        if (!shape) return [];
        if (shape.type !== 'group') return [shape];
        const byParent = SceneTree.childrenByParent(shapes);
        const out: Shape[] = [];
        const walk = (nodeId: string): void => {
            for (const child of byParent.get(nodeId) ?? []) {
                if (child.type === 'group') walk(child.id);
                else out.push(child);
            }
        };
        walk(id);
        return out;
    }

    /**
     * Which shape a click on `id` should select. Normally the outermost container
     * (walk `parentId` to root) so a group selects as a unit. When scoped inside
     * `editingGroupId`, stop one level below it — selecting the member directly
     * under the entered group rather than the group itself.
     */
    public static resolveContainer(shapes: Shape[], id: string, editingGroupId?: string | null): string {
        const byId = SceneTree.indexById(shapes);
        const chain: string[] = [];
        const seen = new Set<string>();
        let cur: string | undefined = id;
        while (cur && !seen.has(cur)) {
            seen.add(cur);
            chain.push(cur);
            const parentId: string | undefined = byId.get(cur)?.parentId;
            cur = parentId && byId.get(parentId)?.type === 'group' ? parentId : undefined;
        }
        if (editingGroupId) {
            const idx = chain.indexOf(editingGroupId);
            if (idx > 0) return chain[idx - 1];
        }
        return chain[chain.length - 1];
    }

    private static readonly ROOT_KEY = '';

    private static indexById(shapes: Shape[]): Map<string, Shape> {
        const byId = new Map<string, Shape>();
        for (const shape of shapes) byId.set(shape.id, shape);
        return byId;
    }

    /** The bucket key a shape sorts under: its group parent's id, or ROOT_KEY when
     *  top-level or when its `parentId` names no existing group. */
    private static effectiveParentKeyFor(shapes: Shape[], parentId: string | undefined): string {
        if (!parentId) return SceneTree.ROOT_KEY;
        const parent = SceneTree.indexById(shapes).get(parentId);
        return parent?.type === 'group' ? parentId : SceneTree.ROOT_KEY;
    }

    /**
     * The full parent-key -> sorted-children index, built in one pass: every shape
     * is keyed under its group parent or root, and each bucket is sorted ascending
     * by `z`. This is the index, not a per-id lookup — {@link childrenOf} reads a
     * single bucket out of it. A `parentId` naming no existing group falls to
     * ROOT_KEY (the dangling-parent rule).
     */
    private static childrenByParent(shapes: Shape[]): Map<string, Shape[]> {
        const byId: Map<string, Shape> = SceneTree.indexById(shapes);
        const buckets = new Map<string, Shape[]>();
        for (const shape of shapes) {
            const parentId = shape.parentId;
            const key = parentId && byId.get(parentId)?.type === 'group' ? parentId : SceneTree.ROOT_KEY;
            const bucket = buckets.get(key);
            if (bucket) bucket.push(shape);
            else buckets.set(key, [shape]);
        }
        for (const bucket of buckets.values()) bucket.sort((a, b) => a.z - b.z);
        return buckets;
    }
}
