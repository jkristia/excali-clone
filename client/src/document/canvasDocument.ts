import * as Y from 'yjs';
import { nanoid } from 'nanoid';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Awareness } from 'y-protocols/awareness';
import type { GroupShape, Shape } from '../model/types';
import type { UserPresence } from '../model/types';
import { SceneTree } from '../util/sceneTree';
import { IdentityStore } from './identity';

/** Transactions tagged with this origin are the ones the UndoManager tracks. */
export const LOCAL_ORIGIN = 'local';

export type ReorderOp = 'toFront' | 'toBack' | 'forward' | 'backward';

/**
 * Owns the Yjs document, its network/persistence providers, and the
 * shape read/write API. Each shape is stored as a nested Y.Map so concurrent
 * edits to *different* properties of the same shape merge cleanly instead of
 * clobbering.
 */
export class CanvasDocument {
    public readonly room: string;
    public readonly identity: UserPresence;
    public readonly ydoc: Y.Doc;
    public readonly yShapes: Y.Map<Y.Map<unknown>>;
    public readonly persistence: IndexeddbPersistence;
    public readonly provider: WebsocketProvider;
    public readonly awareness: Awareness;
    public readonly undoManager: Y.UndoManager;

    constructor(identityStore: IdentityStore, wsUrl: string = CanvasDocument.defaultWsUrl()) {
        this.room = CanvasDocument.roomFromLocation();
        this.identity = identityStore.load();

        this.ydoc = new Y.Doc();
        this.yShapes = this.ydoc.getMap<Y.Map<unknown>>('shapes');

        // Offline-first: persist locally and re-sync on reconnect.
        this.persistence = new IndexeddbPersistence(`whiteboard-${this.room}`, this.ydoc);

        this.provider = new WebsocketProvider(wsUrl, this.room, this.ydoc, { connect: true });
        this.awareness = this.provider.awareness;

        this.undoManager = new Y.UndoManager(this.yShapes, {
            trackedOrigins: new Set([LOCAL_ORIGIN]),
            captureTimeout: 300,
        });
    }

    private static roomFromLocation(): string {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        return (room && room.trim()) || 'default-room';
    }

    // VITE_WS_URL is statically replaced by Vite at build time (empty/undefined if unset),
    // not read at runtime — see .env files. Falls back to same-host dev server.
    private static defaultWsUrl(): string {
        return import.meta.env.VITE_WS_URL ?? `ws://${window.location.hostname}:1234`;
    }

    /** Run a mutation as a single local (undoable) transaction. */
    private transact(fn: () => void): void {
        this.ydoc.transact(fn, LOCAL_ORIGIN);
    }

    private static readShape(ym: Y.Map<unknown>): Shape {
        return ym.toJSON() as Shape;
    }

    /** The shapes as stored, in no particular order. Callers that need draw order
     *  use {@link readAllShapes}; membership ops re-bucket via {@link SceneTree}. */
    private allShapesRaw(): Shape[] {
        const out: Shape[] = [];
        this.yShapes.forEach((ym) => out.push(CanvasDocument.readShape(ym)));
        return out;
    }

    /** All shapes in draw order: a depth-first traversal of the group tree, sorting
     *  siblings by `z` at each level (see {@link SceneTree.flattenToPaintOrder}). Groups emit
     *  before their members so members paint on top. */
    public readAllShapes(): Shape[] {
        return SceneTree.flattenToPaintOrder(this.allShapesRaw());
    }

    public getShape(id: string): Shape | null {
        const ym = this.yShapes.get(id);
        return ym ? CanvasDocument.readShape(ym) : null;
    }

    /** Highest `z` among the direct children of `parentId` (undefined ⇒ root) — for
     *  placing a new sibling on top. `z` is sibling-scoped, so "top" is per-parent. */
    public topZUnder(parentId?: string): number {
        let max = 0;
        for (const s of SceneTree.childrenOf(this.allShapesRaw(), parentId)) {
            if (s.z > max) max = s.z;
        }
        return max;
    }

    /** Highest `z` at the root level (for placing new top-level shapes on top). */
    public topZ(): number {
        return this.topZUnder(undefined);
    }

    public addShape(shape: Shape): void {
        this.addShapes([shape]);
    }

    /** Add several shapes in one transaction, so they undo/redo as a single step. */
    public addShapes(shapes: Shape[]): void {
        this.transact(() => {
            for (const shape of shapes) {
                const ym = new Y.Map<unknown>();
                for (const [k, v] of Object.entries(shape)) ym.set(k, v);
                this.yShapes.set(shape.id, ym);
            }
        });
    }

    /** Patch specific properties of an existing shape (per-property CRDT merge). */
    public updateShape(id: string, patch: Partial<Shape>): void {
        const ym = this.yShapes.get(id);
        if (!ym) return;
        this.transact(() => {
            for (const [k, v] of Object.entries(patch)) ym.set(k, v);
        });
    }

    public updateShapes(patches: Array<{ id: string; patch: Partial<Shape> }>): void {
        this.transact(() => {
            for (const { id, patch } of patches) {
                const ym = this.yShapes.get(id);
                if (!ym) continue;
                for (const [k, v] of Object.entries(patch)) ym.set(k, v);
            }
        });
    }

    /** Delete the given shapes and, for any container among them, its whole subtree
     *  (members are deleted with their group). One transaction ⇒ one undo step. */
    public deleteShapes(ids: string[]): void {
        const raw = this.allShapesRaw();
        const doomed = new Set<string>();
        for (const id of ids) {
            for (const sub of SceneTree.subtreeIds(raw, id)) doomed.add(sub);
        }
        this.transact(() => {
            for (const id of doomed) this.yShapes.delete(id);
        });
    }

