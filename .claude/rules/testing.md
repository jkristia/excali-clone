# Testing rules

Client: Vitest (`npm run test`, core logic only) + Playwright (`npm run test:e2e`, real app), both from `client/`. See docs/DESIGN.md's "Verification / testing pattern".

## Coverage

- Every **pure-logic class** (framework-agnostic code in `shapes/`, `tools/`, `interaction/`, `util/`, `model/`, `canvas/render.ts`, `document/`, `state/`) has a corresponding unit test file (`*.test.ts`) next to it.
- Test the class through its public API; don't reach into privates.

## Helpers

- File-level `function` helpers **are allowed in `*.test.ts` files** — the no-file-level-functions rule does not apply to tests.
- But the moment a helper is useful to more than one test file, move it to a **shared test util** and import it from there.
- **A test file must never import a helper from another test file.** If two specs need the same factory/helper, it belongs in a shared util, not in one spec importing the other.

## Mocks & fakes

- If something is mocked or faked, write a **reusable mock/fake class** and share it. Do not re-implement the same mock inline in multiple spec files.
- Keep shared mocks and factories in a dedicated test-support location (e.g. a `test-support/` / `testing/` folder or a `*.mock.ts` file), not scattered per spec.
