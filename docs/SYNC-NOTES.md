# How Y.Doc sync works in this app

Reference notes on the sync/persistence architecture, written up from a walkthrough of the
actual code. See [DESIGN.md](DESIGN.md) for the broader architecture; this doc is focused
specifically on the CRDT sync/persistence path and two edge-case scenarios worth remembering.

## The three stores involved

Each browser tab has its own `Y.Doc` (`CanvasDocument.ydoc`), fed by two independent
providers wired up in [canvasDocument.ts:34-40](../client/src/document/canvasDocument.ts#L34-L40):

1. **`IndexeddbPersistence`** (`y-indexeddb`) — persists the doc to that browser's own
   **IndexedDB**, under the key `whiteboard-${room}`. IndexedDB is per-browser, per-origin,
   per-profile storage — it is *not* shared between two different browsers (or two different
   profiles) even on the same machine. It only makes reloading/reopening the *same* browser
   tab instant and lets that tab work offline.
2. **`WebsocketProvider`** (`y-websocket`) — connects to our own server implementation in
   [wsUtils.ts](../server/src/wsUtils.ts). This is the live sync channel, not storage.
3. **Server-side room doc** — the server keeps one `WSSharedDoc` per room name in an
   in-memory `Map` ([wsUtils.ts:71,83-92](../server/src/wsUtils.ts#L83-L92)), optionally backed
   by LevelDB if `PERSISTENCE_DIR` is set ([persistence.ts](../server/src/persistence.ts)). By
   default (`.env.example` has it commented out) **persistence is off** — the server is
   purely in-memory.

Key mental model: Yjs sync is not "send me the document," it's a **CRDT state merge**. Two
docs exchange state vectors and each sends the other only the operations it's missing, then
both apply them. There's no "load the whole doc" step — everything that ever gets synced is
additive (a union of ops), not a wholesale replacement.

## Q1: browser #1 creates shapes, then browser #2 opens

- Browser #1's shapes live in: (a) its own IndexedDB, and (b) the server's in-memory
  `WSSharedDoc` for that room (pushed there as `Y.Doc.on('update')` fires and gets broadcast —
  [wsUtils.ts:55-60](../server/src/wsUtils.ts#L55-L60)).
- Browser #2 opens: `new Y.Doc()` is empty, `IndexeddbPersistence` reads
  `whiteboard-<room>` from *browser #2's own* IndexedDB — empty, since it's a different
  browser store. So locally, #2 starts blank.
- `WebsocketProvider` then connects to the server for that room. On accept,
  `setupConnection` immediately sends **sync step 1** — an encoded state vector of the
  server's room doc ([wsUtils.ts:203-208](../server/src/wsUtils.ts#L203-L208)). The `y-websocket`
  client library replies with sync step 2 (the updates it's missing, i.e. essentially
  "everything," since #2 started empty) and sends its own (empty) state. The server applies
  that via `syncProtocol.readSyncMessage`
  ([wsUtils.ts:135-142](../server/src/wsUtils.ts#L135-L142)), which for #2 means: server has all
  of #1's ops, #2 has none, so the server ships #1's shapes down to #2.

So yes — #2 effectively gets the doc transferred, but the source isn't "browser #1 directly,"
it's the **server's in-memory room doc**, which browser #1 populated earlier over the same
protocol. It's server-mediated, not peer-to-peer.

## Q2: #1 creates + disconnects → #2 creates different shapes → #1 reconnects

The answer depends on whether the room becomes empty on the server.

**With the default config (no `PERSISTENCE_DIR`, i.e. in-memory only):**

- When #1 disconnects, `closeConn` runs. Once `doc.conns.size === 0` for that room, the
  server **destroys the `WSSharedDoc` and deletes it from the `docs` map**
  ([wsUtils.ts:116-119](../server/src/wsUtils.ts#L116-L119)). The document is gone from the
  server entirely — it only still exists in browser #1's own IndexedDB.
- #2 connects to the same room: `getOrCreateDoc` finds nothing, creates a **brand-new empty
  `WSSharedDoc`** ([wsUtils.ts:83-92](../server/src/wsUtils.ts#L83-L92)). #2's own IndexedDB is
  also empty (different browser). So #2 genuinely builds a fresh, disjoint document and
  pushes those new shapes to the server's new in-memory doc.
- #1 reconnects: its `ydoc` still has the *original* shapes (from its own IndexedDB — that
  never went away, disconnecting doesn't clear local persistence). The sync handshake runs
  again: server's state vector reflects #2's shapes; #1's state vector reflects #1's old
  shapes. Each side is missing what the other has, so **both send their missing ops to the
  other**.

The result is **not** "#1 sees #2's doc" or "#1 sees only its own old doc" — it's a **merge of
both**. Since shape IDs are generated with `nanoid()` per shape
([interactionController.ts:82](../client/src/interaction/interactionController.ts#L82)), #1's
and #2's shapes have different keys in the `yShapes` `Y.Map`, so nothing collides or gets
overwritten — you end up with a board containing **both #1's original shapes and #2's new
shapes together**. Yjs doesn't pick a winner between "documents"; it unions the operations.
(Per-key last-write-wins only kicks in if the *same* shape `id` were edited concurrently by
both — not the case here since IDs are independently generated.)

**If `PERSISTENCE_DIR` were set**, the outcome changes at the second bullet: even though the
in-memory `WSSharedDoc` gets destroyed on disconnect, recreating it calls
`persistence.bindState`, which reloads #1's shapes from LevelDB
([persistence.ts:23-28](../server/src/persistence.ts#L23-L28)) before #2 ever syncs. So #2
wouldn't see an empty board either — it would immediately receive #1's shapes too, and its
new shapes would just add to that set. The "completely different doc" premise only holds
while the room has zero connections *and* persistence is off.

**Bottom line:** #1 reconnecting sees a merged board with both sets of shapes, not one
replacing the other — this is the CRDT property that makes Yjs safe for offline edits, but it
means two independent sessions on the same room while disconnected produce a union, not a
conflict resolution down to a single version.
