# DESIGN.md

Architecture, data model, rendering/interaction internals, and extension guides for the collaborative whiteboard. See [CLAUDE.md](../CLAUDE.md) for commands and conventions.

## Repo layout

npm **workspaces** monorepo. Node **≥ 22**.

```
/                      root workspace (scripts, concurrently)
├─ server/             Yjs websocket relay (Node, ESM, tsx/tsc)
│  └─ src/
│     ├─ index.ts          HTTP+WS bootstrap, origin/room validation, /health, graceful shutdown
│     ├─ wsUtils.ts        WSSharedDoc + sync/awareness protocol relay (the core)
│     ├─ persistence.ts    optional LevelDB persistence (PERSISTENCE_DIR)
│     └─ y-leveldb.d.ts    local typings shim for y-leveldb
└─ client/             Angular + Canvas SPA (Vite, ESM, TS strict)
   └─ src/
      │  ═══ FRAMEWORK-AGNOSTIC CORE (no Angular import) ═══
      ├─ model/
      │  └─ shapeTypes.ts      Shape union (incl. `group`) + Bounds + AwarenessState + PeerPresence
      ├─ document/
      │  ├─ canvasDocument.ts  ⭐ CanvasDocument class: Yjs doc/provider/awareness/undo + all shape mutations
      │  ├─ documentFile.ts    save/open a board as a local `.json` file — serialize/validate, never throws
      │  ├─ localDocChannel.ts cross-tab live sync (BroadcastChannel) for a local-only (no `?room`) board
      │  └─ identity.ts        per-browser name+color (localStorage)
      ├─ state/
      │  ├─ uiStore.ts          ⭐ UIStore class: tool, camera, style, selection, editingId/editingGroupId (plain pub-sub)
      │  └─ recentColors.ts     RecentColorsStore: MRU stroke/fill swatches + custom color list (localStorage)
      ├─ shapes/                one class per shape type (behavior — see "Add a new shape type")
      │  ├─ shapeDefinition.ts    interface: capabilities, getBounds, hitTest, draw
      │  ├─ *ShapeDef.ts          rectangle/ellipse/diamond/arrow/draw/text/note/groupShapeDef
      │  │                        (groupShapeDef draws nothing and has no geometry of its own — see "Grouping")
      │  └─ shapeRegistry.ts      the one type -> definition switch
      ├─ tools/                 one class per tool (see "Add a new tool")
      │  ├─ tool.ts               interface: panelCapabilities, defaultStyle, onPointerDown
      │  ├─ toolDefs.ts           UI metadata per tool (label, icon, shortcut key) — toolbar and
      │  │                        keyboardController both read this one list, not two
      │  ├─ selectTool.ts / panTool.ts / createShapeTool.ts / drawTool.ts / textTool.ts / noteTool.ts
      │  └─ toolRegistry.ts       the one tool-name -> behavior switch
      ├─ interaction/
      │  ├─ interaction.ts        the pan|create|draw|move|marquee|resize|rotate|rotate-selection|arrow-endpoint union
      │  ├─ interactionController.ts  ⭐ the pointer-interaction state machine (framework-free, unit-tested)
      │  ├─ keyboardController.ts     shortcut -> command map (undo/redo, snap-to-grid, group/ungroup, layers, tool letters)
      │  └─ clipboardController.ts    copy/paste/duplicate, framework-free (needs the pointer position for paste)
      ├─ canvas/
      │  ├─ render.ts           SceneRenderer class: pure Canvas2D drawing of the whole scene
      │  └─ camera.ts           CameraMath class: screen<->world transforms, zoomAt, fitBounds
      └─ util/                  static-method util classes + shared cross-shell logic
         ├─ geometry.ts / vectorMath.ts / resizeMath.ts / handles.ts / canvasDraw.ts / arrowEndpoints.ts / rotationMath.ts
         ├─ sceneTree.ts           SceneTree: group/parentId tree ops — paint-order DFS, a container's children,
         │                         its subtree (delete/copy), bounds over its descendants (see "Grouping")
         ├─ shapeAligner.ts        ShapeAligner: align left/center/right/top/middle/bottom against the
         │                         selection's union bounds (group-aware via sceneTree)
         ├─ gridMath.ts            snap-to-grid constants + snap() — shared by renderer and interaction so
         │                         the drawn grid and the snap behavior can't drift apart
         ├─ fontUtil.ts / textMeasure.ts / textOptions.ts   font stacks/sizes, canvas text measuring
         │                         (also caret placement for the inline editor), per-shape text-option resolution
         ├─ roughDraw.ts           RoughJS hand-drawn rendering + per-shape geometry cache (see "Rendering")
         └─ panelCapabilities.ts   which properties-panel sections apply (shared by any shell)
      │
      │  ═══ ANGULAR SHELL (the only Angular in the tree) ═══
      └─ app/
         ├─ main.ts / app.component.ts (+ .html/.scss)   entry + shell + global keyboard shortcuts
         ├─ di-tokens.ts           the seam: every framework-agnostic singleton, wired once in `main.ts`
         │                         (see "Framework seam / DI tokens")
         ├─ state/
         │  ├─ ui-store.service.ts       Angular signals over `uiStore`
         │  ├─ current-file.service.ts   bound filename + per-tab FileSystemFileHandle (see "Local boards & files")
         │  └─ recent-colors.service.ts  Angular signals over `recentColors`
         ├─ collab/collab.service.ts      the seam: Angular signals over the Yjs doc/awareness
         ├─ whiteboard/whiteboard.component.ts (+ .html/.scss)  ⭐ canvas element, DPR sizing, rAF loop,
         │                                        forwards DOM pointer events to `InteractionController`
         └─ components/            toolbar, properties-panel, presence-bar, inline-editor, layer-icon,
                                    file-label, menu (+ burger-icon), confirm-dialog (+ .service),
                                    color-flyout (+ .service), and the align/duplicate/group/ungroup
                                    icon components used by the properties panel
                                    (each a .ts + .html + .scss triplet; confirm-dialog and color-flyout
                                    ship their own `@Injectable` service alongside the component, not in `state/`)
```

