import * as Y from 'yjs';

type SyncMessage = { type: 'update'; data: Uint8Array } | { type: 'query' };

/**
 * Cross-tab live sync for a *local* (offline) board — no server involved. Every
 * tab of the same origin sharing one board name joins a native BroadcastChannel
 * and relays incremental Y.Doc updates to the others, so open tabs update in real
 * time. IndexedDB still owns initial load and persistence; a newly opened tab
 * additionally posts a `query` so an already-open tab can hand over any state not
 * yet flushed to IndexedDB. Awareness/presence is intentionally NOT synced —
 * offline mode shows no peers.
 */
export class LocalDocChannel {
    private readonly channel: BroadcastChannel;
    private readonly onUpdate: (update: Uint8Array, origin: unknown) => void;

    constructor(channelName: string, private readonly doc: Y.Doc) {
        this.channel = new BroadcastChannel(`whiteboard-sync-${channelName}`);

        // Relay only genuinely local edits. Updates we applied FROM the channel
        // carry `this` as their origin, so they are never echoed back — and the
        // UndoManager (which tracks only LOCAL_ORIGIN) won't let you undo another
        // tab's edit either.
        this.onUpdate = (update, origin) => {
            if (origin === this) return;
            this.post({ type: 'update', data: update });
        };
        this.doc.on('update', this.onUpdate);

        this.channel.onmessage = (event: MessageEvent) => this.receive(event.data);
        this.post({ type: 'query' });
    }

    private receive(msg: unknown): void {
        if (!LocalDocChannel.isSyncMessage(msg)) return;
        if (msg.type === 'query') {
            this.post({ type: 'update', data: Y.encodeStateAsUpdate(this.doc) });
        } else {
            Y.applyUpdate(this.doc, msg.data, this);
        }
    }

    private post(msg: SyncMessage): void {
        this.channel.postMessage(msg);
    }

    private static isSyncMessage(msg: unknown): msg is SyncMessage {
        if (typeof msg !== 'object' || msg === null) return false;
        const candidate = msg as Record<string, unknown>;
        if (candidate.type === 'query') return true;
        return candidate.type === 'update' && candidate.data instanceof Uint8Array;
    }

    public destroy(): void {
        this.doc.off('update', this.onUpdate);
        this.channel.close();
    }
}
