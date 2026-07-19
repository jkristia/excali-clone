// Minimal typings for y-leveldb (its published "exports" map hides the bundled
// declaration file from NodeNext resolution).
declare module 'y-leveldb' {
    import type * as Y from 'yjs';
    export class LeveldbPersistence {
        constructor(location: string, options?: Record<string, unknown>);
        getYDoc(docName: string): Promise<Y.Doc>;
        storeUpdate(docName: string, update: Uint8Array): Promise<unknown>;
        getStateVector(docName: string): Promise<Uint8Array>;
        clearDocument(docName: string): Promise<void>;
        destroy(): Promise<void>;
    }
}