The two ⭐ core files are where most logic lives — `InteractionController` (framework-free, unit-tested) for interaction, `whiteboard.component.ts` for the thin view that hosts it.

**The framework boundary is lint-enforced** (`no-restricted-imports` in `client/eslint.config.js`): nothing under `shapes/`, `tools/`, `interaction/`, `util/`, `canvas/`, `model/`, `document/canvasDocument.ts`, or `state/uiStore.ts` may import `@angular/*`. Only `app/` may. This keeps all shape/tool/interaction/render logic reusable by any UI shell, not just the current Angular one.

## Framework seam / DI tokens

`app/di-tokens.ts` is the one place `app/` learns about the framework-agnostic classes above. Each is an `InjectionToken` wrapping a plain-TS singleton, instantiated once in `main.ts` and injected with `inject()` wherever a component needs it: `SHAPE_REGISTRY`, `TOOL_REGISTRY`, `UI_STORE`, `RECENT_COLORS`, `CANVAS_DOCUMENT`, `SCENE_RENDERER`, `TEXT_MEASURE`, `CLIPBOARD_CONTROLLER`, `DOCUMENT_FILE`. If you add a new framework-agnostic class that a component needs, wire it through a token here rather than `new`-ing it in the component — see `angular.md`.

## Architecture in one screen

- **The server is document-agnostic.** It only relays Yjs *sync* messages and *awareness* (presence) updates between peers in the same room. It knows nothing about shapes. This is what keeps sync conflict-free and the server trivially scalable. All shape semantics live on the client. Don't add shape logic to the server.
- **Room** = the websocket URL path (`ws://host:1234/<room>`). The client derives it from the `?room=` query param. **No `?room=` at all is a valid, first-class mode** — a local-only board with no server connection. See "Local boards & files" below.
- **Client source of truth** is the Yjs doc (`ydoc`), owned by `CanvasDocument`. The Angular shell (and the canvas renderer) are projections of it.
- Every board — room or local — is persisted to the browser via `y-indexeddb` (`IndexeddbPersistence`), so a reload doesn't lose anything even offline. A room additionally syncs over the websocket once connected.

## Data model (important)

Shapes live in `ydoc.getMap('shapes')` — a `Y.Map<string, Y.Map>`. **Each shape is its own nested `Y.Map`**, so concurrent edits to *different properties* of the same shape both survive (per-property CRDT merge). All shapes are anchored at `(x, y)` in world coords so "move" is always "add delta to x/y". Type-specific geometry is relative to that anchor (see `model/shapeTypes.ts`).

