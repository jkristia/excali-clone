import * as Y from 'yjs';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import type { WebSocket } from 'ws';
import type { Persistence } from './persistence.js';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

/**
 * A Y.Doc shared by every websocket connected to the same room. It fans out
 * document updates and awareness (cursor/presence) changes to all peers.
 *
 * This is a compact, self-contained implementation of the y-websocket server
 * protocol so we don't depend on any package-internal file paths.
 */
export class WSSharedDoc extends Y.Doc {
    public name: string;
    public awareness: awarenessProtocol.Awareness;
    public conns: Map<WebSocket, Set<number>> = new Map();

    constructor(name: string) {
        super({ gc: true });
        this.name = name;

        this.awareness = new awarenessProtocol.Awareness(this);
        this.awareness.setLocalState(null);

        this.awareness.on(
            'update',
            (
                { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
                conn: WebSocket | null,
            ) => {
                const changedClients = added.concat(updated, removed);
                if (conn !== null) {
                    const controlled = this.conns.get(conn);
                    if (controlled) {
                        added.forEach((c) => controlled.add(c));
                        removed.forEach((c) => controlled.delete(c));
                    }
                }
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
                encoding.writeVarUint8Array(
                    encoder,
                    awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
                );
                this.broadcast(encoding.toUint8Array(encoder));
            },
        );

        this.on('update', (update: Uint8Array, origin: unknown) => {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_SYNC);
            syncProtocol.writeUpdate(encoder, update);
            this.broadcast(encoding.toUint8Array(encoder), origin as WebSocket);
        });
    }

    public broadcast(message: Uint8Array, except?: WebSocket) {
        this.conns.forEach((_clients, conn) => {
            if (conn === except) return;
            send(conn, message);
        });
    }
}

const docs = new Map<string, WSSharedDoc>();

export function getDocCount(): number {
    return docs.size;
}

export function getConnectionCount(): number {
    let total = 0;
    docs.forEach((doc) => (total += doc.conns.size));
    return total;
}

async function getOrCreateDoc(name: string, persistence: Persistence | null): Promise<WSSharedDoc> {
    let doc = docs.get(name);
    if (doc) return doc;
    doc = new WSSharedDoc(name);
    docs.set(name, doc);
    if (persistence) {
        await persistence.bindState(name, doc);
    }
    return doc;
}

function send(conn: WebSocket, message: Uint8Array) {
    // 0 = CONNECTING, 1 = OPEN
    if (conn.readyState !== 0 && conn.readyState !== 1) {
        closeConn(conn);
        return;
    }
    try {
        conn.send(message, (err?: Error) => {
            if (err) closeConn(conn);
        });
    } catch {
        closeConn(conn);
    }
}

function closeConn(conn: WebSocket) {
    docs.forEach((doc) => {
        const controlled = doc.conns.get(conn);
        if (!controlled) return;
        doc.conns.delete(conn);
        awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlled), null);
        // Drop empty rooms to free memory.
        if (doc.conns.size === 0) {
            doc.destroy();
            docs.delete(doc.name);
        }
    });
    try {
        conn.close();
    } catch {
        /* already closed */
    }
}

function onMessage(conn: WebSocket, doc: WSSharedDoc, message: Uint8Array) {
    try {
        const encoder = encoding.createEncoder();
        const decoder = decoding.createDecoder(message);
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
            case MESSAGE_SYNC: {
                encoding.writeVarUint(encoder, MESSAGE_SYNC);
                syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
                // Reply only if the sync exchange produced a response payload.
                if (encoding.length(encoder) > 1) {
                    send(conn, encoding.toUint8Array(encoder));
                }
                break;
            }
            case MESSAGE_AWARENESS: {
                awarenessProtocol.applyAwarenessUpdate(
                    doc.awareness,
                    decoding.readVarUint8Array(decoder),
                    conn,
                );
                break;
            }
            default:
                break;
        }
    } catch (err) {
        console.error('[ws] message handling error:', err);
    }
}

/**
 * Wire a freshly-accepted websocket into its room: register it, send the
 * initial sync + awareness snapshot, and start a liveness heartbeat.
 */
export async function setupConnection(
    conn: WebSocket,
    roomName: string,
    persistence: Persistence | null,
): Promise<void> {
    conn.binaryType = 'arraybuffer';
    const doc = await getOrCreateDoc(roomName, persistence);
    doc.conns.set(conn, new Set());

    conn.on('message', (data: ArrayBuffer) => onMessage(conn, doc, new Uint8Array(data)));

    // --- Liveness: ping/pong, drop peers that stop responding ---
    let alive = true;
    conn.on('pong', () => (alive = true));
    const pingInterval = setInterval(() => {
        if (!doc.conns.has(conn)) {
            clearInterval(pingInterval);
            return;
        }
        if (!alive) {
            clearInterval(pingInterval);
            closeConn(conn);
            return;
        }
        alive = false;
        try {
            conn.ping();
        } catch {
            closeConn(conn);
        }
    }, 30000);

    conn.on('close', () => {
        closeConn(conn);
        clearInterval(pingInterval);
    });
    conn.on('error', () => closeConn(conn));

    // --- Initial handshake: sync step 1 ---
    {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(encoder, doc);
        send(conn, encoding.toUint8Array(encoder));
    }

    // --- Initial awareness snapshot ---
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(
            encoder,
            awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())),
        );
        send(conn, encoding.toUint8Array(encoder));
    }
}