    /**
     * Group the given shapes under a new `group` container. Requires ≥2 shapes that
     * share the same parent (rejects a mixed selection). The group takes a `z` on
     * top of that shared parent's children; members are reparented to it and
     * renumbered `0..n-1` in their prior relative order. Returns the new group id
     * (so the caller can select it), or null when the selection is not groupable.
     */
    public groupShapes(ids: string[]): string | null {
        const raw = this.allShapesRaw();
        const byId = new Map(raw.map((s) => [s.id, s] as const));
        const members = ids.map((id) => byId.get(id)).filter((s): s is Shape => s !== undefined);
        if (members.length < 2) return null;

        const parentId = members[0].parentId;
        const sharedParent = members.every((m) => (m.parentId ?? undefined) === (parentId ?? undefined));
        if (!sharedParent) return null;

        const groupId = nanoid();
        const groupZ = this.topZUnder(parentId) + 1;
        const ordered = members.slice().sort((a, b) => a.z - b.z);
        this.transact(() => {
            const group: GroupShape = {
                id: groupId,
                type: 'group',
                x: 0,
                y: 0,
                z: groupZ,
                createdBy: String(this.awareness.clientID),
                ...(parentId ? { parentId } : {}),
            };
            const gm = new Y.Map<unknown>();
            for (const [k, v] of Object.entries(group)) gm.set(k, v);
            this.yShapes.set(groupId, gm);

            ordered.forEach((m, index) => {
                const ym = this.yShapes.get(m.id);
                if (!ym) return;
                ym.set('parentId', groupId);
                ym.set('z', index);
            });
        });
        return groupId;
    }

    /**
     * Dissolve a group: reparent its children to the group's own parent (in the
     * group's former slot, preserving their internal order), then delete the group.
     * Members survive — only {@link deleteShapes} removes them.
     */
    public ungroup(groupId: string): void {
        const raw = this.allShapesRaw();
        const group = raw.find((s) => s.id === groupId);
        if (!group || group.type !== 'group') return;

        const parentId = group.parentId;
        const children = SceneTree.childrenOf(raw, groupId);
        const siblings = SceneTree.childrenOf(raw, parentId); // includes the group

        // Splice the children into the group's slot among its siblings.
        const newOrder: string[] = [];
        for (const s of siblings) {
            if (s.id === groupId) newOrder.push(...children.map((c) => c.id));
            else newOrder.push(s.id);
        }

        this.transact(() => {
            for (const child of children) {
                const ym = this.yShapes.get(child.id);
                if (!ym) continue;
                if (parentId) ym.set('parentId', parentId);
                else ym.delete('parentId');
            }
            this.yShapes.delete(groupId);
            newOrder.forEach((id, index) => {
                const ym = this.yShapes.get(id);
                if (ym && ym.get('z') !== index) ym.set('z', index);
            });
        });
    }

    /**
   * Change the stacking order of the given shapes (like Excalidraw's layer ops).
   * Reordering is **sibling-scoped**: it runs among one parent's children only, so
   * a group's whole band moves as a unit (elevating a group id reorders it among
   * its siblings, and its subtree rides along in the DFS). The selected ids are
   * expected to share a parent (selection resolves to top-level containers, or to
   * members inside an entered group); ids under a different parent are ignored.
   * We renormalize that parent's children to a contiguous `0..n-1` so the four
   * operations always compose cleanly.
   */
    public reorderShapes(ids: string[], op: ReorderOp): void {
        if (ids.length === 0) return;
        const raw = this.allShapesRaw();
        const first = raw.find((s) => s.id === ids[0]);
        if (!first) return;

        const parentId = first.parentId;
        const inScope = new Set(
            ids.filter((id) => (raw.find((s) => s.id === id)?.parentId ?? undefined) === (parentId ?? undefined)),
        );
        if (inScope.size === 0) return;

        const siblings = SceneTree.childrenOf(raw, parentId); // ascending z
        const arr = CanvasDocument.applyReorder(siblings, (s) => inScope.has(s.id), op);

        const patches: Array<{ id: string; patch: Partial<Shape> }> = [];
        arr.forEach((s, index) => {
            if (s.z !== index) patches.push({ id: s.id, patch: { z: index } });
        });
        if (patches.length) this.updateShapes(patches);
    }

    /** The four layer ops over one already-ordered sibling list. */
    private static applyReorder(ordered: Shape[], isSel: (s: Shape) => boolean, op: ReorderOp): Shape[] {
        let arr = ordered.slice();
        switch (op) {
            case 'toFront':
                arr = [...arr.filter((s) => !isSel(s)), ...arr.filter(isSel)];
                break;
            case 'toBack':
                arr = [...arr.filter(isSel), ...arr.filter((s) => !isSel(s))];
                break;
            case 'forward':
                // Move each selected shape one step toward the front (higher index),
                // hopping over the nearest non-selected neighbour above it.
                for (let i = arr.length - 1; i >= 0; i--) {
                    if (isSel(arr[i]) && i + 1 < arr.length && !isSel(arr[i + 1])) {
                        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                    }
                }
                break;
            case 'backward':
                for (let i = 0; i < arr.length; i++) {
                    if (isSel(arr[i]) && i - 1 >= 0 && !isSel(arr[i - 1])) {
                        [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
                    }
                }
                break;
        }
        return arr;
    }

    public clearBoard(): void {
        this.transact(() => {
            Array.from(this.yShapes.keys()).forEach((k) => this.yShapes.delete(k));
        });
    }
}
