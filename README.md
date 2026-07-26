# Excali-Clone

A hobby project — my own version of Excalidraw. Draw rectangles, ellipses, lines, arrows, freehand shapes, text, and sticky notes, all with that hand-drawn look.

This is built mainly for **offline, local use**. Everything runs in your browser and boards save/open as a `.json` file — no server or account needed.

![Sample board](images/jk-sample.png)

It also supports live sharing — just add `?room=<anyname>` to the URL and anyone with that link edits the same board with you, live. That's a nice extra, but not the main point of this project.

Built almost entirely by Claude — Opus did the planning, Sonnet did the implementation. I just steered the ship.

## Features

- Tools: select, pan, rectangle, ellipse, line, arrow, freehand pen, text, sticky notes
- Infinite canvas, pan & zoom
- Undo/redo, copy/paste, duplicate
- Grouping, layering, opacity, rotation
- Style options: fill, stroke, sloppiness, and more
- Save/open boards as a local `.json` file (`Ctrl/⌘ + S` / `O`)
- Works fully offline, boards persist across restarts

![Feature showcase](images/feature-showcase.json.png)  
*feature-showcase.json sample file*
## Getting started

Requires **Node.js 22+**.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

## Configuration

**Server** (`server/.env` — see `server/.env.example`):

| Variable          | Default     | Purpose                                        |
| ----------------- | ----------- | ----------------------------------------------- |
| `PORT`            | `1234`      | WebSocket/HTTP port                             |
| `HOST`            | `0.0.0.0`   | Bind address                                    |
| `ALLOWED_ORIGINS` | *(all)*     | Comma-separated origin allowlist                |
| `PERSISTENCE_DIR` | *(off)*     | Directory for saving boards; unset = in-memory  |

**Client** (`client/.env` — see `client/.env.example`):

| Variable      | Default             | Purpose               |
| ------------- | ------------------- | ---------------------- |
| `VITE_WS_URL` | `ws://<host>:1234`  | WebSocket server URL   |

## Keyboard shortcuts

![Keyboard shortcuts](images/keyboard-shortcuts.json.png)  
*keyboard-shortcuts.json sample file*

**Tools**

| Key | Action | &nbsp; | Key | Action |
| --- | ------ | :---: | --- | ------ |
| `V` | Select | &nbsp; | `A` | Arrow |
| `H` / hold `Space` | Pan | &nbsp; | `P` | Pen (draw) |
| `R` | Rectangle | &nbsp; | `T` | Text |
| `O` | Ellipse | &nbsp; | `N` | Sticky note |
| `L` | Line | &nbsp; | | |

**Editing**

| Key | Action | &nbsp; | Key | Action |
| --- | ------ | :---: | --- | ------ |
| `Del` / `Backspace` | Delete selection | &nbsp; | `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + C` | Copy selection | &nbsp; | `Ctrl/⌘ + Shift + Z` | Redo |
| `Ctrl/⌘ + V` | Paste at pointer | &nbsp; | `Ctrl/⌘ + ]` / `[` | Bring forward / Send backward |
| `Ctrl/⌘ + D` | Duplicate selection | &nbsp; | `Ctrl/⌘ + Shift + ]` / `[` | Bring to front / Send to back |
| `Esc` | Clear selection | &nbsp; | `Ctrl/⌘ + G` | Group selection |
| &nbsp; | &nbsp; | &nbsp; | `Ctrl/⌘ + Shift + G` | Ungroup selection |

**View**

| Key | Action | &nbsp; | Key | Action |
| --- | ------ | :---: | --- | ------ |
| `Shift + 1` | Zoom to fit | &nbsp; | `Ctrl`+scroll | Zoom |
| `Shift + 2` | Zoom to selection | &nbsp; | scroll / `Shift`+scroll | Pan / Pan horizontally |
| `Ctrl/⌘ + '` | Toggle snap to grid | &nbsp; | | |

**File**

| Key | Action | &nbsp; | Key | Action |
| --- | ------ | :---: | --- | ------ |
| `Ctrl/⌘ + S` | Save to file (reuses the last file; prompts if none) | &nbsp; | `Ctrl/⌘ + O` | Open a board file |

## License

MIT
