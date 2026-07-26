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
      │  └─ shapeTypes.ts      Shape union + Bounds + AwarenessState + PeerPresence
      ├─ document/
      │  ├─ canvasDocument.ts  ⭐ CanvasDocument class: Yjs doc/provider/awareness/undo + all shape mutations
      │  └─ identity.ts        per-browser name+color (localStorage)
      ├─ state/uiStore.ts      ⭐ UIStore class: tool, camera, style, selection, editingId (plain pub-sub, no framework)
      ├─ shapes/                one class per shape type (behavior — see "Add a new shape type")
      │  ├─ shapeDefinition.ts    interface: capabilities, getBounds, hitTest, draw
      │  ├─ *ShapeDef.ts          rectangle/ellipse/arrow/draw/text/noteShapeDef
      │  └─ shapeRegistry.ts      the one type -> definition switch
      ├─ tools/                 one class per tool (see "Add a new tool")
      │  ├─ tool.ts               interface: panelCapabilities, defaultStyle, onPointerDown
      │  ├─ selectTool.ts / panTool.ts / createShapeTool.ts / drawTool.ts / textTool.ts / noteTool.ts
      │  └─ toolRegistry.ts       the one tool-name -> behavior switch
      ├─ interaction/
      │  ├─ interaction.ts        the pan|create|draw|move|marquee|resize|arrow-endpoint union
      │  ├─ interactionController.ts  ⭐ the pointer-interaction state machine (framework-free, unit-tested)
      │  └─ keyboardController.ts     shortcut -> command map (undo/redo, layers, tool letters)
      ├─ canvas/
      │  ├─ render.ts           SceneRenderer class: pure Canvas2D drawing of the whole scene
      │  └─ camera.ts           CameraMath class: screen<->world transforms, zoomAt
      └─ util/                  static-method util classes + shared cross-shell logic
         ├─ geometry.ts / vectorMath.ts / resizeMath.ts / handles.ts / canvasDraw.ts / arrowEndpoints.ts
         ├─ roughDraw.ts           RoughJS hand-drawn rendering + per-shape geometry cache (see "Rendering")
         └─ panelCapabilities.ts   which properties-panel sections apply (shared by any shell)
      │
      │  ═══ ANGULAR SHELL (the only Angular in the tree) ═══
      └─ app/
         ├─ main.ts / app.component.ts (+ .html/.scss)   entry + shell + global keyboard shortcuts
         ├─ state/ui-store.service.ts     the seam: Angular signals over `uiStore`
         ├─ collab/collab.service.ts      the seam: Angular signals over the Yjs doc/awareness
         ├─ whiteboard/whiteboard.component.ts (+ .html/.scss)  ⭐ canvas element, DPR sizing, rAF loop,
         │                                        forwards DOM pointer events to `InteractionController`
         └─ components/            toolbar, properties-panel, presence-bar, inline-editor, layer-icon
                                    (each a .ts + .html + .scss triplet)
