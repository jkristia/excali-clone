import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Awareness } from 'y-protocols/awareness';
import type { Shape } from '../model/types';
import type { UserPresence } from '../model/types';
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

    public readAllShapes(): Shape[] {
        const out: Shape[] = [];
        this.yShapes.forEach((ym) => out.push(CanvasDocument.readShape(ym)));
        out.sort((a, b) => a.z - b.z);
        return out;
    }

    public getShape(id: string): Shape | null {
        const ym = this.yShapes.get(id);
        return ym ? CanvasDocument.readShape(ym) : null;
    }

    /** Highest z currently in the document (for placing new shapes on top). */
    public topZ(): number {
        let max = 0;
        this.yShapes.forEach((ym) => {
            const z = ym.get('z') as number;
            if (typeof z === 'number' && z > max) max = z;
        });
        return max;
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

    public deleteShapes(ids: string[]): void {
        this.transact(() => {
            for (const id of ids) this.yShapes.delete(id);
        });
    }

    /**
   * Change the stacking order of the given shapes (like Excalidraw's layer ops).
   * We compute the new ordering, then normalize every shape's `z` to a contiguous
   * 0..n-1 sequence, writing back only the ones whose `z` actually changed. This
   * keeps ordering gap-free so the four operations always compose cleanly.
   */
    public reorderShapes(ids: string[], op: ReorderOp): void {
        if (ids.length === 0) return;
        const selected = new Set(ids);
        const ordered = this.readAllShapes(); // ascending z (readAllShapes sorts)
        if (ordered.length === 0) return;

        const isSel = (s: Shape) => selected.has(s.id);
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

        const patches: Array<{ id: string; patch: Partial<Shape> }> = [];
        arr.forEach((s, index) => {
            if (s.z !== index) patches.push({ id: s.id, patch: { z: index } });
        });
        if (patches.length) this.updateShapes(patches);
    }

    public clearBoard(): void {
        this.transact(() => {
            Array.from(this.yShapes.keys()).forEach((k) => this.yShapes.delete(k));
        });
    }
}
