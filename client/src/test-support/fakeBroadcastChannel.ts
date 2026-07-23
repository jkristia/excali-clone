/** In-memory stand-in for the browser `BroadcastChannel`, shared by specs.
 *  Instances that share a name form a bus: `postMessage` delivers synchronously to
 *  every *other* open instance of that name (never the sender), so tests can drive
 *  cross-tab sync deterministically. Node has a real global `BroadcastChannel`, but
 *  leaving live instances open can keep Vitest's process alive — this fake avoids
 *  that and makes delivery observable. Register it with
 *  `vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)`. */
export class FakeBroadcastChannel {
    private static readonly buses = new Map<string, Set<FakeBroadcastChannel>>();

    public onmessage: ((event: { data: unknown }) => void) | null = null;
    private closed = false;

    constructor(public readonly name: string) {
        const peers = FakeBroadcastChannel.buses.get(name) ?? new Set<FakeBroadcastChannel>();
        peers.add(this);
        FakeBroadcastChannel.buses.set(name, peers);
    }

    public postMessage(data: unknown): void {
        if (this.closed) return;
        const peers = FakeBroadcastChannel.buses.get(this.name);
        if (!peers) return;
        for (const peer of peers) {
            if (peer === this || peer.closed) continue;
            peer.onmessage?.({ data });
        }
    }

    public close(): void {
        this.closed = true;
        FakeBroadcastChannel.buses.get(this.name)?.delete(this);
    }

    /** Drop every registered channel — call between specs to isolate buses. */
    public static reset(): void {
        FakeBroadcastChannel.buses.clear();
    }
}