```

The two ⭐ core files are where most logic lives — `InteractionController` (framework-free, unit-tested) for interaction, `whiteboard.component.ts` for the thin view that hosts it.

**The framework boundary is lint-enforced** (`no-restricted-imports` in `client/eslint.config.js`): nothing under `shapes/`, `tools/`, `interaction/`, `util/`, `canvas/`, `model/`, `document/canvasDocument.ts`, or `state/uiStore.ts` may import `@angular/*`. Only `app/` may. This keeps all shape/tool/interaction/render logic reusable by any UI shell, not just the current Angular one.

## Architecture in one screen

- **The server is document-agnostic.** It only relays Yjs *sync* messages and *awareness* (presence) updates between peers in the same room. It knows nothing about shapes. This is what keeps sync conflict-free and the server trivially scalable. All shape semantics live on the client. Don't add shape logic to the server.
- **Room** = the websocket URL path (`ws://host:1234/<room>`). The client derives it from the `?room=` query param.
- **Client source of truth** is the Yjs doc (`ydoc`), owned by `CanvasDocument`. The Angular shell (and the canvas renderer) are projections of it.

## Data model (important)

Shapes live in `ydoc.getMap('shapes')` — a `Y.Map<string, Y.Map>`. **Each shape is its own nested `Y.Map`**, so concurrent edits to *different properties* of the same shape both survive (per-property CRDT merge). All shapes are anchored at `(x, y)` in world coords so "move" is always "add delta to x/y". Type-specific geometry is relative to that anchor (see `model/shapeTypes.ts`).

You **cannot store class instances in Yjs** — the CRDT needs POJOs. Shape *data* is always a plain interface; shape *behavior* lives in the `shapes/*ShapeDef.ts` strategy classes, looked up by type through `shapeRegistry.ts`. Don't turn a shape interface into a class with methods.

- **z-order**: every shape has a numeric `z`; `SceneRenderer` draws ascending by `z`. New shapes get `topZ() + 1`. `reorderShapes(ids, op)` (`toFront|toBack|forward|backward`) recomputes order then **renormalizes `z` to a gap-free `0..n-1`**, writing back only changed shapes.

## Mutations — always go through `document/canvasDocument.ts`

`CanvasDocument` exposes `addShape`, `updateShape(s)`, `deleteShapes`, `reorderShapes`, `clearBoard`. They wrap writes in `transact()` which tags the transaction with `LOCAL_ORIGIN` so the `UndoManager` tracks only local edits (never undoes a peer's work). **Never mutate `yShapes` directly** outside these methods, or undo/redo and origin filtering break.

## Rendering — on-demand, not a perpetual loop

`app/whiteboard/whiteboard.component.ts` renders **only when something changes**: `scheduleRender()` coalesces changes into a single `requestAnimationFrame` → `drawNow()` → `SceneRenderer.render()`. Redraws are triggered by an Angular `effect()` that reads shapes, peers, and every `uiStore` field the renderer depends on (camera/selection/editingId/tool/spacePan) — touching any of them re-runs the effect. Resize and pointer handlers (for local-only drafts/marquee, which don't touch the store or doc) call `scheduleRender()` directly. If you add a new source of visual state, make sure something calls `scheduleRender()` or is read inside that `effect()`.

`SceneRenderer` is a **pure** class (no Angular, no globals) driven only by its inputs — easy to unit-test by calling it against a throwaway canvas; see `canvas/render.test.ts`.

Rectangle/ellipse/diamond/arrow draw via `util/roughDraw.ts` (`RoughDraw`), a thin wrapper around RoughJS's `RoughGenerator` for the hand-drawn "Sloppiness" look (plain/light/medium — see `util/palette.ts`'s `SLOPPINESS`). Because every pointer-move triggers a full scene redraw but RoughJS re-rolls its sketchy geometry on every call, `RoughDraw` caches one `Drawable` per shape id, invalidated only when something that actually changes the geometry changes (size, sloppiness, fill style/presence, stroke width) — colors and dash pattern are applied at paint time and don't bust the cache. The sketch is seeded deterministically from the shape's `id` (`RoughDraw.seedFor`), not a stored field, so it never jitters across reloads, peers, or frames, and needs no migration for shapes that predate the feature. Freehand `draw`, `text`, and `note` are unaffected — freehand is already hand-drawn, and roughening text would desync the inline-editor overlay's shared baseline/box model.

## Interaction model

`InteractionController` (in `interaction/`, no framework import) owns a single `Interaction` union: `none | pan | create | draw | move | marquee | resize | arrow-endpoint`. `app/whiteboard/whiteboard.component.ts` wires DOM pointer events to it via `onPointerDown`/`onPointerMove`/`onPointerUp`, translating screen coordinates to world coordinates first (`CameraMath`). Which interaction a pointer-down starts is decided by the current tool's `onPointerDown` (`tools/*.ts`, looked up via `toolRegistry.ts`) — read from `uiStore.getState()` directly, not through a reactive binding, so tool lookups don't cause spurious re-renders. Live cursor position is published on every `pointermove` via `awareness.setLocalStateField('cursor', ...)`.

## Selection transforms (rotate / scale)

Rotating (and, later, scaling) works on a **set** of shapes, and it is one
primitive with three entry points that differ only in how the set is chosen:

- an **ad-hoc multi-selection** — the set is `uiStore.selection`;
- a **group** — the set is the group's members (see [GROUPING.md](GROUPING.md));
- **inside an entered group** — the set is the shift-selected subset of that
  group's members.

**The primitive:** rotate the set about a common pivot, **bake the delta into
each shape**, and re-fit an axis-aligned selection frame. This is the multi-shape
generalization of the existing single-shape rotate — today
[`{ kind: 'rotate'; id }`](../client/src/interaction/interaction.ts) targets one
shape and writes its `rotation` live in
[`interactionController`](../client/src/interaction/interactionController.ts). The
multi variant carries the set's ids, each shape's origin anchor + `origRotation`,
and the pivot.

### The selection frame

For `selection.length > 1`, [`SceneRenderer`](../client/src/canvas/render.ts)
already draws a dashed axis-aligned box (`unionBounds`) but with **no handles
yet**. Build that box as the reusable transform frame: it carries the **rotate
handle now** and the **corner scale anchors later**. Both read the same
axis-aligned union — so adding scaling is adding handles to an existing frame,
not new infrastructure.

### Rotation is baked, not stored (model B)

No aggregate angle is stored on the selection or group. On pointer-down, capture
the **pivot** = center of the selection's axis-aligned bounds, and per shape its
origin anchor `(x, y)` and `origRotation`. On each move, by delta `θ`:

- rotate every shape's anchor about the pivot by `θ`;
- **box shapes** (rectangle/ellipse/diamond/note/text/frame) accumulate
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

### Where it lands

- [`interaction.ts`](../client/src/interaction/interaction.ts) — extend/parallel
  the `rotate` variant for a set (ids + per-shape origins + pivot).
- [`interactionController.ts`](../client/src/interaction/interactionController.ts)
  — the multi-shape `rotate` case; hit the rotate handle off the union frame.
- [`render.ts`](../client/src/canvas/render.ts) — draw the rotate handle (and
  later scale anchors) on the `selection.length > 1` frame.
- [`RotationMath`](../client/src/util/rotationMath.ts) — set-rotation helpers
  (rotate a point about the pivot; the arrow/draw geometry rotation).

## Presence

Yjs **awareness** carries `{ user:{name,color}, cursor:{x,y}|null, selection:string[] }`. Remote cursors are a DOM overlay in `whiteboard.component.html`; peer selections are drawn on-canvas by `SceneRenderer`.

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
3. `app/components/toolbar.component.html` — add a toolbar entry (icon + shortcut key label).
4. `interaction/keyboardController.ts` — add the shortcut key to `SHORTCUTS` if it needs a letter shortcut.

Global shortcuts (undo/redo, layers `Ctrl+[`/`]`, tool letters) live in `interaction/keyboardController.ts`, wired up once in `app/app.component.ts`. Canvas-focused ones (delete, escape, space-pan, copy/paste — paste needs the pointer position) live in `app/whiteboard/whiteboard.component.ts`, with the copy/paste logic itself in the framework-agnostic `interaction/clipboardController.ts`.

## Verification / testing pattern

Two safety nets, two jobs:

- **Vitest** (`npm run test` from `client/`) — the core unit suite. Tests pure-TS logic only: shape bounds/hit-testing (`model/geometry.test.ts`), resize/vector math (`util/*.test.ts`), the interaction state machine (`interaction/interactionController.test.ts`), keyboard shortcuts (`interaction/keyboardController.test.ts`), the `UIStore` class (`state/uiStore.test.ts`), panel-capability logic (`util/panelCapabilities.test.ts`), and draw-call characterization of the renderer (`canvas/render.test.ts`). It never imports a UI framework.
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
