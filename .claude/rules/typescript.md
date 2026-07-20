# TypeScript rules

Applies to all TypeScript in this repo (client + server). Complements the conventions in [CLAUDE.md](../../CLAUDE.md) — read that for the class-only / no-module-singletons rules.

## Type safety

- Keep `npm run typecheck` green. `strict` is on in both workspaces; do not weaken `tsconfig`.
- Never use `any`. Reach for `unknown` at boundaries and narrow, or write the real type. Use `as` only when you can justify it; prefer type guards over casts.
- No non-null `!` assertions to silence the compiler — handle the `null`/`undefined` case or narrow first.
- No `@ts-ignore` / `@ts-expect-error` without a one-line comment saying why.
- Prefer `unknown` over `any` in `catch (e)`, then narrow before use.

## Style

- 4-space indent, matching existing files.
- Explicit access modifiers on class members (`public` / `private` / `protected`), as the codebase already does. `private readonly` for injected/constructed collaborators.
- Prefer `type` aliases for unions/shapes; `interface` for object contracts meant to be implemented or extended.
- Prefer `const`; use `readonly` on fields and array/tuple types that must not mutate.
- Use discriminated unions over optional-field grab-bags; exhaustively switch and rely on `noFallthroughCasesInSwitch`.
- Name things fully — no abbreviations that aren't already idiomatic in the file.

## No file-level functions

- Logic lives in a class, not in module-level `function`/`const` helpers or module-level singletons.
- A helper used by one class becomes a `private` (or `private static`) method on it.
- A helper shared by several classes becomes a method on a class in `util/`. Instantiate it where needed — only wire it through a DI token when it *must* be the same instance shared across the app (see `client/src/app/main.ts` for the singleton case).
- Test files are exempt — see the [testing rules](testing.md).

## File & class structure

- **One class per file**, ideally. A file's name should tell you the class it holds. Small, tightly-coupled helper types/interfaces may share the file.
- **Keep files under ~500 lines.** A file growing past that is a signal the class is doing too much — split responsibilities.
- **Keep methods short** — ideally readable on one screen, two at the absolute most, so you barely scroll to read the whole method. A long method usually wants to be several private methods.
- **Avoid deep nesting; prefer early returns.** Guard-clause the edge cases at the top and return, rather than wrapping the happy path in nested `if`s. Aim to keep the main flow at low indentation.

## Imports & modules

- Client: ESM, `moduleResolution: bundler` — no `.js` extension on relative imports.
- Server: ESM, `NodeNext` — relative imports **require** the `.js` specifier.
- No default exports for shared modules; prefer named exports.
- Respect the framework boundary (see the Angular rule and `no-restricted-imports` in `client/eslint.config.js`): only `client/src/app/` may import `@angular/*`.

## Async & errors

- `async`/`await` over raw `.then()` chains. Never leave a floating promise — `await` it or explicitly `void` it.
- Fail loud at boundaries; don't swallow errors into empty `catch` blocks.

## Comments

- Explain *why*, not *what*. No decorative or restating comments.
