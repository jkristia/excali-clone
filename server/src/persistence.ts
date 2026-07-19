import * as Y from 'yjs';

/**
 * Pluggable persistence. When PERSISTENCE_DIR is set we durably store each
 * room's document in LevelDB so board state survives server restarts.
 * Otherwise documents live in memory only (fine for local dev / ephemeral use).
 */
export interface Persistence {
    bindState(docName: string, ydoc: Y.Doc): Promise<void>;
    writeState(docName: string, ydoc: Y.Doc): Promise<void>;
}

export async function createPersistence(): Promise<Persistence | null> {
    const dir = process.env.PERSISTENCE_DIR;
    if (!dir) return null;

    // Imported lazily so the dependency is only required when persistence is on.
    const { LeveldbPersistence } = await import('y-leveldb');
    const ldb = new LeveldbPersistence(dir);
    console.log(`[persistence] LevelDB enabled at "${dir}"`);

    return {
        async bindState(docName, ydoc) {
            const persisted = await ldb.getYDoc(docName);
            // Flush anything already in the live doc into the store, then hydrate.
            const current = Y.encodeStateAsUpdate(ydoc);
            await ldb.storeUpdate(docName, current);
            Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persisted));
            // Persist every subsequent update.
            ydoc.on('update', (update: Uint8Array) => {
                ldb.storeUpdate(docName, update).catch((err: unknown) =>
                    console.error(`[persistence] storeUpdate failed for ${docName}:`, err),
                );
            });
        },
        async writeState() {
            // Updates are streamed in bindState; nothing extra to flush on unload.
        },
    };
}