`ydoc.getMap('meta')` holds board-level metadata that isn't a shape — today just the bound file name (see "Local boards & files"). It's outside the `UndoManager`'s scope (which only tracks `shapes`), so writes to it aren't undoable — that's intentional, a file binding isn't an edit.

You **cannot store class instances in Yjs** — the CRDT needs POJOs. Shape *data* is always a plain interface; shape *behavior* lives in the `shapes/*ShapeDef.ts` strategy classes, looked up by type through `shapeRegistry.ts`. Don't turn a shape interface into a class with methods.

- **Groups** are a shape too (`type: 'group'`), and any shape can carry a `parentId` pointing at a group. **`z` is scoped to siblings under the same parent**, not global — see "Grouping" below for the full model.
- **z-order**: within one parent, `SceneRenderer` draws ascending by `z` (via a depth-first paint order — see "Grouping"). New shapes get `topZUnder(parentId) + 1`. `reorderShapes(ids, op)` (`toFront|toBack|forward|backward`) is **sibling-scoped**: it reorders among one parent's children only, then **renormalizes that parent's children's `z` to a gap-free `0..n-1`**, writing back only changed shapes. This is what makes "send a group to back" move the whole group as a band instead of reshuffling its members among everything else on the board.

## Mutations — always go through `document/canvasDocument.ts`

