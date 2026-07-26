# GROUPING.md

Design for **groups** and **frames** — containers that hold shapes (and other
containers) and control stacking as a unit.

**Status: groups are implemented** as designed below (`parentId`, sibling-scoped
`z`, DFS paint order, group/ungroup, `Ctrl+G`/`Ctrl+Shift+G`, double-click to enter
a group, group rotation) — see [DESIGN.md → Grouping](DESIGN.md) for the current
"what exists" summary and file pointers. **Frames are not built** — no `frame`
shape type, no chrome. This doc is kept as the original design rationale for both
(why `parentId` on the child, the scene-tree model, concurrent-edit handling) and
as the still-current plan for frames.

See [DESIGN.md](DESIGN.md) for the architecture this builds on and
[canvasDocument.ts](../client/src/document/canvasDocument.ts) for the shape
read/write API being extended.

## Goal

- Select shapes and **group** them (`Ctrl+G`) into `#G1`; select others → `#G2`.
- Groups stack **as a band**: with `#G2` above `#G1`, *every* shape in `#G2`
  renders above *every* shape in `#G1`, regardless of the members' individual
  order. Elevate `#G1` and its whole band jumps above `#G2`.
- Within a group, members keep their own up/down order.
- **Frames** are the same idea with a real render (background, border, title) —
  Figma/Excalidraw both have groups *and* frames. A group is just a frame whose
  render is empty.
- Containers **nest**: groups in groups, groups and shapes in frames.

## Core idea: containers are shapes, membership is a tree

Today every shape has one global [`z`](../client/src/model/types.ts) and
[`readAllShapes()`](../client/src/document/canvasDocument.ts) sorts the whole
board by it — a single stacking axis. That cannot express "whole bands stack,"
because nothing stops one group's high-`z` member from sorting above another
group's low-`z` member.

The fix is two decisions:

1. **A container is a shape.** A frame has real bounds and a real render, so it
   belongs in the `Shape` union with a `ShapeDefinition` like any other shape. A
   group is the degenerate case: a container shape whose `draw` is a no-op and
   whose bounds are *derived* from its children. Both live in the same `yShapes`
   map — one Yjs observer, one `UndoManager` scope, and copy/paste/delete/reorder
   all already iterate that one map.

2. **Membership points up the tree.** Each shape carries a `parentId`; the
   container stores **no** child list. `z` becomes "order among my siblings under
   the same parent." Rendering is a depth-first traversal of the resulting tree,
   sorting siblings by `z` at each level and recursing into containers in place.

Because containers nest, this is a **scene tree**, not a flat two-level scheme.
"All of `#G2` above all of `#G1`" and "elevate `#G1`" both reduce to a
sibling-scoped reorder among the containers' common parent — the whole subtree
rides along because it is painted during that node's DFS visit.

## Data model

### `model/types.ts`

Add two container types and a parent pointer:

```ts
export type ShapeType =
    | 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'draw' | 'text' | 'note'
    | 'group' | 'frame';

export interface BaseShape {
    // ...existing fields...
    /** Container this shape belongs to; absent ⇒ top-level (root). May be a
     *  group or a frame, hence the generic name. */
    parentId?: string;
    /** z is order among siblings under the SAME parent (no longer global). */
    z: number;
}

export interface GroupShape extends BaseShape {
    type: 'group';
    // no geometry: bounds are the union of the group's descendants.
}

export interface FrameShape extends BaseShape {
    type: 'frame';
    w: number;
    h: number;
    fill: string;
    stroke: string;
    name?: string; // frame title
}
```

### Why `parentId` on the child, and not a child-id list on the container

A single source of truth that merges cleanly under the CRDT:

- **No two-sources-of-truth drift.** If a container also listed its children,
  concurrent edits could disagree — a child listed by two parents, or listed here
  but with a different `parentId` there. Reconciling duplicates/orphans becomes
  ongoing work.
- **Reparenting is one field write.** Moving a shape between containers is a
  single `parentId` set that merges without splicing two containers' lists.
- **It reuses what exists.** Children already carry `z`; grouping shapes by
  `parentId` on read reuses that and adds no new ordered `Y.Array` to maintain.

The cost — finding a container's children requires a scan — is absorbed by
building the `parent → ordered children` index once per change, inside the same
`readAll` recompute that already runs on every
[`observeDeep`](../client/src/app/collab/collab.service.ts) fire.

## Reading and rendering: build the tree

`readAllShapes()` splits in two:

- Group shapes by `parentId` into a `parent → children (sorted by z)` map, with
  `undefined` as the root bucket.
- Produce the **draw order** by depth-first traversal from the root: at each
  node, visit siblings in `z` order; when a node is a container, draw it (frame
  chrome; group draws nothing) then recurse into its children so they paint on
  top of the frame.

[`SceneRenderer`](../client/src/canvas/render.ts) consumes that flat, correctly
ordered list unchanged — a group contributes nothing to paint, a frame paints its
chrome before its children.

**Derived group bounds are the one wrinkle.**
[`getBounds(shape)`](../client/src/shapes/shapeRegistry.ts) takes only the shape,
but a group's extent depends on its descendants. So a group's bounds are computed
at the document/registry level via the existing
[`unionBounds`](../client/src/shapes/shapeRegistry.ts) over its subtree, not
inside a self-contained `GroupShapeDef`. Frames store their own `w/h` and have no
such issue.

