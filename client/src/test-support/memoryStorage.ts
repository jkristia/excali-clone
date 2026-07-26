/** In-memory `Storage` fake — Vitest runs with `environment: 'node'`, so there is no
 *  real `localStorage`. Shared by every spec that exercises a class backed by it. */
export class MemoryStorage implements Storage {
    private data = new Map<string, string>();
    public get length(): number { return this.data.size; }
    public clear(): void { this.data.clear(); }
    public getItem(key: string): string | null { return this.data.get(key) ?? null; }
    public setItem(key: string, value: string): void { this.data.set(key, value); }
    public removeItem(key: string): void { this.data.delete(key); }
    public key(index: number): string | null { return Array.from(this.data.keys())[index] ?? null; }
}
