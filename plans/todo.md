# Todo

Backlog items to flesh out individually — not implementation plans yet. When ready to start on one, ask for a plan for that specific item (not all at once).

I also want to
- refactor the model a bit.
  - add a textSetting (or similar name) which inludes, the label, h align v align, font type,
  font size, and anoy other tet properties we might add later.
  - this same setting is used for shape label, text shape  and sticky note. 
  - i want font options, question - should we save font name per shape, or just funtEnum (font1, font2)?
  - we need the architect daughers font, we need a mono space font and a normal font.
  - should we save font size as a number or as the sizeEnum S, M, L, XL ?

property panel
- need to look into how it can be compressed a bit. when multiple items are selected
the panel shows a scrollbar. this is not ideal - lets see if it can be imoroved.


## 1. RoughJS "sketchy" rendering
- Integrate `roughjs` as a rendering option in `client/src/canvas/render.ts` so shapes can be drawn hand-drawn/sketchy instead of exact Canvas2D paths.
- Needs a per-shape deterministic seed (stored in the model) so re-renders/collab sync don't jitter between clients or frames.

## 2. Additional fill styles (via RoughJS)
- Beyond current fill handling, add: hachure (default), solid, zigzag, cross-hatch, dots, sunburst, dashed, zigzag-line — matching Excalidraw's fill style set.

## 3. Color palette flyout — stroke color & fill color
- Popout/flyout panel with ~32–48 swatches (exact count TBD).
- "Main" quick-select panel shows a small subset; selecting a palette color promotes it into the main panel.
- `transparent` and `black` are pinned/always available in the main panel.
- Other quick-select slots get replaced (MRU-style) as new colors are used.

## 4. Line style flyout
- Popout for line style: solid / dashed / dotted (existing concept, if any, to confirm) plus whatever RoughJS sketchy variants make sense.

## 5. Hand-drawn font
- Recommended: Google Fonts **Architects Daughter** (closest to Excalidraw's Virgil/Excalifont look), alternatives: Caveat, Kalam, Patrick Hand.
- Decide: self-host via `@fontsource/architects-daughter` vs Google Fonts CDN link, and where font selection lives in the text-shape model.