`CanvasDocument` exposes `addShape(s)`/`addShapes`, `updateShape`/`updateShapes`, `deleteShapes`, `reorderShapes`, `replaceAllShapes` (used by file-open, see "Local boards & files"), `groupShapes`/`ungroup`, and `clearBoard`. They all wrap writes in `transact()`, which tags the transaction with `LOCAL_ORIGIN` so the `UndoManager` tracks only local edits (never undoes a peer's work) — one call to any of these is one undo step, even when it touches several shapes. **Never mutate `yShapes` directly** outside these methods, or undo/redo and origin filtering break.

## Rendering — on-demand, not a perpetual loop

`app/whiteboard/whiteboard.component.ts` renders **only when something changes**: `scheduleRender()` coalesces changes into a single `requestAnimationFrame` → `drawNow()` → `SceneRenderer.render()`. Redraws are triggered by an Angular `effect()` that reads shapes, peers, and every `uiStore` field the renderer depends on (camera/selection/editingId/tool/spacePan) — touching any of them re-runs the effect. Resize and pointer handlers (for local-only drafts/marquee, which don't touch the store or doc) call `scheduleRender()` directly. If you add a new source of visual state, make sure something calls `scheduleRender()` or is read inside that `effect()`.

`SceneRenderer` is a **pure** class (no Angular, no globals) driven only by its inputs — easy to unit-test by calling it against a throwaway canvas; see `canvas/render.test.ts`.

Rectangle/ellipse/diamond/arrow draw via `util/roughDraw.ts` (`RoughDraw`), a thin wrapper around RoughJS's `RoughGenerator` for the hand-drawn "Sloppiness" look (plain/light/medium — see `util/palette.ts`'s `SLOPPINESS`). Because every pointer-move triggers a full scene redraw but RoughJS re-rolls its sketchy geometry on every call, `RoughDraw` caches one `Drawable` per shape id, invalidated only when something that actually changes the geometry changes (size, sloppiness, fill style/presence, stroke width) — colors and dash pattern are applied at paint time and don't bust the cache. The sketch is seeded deterministically from the shape's `id` (`RoughDraw.seedFor`), not a stored field, so it never jitters across reloads, peers, or frames, and needs no migration for shapes that predate the feature. Freehand `draw`, `text`, and `note` are unaffected — freehand is already hand-drawn, and roughening text would desync the inline-editor overlay's shared baseline/box model.

The renderer also draws, when asked to via its `RenderInput` flags: the snap-to-grid line grid (`showGrid`, minor/major lines from `util/gridMath.ts`), a dashed "active container" outline around an entered group's members (`editingGroupId`), and a dashed union frame + rotate handle around a multi-selection or a selected group (see "Grouping" and "Selection transforms" below). It draws shapes in `CanvasDocument.readAllShapes()`'s order, which is already the correct depth-first paint order — the renderer itself doesn't know about groups beyond "some shapes have no geometry and draw nothing."

## Interaction model

`InteractionController` (in `interaction/`, no framework import) owns a single `Interaction` union: `none | pan | create | draw | move | marquee | resize | rotate | rotate-selection | arrow-endpoint`. `app/whiteboard/whiteboard.component.ts` wires DOM pointer events to it via `onPointerDown`/`onPointerMove`/`onPointerUp`, translating screen coordinates to world coordinates first (`CameraMath`). Which interaction a pointer-down starts is decided by the current tool's `onPointerDown` (`tools/*.ts`, looked up via `toolRegistry.ts`) — read from `uiStore.getState()` directly, not through a reactive binding, so tool lookups don't cause spurious re-renders. Live cursor position is published on every `pointermove` via `awareness.setLocalStateField('cursor', ...)`.

Copy/paste/duplicate don't go through `InteractionController` — they're one-shot commands, not drags — and live in the framework-agnostic `interaction/clipboardController.ts` instead, wired from keyboard handlers in `whiteboard.component.ts` (paste needs the current pointer position, which only the component tracks).

## Selection transforms (rotate / scale)

Rotating a **set** of shapes at once is implemented (`{ kind: 'rotate-selection' }`
in `interaction.ts`, handled in `interactionController.ts`). It's one primitive
with three entry points that differ only in how the set is chosen:

- an **ad-hoc multi-selection** — the set is `uiStore.selection`;
- a **group** — the set is the group's members (see "Grouping" below);
- **inside an entered group** — the set is the shift-selected subset of that
  group's members.

**The primitive:** rotate the set about a common pivot, **bake the delta into
each shape**, and re-fit an axis-aligned selection frame. This is the multi-shape
generalization of single-shape rotate —
[`{ kind: 'rotate'; id }`](../client/src/interaction/interaction.ts) targets one
shape and writes its `rotation` live in
[`interactionController`](../client/src/interaction/interactionController.ts). The
multi variant (`rotate-selection`) carries the set's ids, each shape's origin
anchor + `origRotation`, and the pivot, in a `RotateOrigin` per shape (discriminated
`box | arrow | draw`, since each rotates differently — see below).

### The selection frame

For `selection.length > 1` (or a single selected group), [`SceneRenderer`](../client/src/canvas/render.ts)
draws a dashed axis-aligned box (`unionBounds` over the selection's members) with
a rotate handle at the top — the frame the `rotate-selection` interaction hit-tests
against. It's built to also carry corner scale anchors later: both would read the
same axis-aligned union, so adding scaling is adding handles to an existing frame,
not new infrastructure.

### Rotation is baked, not stored (model B)

No aggregate angle is stored on the selection or group. On pointer-down, capture
the **pivot** = center of the selection's axis-aligned bounds, and per shape its
origin anchor `(x, y)` and `origRotation`. On each move, by delta `θ`:

- rotate every shape's anchor about the pivot by `θ`;
- **box shapes** (rectangle/ellipse/diamond/note/text) accumulate
  `rotation = origRotation + θ` (snap to 5° with Shift, via
  [`RotationMath`](../client/src/util/rotationMath.ts));
- **`arrow`/`draw`** ignore the `rotation` field, so rotate their geometry
  explicitly — the `dx/dy` endpoints and the relative `points` — about the pivot.

Write the whole set in one [`updateShapes`](../client/src/document/canvasDocument.ts)
per frame (live, like single-shape rotate). Because nothing stores an aggregate
angle, the frame re-derives as an axis-aligned `unionBounds` every frame and the
rotate handle sits at the top of an upright box — on release it "pops back" to
top rather than staying attached to a tilted frame.

**Why bake:** it preserves the world-coordinate invariant (every shape's `x,y`
stay world-space, axis-aligned in their own frame), so `hitTest`/`getBounds` need
**no** ancestor-transform composition — the geometry layer is untouched. The
alternative (a stored container transform) would force every hit/bounds path to
compose a parent transform chain.

Two tradeoffs are inherent to "re-fit axis-aligned + reset handle":

- **Pivot drift across drags.** Rotating a set rigidly about center `C` yields a
  result whose *axis-aligned* box is centered on `C' ≠ C`, so the next drag pivots
  about `C'` — 30°+30° in two drags differs slightly from 60° in one. A stored
  group angle would avoid this; this UX trades it away deliberately.
- **Cumulative float drift** on `draw`/`arrow`, whose coordinates are rewritten
  each rotation rather than composing an angle. Box shapes are fine — `rotation`
  just accumulates.

The whole drag is `LOCAL_ORIGIN` writes coalesced by the `UndoManager`'s
`captureTimeout` into one undo step, same as the existing rotate/move.

### Scaling (deferred)

Same frame and corner anchors, not yet built. The wrinkle to plan for: a
**rotated** member cannot be scaled by a world-space delta — it must be scaled in
its own local frame, so multi-selection scaling of rotated shapes is not a simple
`w/h` multiply. Defer until rotation lands.

### Where it lives

- [`interaction.ts`](../client/src/interaction/interaction.ts) — the
  `rotate-selection` variant (ids + per-shape `RotateOrigin` + pivot).
- [`interactionController.ts`](../client/src/interaction/interactionController.ts)
  — the multi-shape rotate case; hits the rotate handle off the union frame.
- [`render.ts`](../client/src/canvas/render.ts) — draws the rotate handle on the
  `selection.length > 1` (or single-group) frame; hides it while `rotatingSelection`
  is true so it doesn't look stuck at the top while the shapes visibly turn.
- [`RotationMath`](../client/src/util/rotationMath.ts) — set-rotation helpers
  (rotate a point about the pivot; the arrow/draw geometry rotation).

## Grouping

Groups are implemented — a group is a shape (`type: 'group'`, no geometry of its
own) that other shapes point at via `parentId` (see "Data model" above). The full
design rationale (why `parentId` on the child rather than a child list on the
container, how paint order works, concurrent-edit handling) lives in
[GROUPING.md](GROUPING.md); this section is the "what actually exists" summary.

- **Tree ops** live in [`util/sceneTree.ts`](../client/src/util/sceneTree.ts)
  (`SceneTree`): `flattenToPaintOrder` (depth-first, groups paint before their
  members so members render on top — this is what `CanvasDocument.readAllShapes()`
  returns), `childrenOf`, `subtreeIds` (for delete/copy), `boundableDescendants`
  (for bounds/align/rotate over a group's members). A `parentId` pointing at a
  missing group is treated as root, so a deleted container degrades to loose
  shapes rather than hiding them.
- **`CanvasDocument.groupShapes(ids)` / `.ungroup(groupId)`** create/dissolve a
  group, reparenting members and renormalizing their `z`. `deleteShapes` deletes a
  group's whole subtree with it. `reorderShapes` is sibling-scoped (see "Data
  model"), which is what makes a group's whole band move together.
- **`GroupShapeDef`** (`shapes/groupShapeDef.ts`) is never hit-tested directly and
  draws nothing; its bounds are a degenerate zero box — real bounds always come
  from `unionBounds` over `SceneTree.boundableDescendants`.
- **`Ctrl+G` / `Ctrl+Shift+G`** (`interaction/keyboardController.ts`) group/ungroup
  the current selection.
- **Double-click to enter a group** (handled in `app/whiteboard/whiteboard.component.ts`,
  not `interactionController.ts`) sets `uiStore.editingGroupId` — transient,
  local-only view state, never written to Yjs, so peers keep seeing the group as a
  unit while you're scoped inside it. While set, clicks/marquee/reorder act on that
  group's members only, and `SceneRenderer` draws a dashed "active container"
  outline around it. Clicking outside the group, `Esc`, or clicking empty canvas
  exits (`editingGroupId = null`).
- **Rotating a group** reuses the selection-transform primitive above over its
  members — no group-specific rotation code.

**Frames are not implemented.** GROUPING.md's frame concept (a container with its
own border/title/background, distinct from a plain group) is still just a plan —
there's no `frame` shape type or `FrameShapeDef`. Only chromeless groups exist
today.

## Presence

Yjs **awareness** carries `{ user:{name,color}, cursor:{x,y}|null, selection:string[] }`. Remote cursors are a DOM overlay in `whiteboard.component.html`; peer selections are drawn on-canvas by `SceneRenderer`. (The color-swatch picker described below — recent/custom colors — is a local UI convenience, unrelated to awareness.)

## Local boards & files

Opening the app with no `?room=` gives you a **local-only board**: no `WebsocketProvider`, nothing shared with anyone. It still behaves like a real board because `CanvasDocument` doesn't special-case much:

- **Persistence** is the same either way — `IndexeddbPersistence` (`y-indexeddb`) keeps every board (room or local) in the browser, so a reload doesn't lose anything even fully offline.
- **Cross-tab sync for a local board** is the one thing a room's `WebsocketProvider` would otherwise give you for free. `document/localDocChannel.ts` (`LocalDocChannel`) fills that gap with a plain `BroadcastChannel`: on construction it asks other open tabs of the same board for their state (`Y.encodeStateAsUpdate`) and relays local doc updates to them, tagging incoming updates with itself as origin so they don't loop back or land in the local `UndoManager`. It only exists when `room === null`; in a room, the provider already handles this.
- **Awareness (cursors/presence) is not synced across local tabs** — there's no "peer" concept for a board only you have open.

**Save/open as a `.json` file** is a separate, optional layer on top — it doesn't replace the room/IndexedDB model, it's an export/import of a snapshot:

- `document/documentFile.ts` (`DocumentFile`) serializes the current shapes plus camera/snap-to-grid into `{ kind: 'whiteboard/document', version, shapes, view }` JSON, and deserializes with validation that never throws — an unrecognized `kind`/`version` or an invalid shape just yields `null`, and a malformed `view` is dropped rather than failing the whole load. (This is a different envelope from the clipboard's copy/paste format.)
- Opening a file calls `CanvasDocument.replaceAllShapes()` — one transaction, so it syncs to peers/other tabs as a single atomic update and undoes as one step — then restores the camera/snap-to-grid locally.
- `app/components/menu.component.ts` is the UI for this: Open (`Ctrl+O`), Save to the current file (`Ctrl+S`, once one is bound), Save As, and Clear Whiteboard (behind a confirm dialog). It uses the File System Access API (`showOpenFilePicker`/`showSaveFilePicker`, typed via `client/src/file-system-access.d.ts`) where available, and falls back to a `<input type=file>` / Blob download for browsers that don't have it (Firefox, Safari).
- `app/state/current-file.service.ts` (`CurrentFileService`) tracks the per-tab `FileSystemFileHandle` (not shareable — only the tab that opened/saved the file holds it) and the bound file name. The name itself is written into `CanvasDocument`'s Yjs `meta` map (`fileName`), so it *does* sync across tabs/peers even though the handle doesn't.

## How to extend

### Add a new shape type
1. `model/shapeTypes.ts` — add the interface, add it to the `Shape` union and `ShapeType`.
2. `shapes/` — add `FooShapeDef.ts` implementing `ShapeDefinition` (`capabilities`, `getBounds`, `hitTest`, `draw`), and register it in `shapeRegistry.ts`.

That's it — `getBounds`/`hitTest`/`drawShape`, resize handles, and the properties panel's visible sections (`ShapeDefinition.capabilities`) all read from the registry. If it needs its own tool, see below.

### Add a style option (e.g. a new stroke/fill toggle)

Follow the trace the "Sloppiness" row added (`shapeTypes.ts`'s `Sloppiness`, `util/roughDraw.ts`'s `SLOPPINESS`-driven options):

1. `model/shapeTypes.ts` — add the type and an optional field on whichever `*Shape` interfaces carry it. Optional, so old persisted shapes (and old Yjs docs) load unchanged — default it at the read site (`shape.foo ?? 'default'`), never require a migration.
2. `shapes/shapeDefinition.ts` — add an optional flag to `ShapeCapabilities`; set it `true` on each shape def that supports it.
3. `util/panelCapabilities.ts` — OR the new flag into **both** `panelFlags`'s reduce and its zero-value seed literal (easy to miss one).
4. `state/uiStore.ts` — add the field to `Style` and its initial value (the "next new shape" default).
5. `tools/toolRegistry.ts` — copy `style.foo` onto each applicable `CreateShapeTool`/draft-factory literal.
6. `util/palette.ts` — add the option-list constant (`{ value, label, icon }[]`) the panel iterates.
7. `app/components/properties-panel.component.ts` + `.html` — add the list, a `selectedFoo` computed via `selectedCommon`, an `applyFoo` method via `apply`, and a `@if (flags().foo)` row in the template (copy an existing `width-row` block). **Guard the shape-patch predicate by `shape.type`, not `'foo' in shape`** — an `in` check reads a not-yet-set optional field as "doesn't apply" rather than "unset", which silently breaks the control for every shape that predates the field (see `applySloppiness`/`applyEdges`).
8. Draw the new option in each affected `*ShapeDef.draw()`.
9. Update tests: `util/panelCapabilities.test.ts` (exact-object assertions), `canvas/render.test.ts` if the draw call trace changes, and `app/components/properties-panel.component.test.ts`.

### Add a new tool / shortcut
1. `state/uiStore.ts` — add the tool name to the `Tool` union.
2. `tools/` — add a class implementing `Tool` (`panelCapabilities`, optional `defaultStyle`, `onPointerDown`), and register it in `toolRegistry.ts`.
3. `tools/toolDefs.ts` — add an entry to `TOOL_DEFS` (label, icon, shortcut key). This is the single source both the toolbar and the keyboard shortcut map read from, so one entry wires up both — don't add the tool to `toolbar.component.html` or a separate shortcut map by hand.

Global shortcuts (undo/redo, snap-to-grid, group/ungroup, layers `Ctrl+[`/`]`, tool letters from `toolDefs.ts`) live in `interaction/keyboardController.ts`, wired up once in `app/app.component.ts`. Canvas-focused ones (delete, escape, space-pan, copy/paste/duplicate, zoom-to-fit/-selection — these need the pointer position or viewport size) live in `app/whiteboard/whiteboard.component.ts`, with the copy/paste/duplicate logic itself in the framework-agnostic `interaction/clipboardController.ts`. **`Ctrl+S`/`Ctrl+O` are the one exception**: `app/components/menu.component.ts` owns its own `window` keydown listener for those (so the file-save/open flow, which needs Angular-injected services, doesn't have to be threaded through the framework-agnostic `KeyboardController`) — check there too if a shortcut seems to do nothing.

## Verification / testing pattern

Two safety nets, two jobs:

- **Vitest** (`npm run test` from `client/`) — the core unit suite. Tests pure-TS logic only: shape bounds/hit-testing (`model/geometry.test.ts`), resize/vector/rotation math (`util/*.test.ts`), grouping (`util/sceneTree.test.ts`), alignment (`util/shapeAligner.test.ts`), the interaction state machine (`interaction/interactionController.test.ts`), keyboard shortcuts (`interaction/keyboardController.test.ts`), copy/paste/duplicate (`interaction/clipboardController.test.ts`), the `UIStore` class (`state/uiStore.test.ts`), panel-capability logic (`util/panelCapabilities.test.ts`), the file save/open codec (`document/documentFile.test.ts`), and draw-call characterization of the renderer (`canvas/render.test.ts`). It never imports a UI framework.
- **Playwright** (`npm run test:e2e` from `client/`) — drives the real app end-to-end (`client/e2e/`), asserting against DOM structure, class names, and `title` attributes.

When adding logic, prefer a Vitest unit over a Playwright e2e if the logic can be reached without a DOM — it's faster and framework-proof by construction.

## Environment gotchas (real, already hit)

- **Headless browser preview runs with `document.hidden === true`**, which pauses `requestAnimationFrame`. Because rendering is (correctly) rAF-driven, the canvas won't paint and screenshots/`getImageData` won't work in that headless preview. This is **not a bug** — a normal visible browser tab paints fine. Verify rendering by calling `SceneRenderer.render` directly instead.
- **`y-websocket@1.5.x` is ESM-first** and misbehaves when required as CJS from a plain Node script. Use `tsx`, or import it in Vite (which handles the interop). The client is unaffected.
- **y-leveldb** hides its types behind its `exports` map under NodeNext → we ship a local `server/src/y-leveldb.d.ts` shim.
- **oxc-parser's platform-specific optional binding can go missing** after a fresh `npm install` on Windows (a known npm optional-dependencies bug, npm/cli#4828) — Vite's config loader needs it. If `npm run dev`/`build` fails with `Cannot find native binding` from `oxc-parser`, run `npm install --no-save @oxc-parser/binding-win32-x64-msvc` (or the platform-appropriate package) from the repo root.

## Config / env

- Server: `PORT` (1234), `HOST` (0.0.0.0), `ALLOWED_ORIGINS` (comma list; empty = allow all), `PERSISTENCE_DIR` (unset = in-memory). See `server/.env.example`.
- Client: `VITE_WS_URL` (default `ws://<current-host>:1234`). See `client/.env.example`.
