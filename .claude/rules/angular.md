# Angular rules

Angular 20, standalone components, signals-era. Only `client/src/app/` may import `@angular/*` — everything else stays framework-agnostic (lint-enforced via `no-restricted-imports`). See [CLAUDE.md](../../CLAUDE.md) and [DESIGN.md](../../docs/DESIGN.md) for why.

## Components

- **Standalone only** — `standalone: true`, list deps in `imports:`. No `NgModule`s.
- Use `inject()` for dependencies (as `app.component.ts` does), not constructor parameter injection, unless a constructor body genuinely needs the value.
- Wire framework-agnostic singletons through the DI tokens in `app/di-tokens.ts` — do not `new` them inside components ad hoc when a token exists.
- One component per file; keep templates in `.html` and styles in `.scss` via `templateUrl`/`styleUrl` (matching existing components). Inline templates only for trivial markup.
- `selector` prefixed `app-`. `changeDetection: ChangeDetectionStrategy.OnPush` for new components unless there's a reason not to.

## State & reactivity

- Prefer **signals** (`signal`, `computed`, `effect`) for local/component state over manual `Subject`/`BehaviorSubject` plumbing.
- Keep real domain state in the framework-agnostic stores (`state/uiStore.ts`, `document/`) and expose it to components through DI tokens — components are thin.
- Unsubscribe / tear down in `ngOnDestroy` (or use `takeUntilDestroyed`). Remove any `window`/global listeners you add, as `AppComponent` does.

## Templates

- Use the built-in control flow (`@if`, `@for`, `@switch`) over the legacy `*ngIf` / `*ngFor` structural directives. Always give `@for` a `track`.
- `strictTemplates` is on — keep template expressions typed; no implicit `any` in the template.
- Bind, don't manipulate the DOM directly. Reach for `Renderer2` / `ElementRef` only when there's no declarative option.

## Boundaries

- Business logic, geometry, shapes, tools, model, and canvas rendering do **not** import `@angular/*`. If a component grows logic, push it down into the framework-agnostic layer and inject it back.
- Keep the shell thin: `app/` orchestrates; it should not own algorithms.

## Style

- 4-space indent; explicit `public`/`private readonly` member modifiers, matching existing components.
