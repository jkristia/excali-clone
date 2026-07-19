import { Injectable, inject, signal } from '@angular/core';
import type { PeerPresence, Shape } from '../../model/types';
import { CANVAS_DOCUMENT } from '../di-tokens';

export type ConnStatus = 'connecting' | 'connected' | 'disconnected';

/**
 * Angular adapter over the Yjs document + awareness. Same vanilla Yjs observers
 * the earlier React shell's `app/collab/hooks.ts` used, exposed as signals
 * instead of `useSyncExternalStore`.
 */
@Injectable({ providedIn: 'root' })
export class CollabService {
    private readonly canvasDocument = inject(CANVAS_DOCUMENT);

    private readonly shapesSig = signal<Shape[]>(this.canvasDocument.readAllShapes());
    private readonly peersSig = signal<PeerPresence[]>(this.computePeers());
    private readonly statusSig = signal<ConnStatus>(this.canvasDocument.provider.wsconnected ? 'connected' : 'connecting');
    private readonly undoRedoSig = signal(this.computeUndoRedo());

    public readonly shapes = this.shapesSig.asReadonly();
    public readonly peers = this.peersSig.asReadonly();
    public readonly status = this.statusSig.asReadonly();
    public readonly undoRedo = this.undoRedoSig.asReadonly();

    constructor() {
        const doc = this.canvasDocument;
        doc.yShapes.observeDeep(() => this.shapesSig.set(doc.readAllShapes()));
        doc.awareness.on('change', () => this.peersSig.set(this.computePeers()));
        doc.provider.on('status', (e: { status: ConnStatus }) => this.statusSig.set(e.status));
        const updateUndoRedo = () => this.undoRedoSig.set(this.computeUndoRedo());
        doc.undoManager.on('stack-item-added', updateUndoRedo);
        doc.undoManager.on('stack-item-popped', updateUndoRedo);
        doc.undoManager.on('stack-cleared', updateUndoRedo);
    }

    public undo(): void {
        this.canvasDocument.undoManager.undo();
    }

    public redo(): void {
        this.canvasDocument.undoManager.redo();
    }

    private computePeers(): PeerPresence[] {
        const states = this.canvasDocument.awareness.getStates();
        const out: PeerPresence[] = [];
        states.forEach((state, clientId) => {
            if (clientId === this.canvasDocument.awareness.clientID) return;
            const s = state as Partial<PeerPresence>;
            if (!s.user) return;
            out.push({ clientId, user: s.user, cursor: s.cursor ?? null, selection: s.selection ?? [] });
        });
        return out;
    }

    private computeUndoRedo() {
        return {
            canUndo: this.canvasDocument.undoManager.undoStack.length > 0,
            canRedo: this.canvasDocument.undoManager.redoStack.length > 0,
        };
    }
}
