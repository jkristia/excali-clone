# CLAUDE.md

Real-time collaborative whiteboard (Yjs CRDT sync). See [DESIGN.md](DESIGN.md) for architecture, data model, repo layout, and extension guides. See [README.md](README.md) for product features and keyboard shortcuts.

## Commands

```bash
npm install            # install all workspaces (run once)
npm run dev            # server (:1234) + client (:5173) together via concurrently
npm run build          # tsc build server + vite build client
npm run typecheck      # both workspaces
npm start              # run built server (after build)
```

Open http://localhost:5173. `?room=<name>` = shared board (default: `default-room`).

## Conventions

- **TypeScript strict** — keep `npm run typecheck` green. `noUnusedLocals/Parameters` on the client.
- Explain *why*, not *what*. No decorative comments.
- Client: ESM `moduleResolution: bundler`. Server: ESM `NodeNext` — `.js` import specifiers required.
- Colors/spacing: plain CSS variables in `index.css`. No CSS framework.
- **Framework boundary**: only `client/src/app/` (the Angular shell) may import `@angular/*`. Everything else — `shapes/`, `tools/`, `interaction/`, `util/`, `canvas/render.ts`, `model/`, `document/canvasDocument.ts`, `state/uiStore.ts` — is framework-agnostic TypeScript, lint-enforced (`no-restricted-imports` in `client/eslint.config.js`). See [DESIGN.md](DESIGN.md) for why (the client used to be React; this discipline is what made swapping it to Angular a scoped `app/`-only rewrite).
- Client testing: `npm run test` (Vitest, core logic only) and `npm run test:e2e` (Playwright, real app) from `client/`. See DESIGN.md's "Verification / testing pattern".

## Backlog / known gaps

- No auth — server trusts any client on an allowed origin. Needs token auth + per-room ACLs before real deployment.
- Single-node — room map is in-process. Horizontal scale needs Redis pub/sub or a hosted Yjs backend.
- Tooling: Prettier not set up (ESLint, Vitest, Playwright are).
- Product: grouping, `Ctrl+D`, alignment, image shapes, PNG/SVG export, snapshot compaction, rate limiting.
