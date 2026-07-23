# Realtime Collaborative Whiteboard

A hobby project — basically an Excalidraw clone where multiple people can draw on the same board at the same time and see each other's cursors live. Built mostly with Claude Opus.

![alt text](images/app.png)

Edits sync in real time using [Yjs](https://yjs.dev), so people can draw at the same time (even offline) without stepping on each other's changes.

## Features

- Real-time multi-user editing, low latency
- See everyone's cursor, name, and selection live
- Works offline, syncs back up when you reconnect
- Tools: select, pan, rectangle, ellipse, line, arrow, freehand pen, text, sticky notes
- Infinite canvas with pan & zoom
- Undo/redo (only undoes your own edits)
- Copy/paste shapes (pastes at the pointer)
- Save/open boards as a local `.json` file (menu, or `Ctrl/⌘ + S` / `O`)
- Boards can persist across server restarts

For how it's built under the hood, see [DESIGN.md](docs/DESIGN.md).

## Getting started

Requires **Node.js 22+**.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. By default (no room), the board is **local to your browser** — nothing is shared. Changes persist in the browser (and sync live across your own open tabs), and you can save/open boards as a `.json` file.

To collaborate, add a room: `?room=team-standup`. Anyone who opens the same URL — another tab, device, or person — sees and edits the same board live, with cursors and presence.

### Individual commands

```bash
npm run dev:server   # websocket server only
npm run dev:client   # vite dev server only
npm run build        # type-check + build both packages
npm run typecheck    # type-check both packages
npm start            # run the built server (after npm run build)
```

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
