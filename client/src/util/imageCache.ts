type CacheEntry = HTMLImageElement | 'pending' | 'error';

/**
 * Decodes `data:` image URIs into paintable `HTMLImageElement`s off the main
 * synchronous draw path. `ShapeDefinition.draw` is synchronous, so `get` returns
 * whatever is ready *this frame* (kicking off a decode the first time a `src` is
 * seen) while `load` gives callers that can await — e.g. the clipboard paste path,
 * which needs `naturalWidth`/`naturalHeight` before sizing a new shape — a promise
 * for the same decode. Both share one cache, so a paste's `load` primes the entry
 * `draw` picks up on the very next frame.
 *
 * No eviction: decoded images live for the app's session even after their shape is
 * deleted. Accepted trade-off — no realistic board pastes enough images for it to
 * matter, and keeping bookkeeping (refcounts, shape scans) out is worth more than
 * reclaiming a few decoded bitmaps.
 */
export class ImageCache {
    private readonly cache = new Map<string, CacheEntry>();
    private readonly pending = new Map<string, Promise<HTMLImageElement>>();
    private readonly listeners = new Set<() => void>();

    /** Decoded image for `src` if ready, else `null` — and, the first time `src` is
     *  seen, kicks off a decode in the background. Never starts a second decode for
     *  a `src` already pending or resolved. */
    public get(src: string): HTMLImageElement | null {
        const entry = this.cache.get(src);
        if (entry === undefined) {
            void this.load(src).catch(() => { /* recorded as 'error' in decode() */ });
            return null;
        }
        return entry === 'pending' || entry === 'error' ? null : entry;
    }

    /** Decoded image for `src`, awaited. Rejects if the image fails to decode. */
    public load(src: string): Promise<HTMLImageElement> {
        const inFlight = this.pending.get(src);
        if (inFlight) return inFlight;

        const existing = this.cache.get(src);
        if (existing && existing !== 'pending' && existing !== 'error') return Promise.resolve(existing);

        this.cache.set(src, 'pending');
        const promise = this.decode(src);
        this.pending.set(src, promise);
        return promise;
    }

    /** Notified once per completed decode (success or failure). Returns an
     *  unsubscribe function. */
    public onChange(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private decode(src: string): Promise<HTMLImageElement> {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.cache.set(src, img);
                this.pending.delete(src);
                this.notify();
                resolve(img);
            };
            img.onerror = () => {
                this.cache.set(src, 'error');
                this.pending.delete(src);
                this.notify();
                reject(new Error(`ImageCache: failed to decode image (src length ${src.length})`));
            };
            img.src = src;
        });
    }

    private notify(): void {
        for (const listener of this.listeners) listener();
    }
}