## Operations (on `CanvasDocument`)

All run inside the existing [`transact()`](../client/src/document/canvasDocument.ts)
so each is one undo step and one atomic sync.

- **`groupShapes(ids)`** — reject ids that already have a `parentId` (the "not
  already in a group" rule) or the shared parent must match. Mint a `group`
  shape, give it a `z` on top of its siblings, set each member's `parentId` to
  it, and renumber the members' `z` to `0..n-1`.
- **`ungroup(groupId)`** — clear `parentId` on the children (reparent them to the
  group's parent), reassign their `z` around the group's old slot, delete the
  group shape.
- **Reorder** — the existing four-op algorithm in
  [`reorderShapes`](../client/src/document/canvasDocument.ts) becomes
  **sibling-scoped**: filter to one parent's children, reorder among just those,
  renormalize their `z` to `0..n-1`. "Elevate `#G1` over `#G2`" is this run over
  their common parent's children (which include the group shapes themselves).
- **Delete a container** — delete or reparent its subtree (policy decision;
  Excalidraw deletes the members with the group).

## Interaction

- **Selection** — hit-test a child, then walk its `parentId` chain to select the
  top-level container. Selection stays a flat `string[]` of shape ids, so
  multiplayer presence needs no schema change.
- **Move / frame membership** — moving a frame moves its descendants. Dragging a
  shape into a frame's bounds can set its `parentId` (Figma-style capture);
  optional for v1.
- **Clipboard** — on paste, re-mint container ids and rewrite descendants'
  `parentId` to the new ids so a pasted group is independent of its source
  ([clipboardController](../client/src/interaction/clipboardController.ts)).
- **`Ctrl+G` / `Ctrl+Shift+G`** — wire in
  [keyboardController.ts](../client/src/interaction/keyboardController.ts) next to
  the existing reorder shortcuts.

## Editing inside a group (double-click to enter)

Selecting a group selects it *as a unit* — one drag moves everything. To edit a
single member without ungrouping, follow the Excalidraw model of a transient
**edit scope**:

- **Enter** — double-click a shape inside a group. The clicked *shape* becomes
  the selection (not the whole group), and the group's bounding frame is drawn
  around it (a dashed container outline) to show you are scoped inside it. Nested
  groups: each double-click descends one level.
- **While scoped** — clicks, marquee, move, resize, and reorder act on members of
  the entered group only; shapes outside it are inert. Reorder here is the
  sibling-scoped reorder above, so moving a member up/down restacks it *within*
  the group.
- **Exit** — click empty canvas, press `Esc`, or click outside the group's
  bounds. Selection returns to selecting whole groups again.

This is transient UI state, not document state — it belongs in
[`uiStore.ts`](../client/src/state/uiStore.ts) (e.g. an `editingGroupId` /
"active container" alongside `selection` and `editingId`), **not** in the Yjs
document. It is local to one user's view; peers keep seeing the group as a unit.
The renderer gains one input — the active container id — to draw its frame while
scoped; [`SceneRenderer`](../client/src/canvas/render.ts) already takes an
`editingId` for inline text editing, so this is the same pattern.

## Rotation

Rotating a group is **not** a group-specific mechanism — it is the shared
selection-transform primitive applied to the group's members. The full model
(bake the delta into each shape, keep no stored aggregate angle, re-fit an
axis-aligned frame so the handle pops back to the top, plus the pivot-drift and
float-drift tradeoffs) lives in **[DESIGN.md → Selection transforms](DESIGN.md)**.

Group-specific note: the "set" to rotate is the group's members (or, inside an
entered group, the shift-selected subset — see below). It runs as one
[`updateShapes`](../client/src/document/canvasDocument.ts) over that subtree in a
single `transact`, so it is one undo step.

## Concurrent-edit notes

- **Dangling `parentId`** — a peer deletes a container while another adds to it.
  Treat a `parentId` with no matching container as root, so a lost container
  degrades to loose top-level shapes rather than hiding them.
- **Reparent races** — because membership is a single field on the child, two
  peers reparenting the same shape resolve to one winner with no orphaned list
  entries; a shape reparented into a group being deleted falls back to root by
  the rule above.

## Where each change lands

| Concern | File |
|---|---|
| `parentId`, `group`/`frame` types | [model/types.ts](../client/src/model/types.ts) |
| Tree build, group/ungroup, sibling-scoped reorder, derived group bounds | [document/canvasDocument.ts](../client/src/document/canvasDocument.ts) |
| `GroupShapeDef` (empty render), `FrameShapeDef` (chrome + geometry) | [shapes/](../client/src/shapes/) + [shapeRegistry.ts](../client/src/shapes/shapeRegistry.ts) |
| DFS draw order consumption, active-container frame | [canvas/render.ts](../client/src/canvas/render.ts) |
| `Ctrl+G` / `Ctrl+Shift+G`, reorder routing | [interaction/keyboardController.ts](../client/src/interaction/keyboardController.ts) |
| Click selects container; double-click enters group | [interaction/interactionController.ts](../client/src/interaction/interactionController.ts) |
| `editingGroupId` / active container (transient) | [state/uiStore.ts](../client/src/state/uiStore.ts) |
| Paste re-mints container ids, rewrites `parentId` | [interaction/clipboardController.ts](../client/src/interaction/clipboardController.ts) |
