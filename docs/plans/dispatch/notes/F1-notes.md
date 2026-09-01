# Goal F1 Notes — Monorepo Skeleton

## Overview & What Exists

The npm-workspaces monorepo skeleton has been created at the root of `action-amp`:

- **Workspaces Scope**: Confined strictly to `apps/*` and `packages/*`.
  - `webapp/`, `cli/`, and `admin-cli/` remain completely independent with their own isolated dependencies and configurations.
- **Packages & Apps**:
  - `apps/web`: Placeholder package (`@actionamp/web`) with TypeScript configuration pointing to `tsconfig.base.json`. SvelteKit scaffold is deferred to Goal F9 (no `sv create` executed).
  - `apps/api`: Placeholder package (`@actionamp/api`) with TypeScript configuration pointing to `tsconfig.base.json`. Backend framework decision is deferred to Goal F7 / scaffolded in F8.
  - `packages/domain`: Core domain logic package (`@actionamp/domain`) with Vitest test runner configuration and a working smoke test suite (`smoke.test.ts`).
  - `packages/contract`: Shared API contract types package (`@actionamp/contract`) with TypeScript configuration pointing to `tsconfig.base.json`.
- **Root Configuration**:
  - `package.json`: Configured with workspaces (`apps/*`, `packages/*`), root scripts (`dev`, `build`, `test`, `lint`, `typecheck`), and root devDependencies (`oxlint`, `vitest`, `typescript`, `@types/node`).
  - `tsconfig.base.json`: Base TypeScript configuration shared across the workspaces (`ES2022`, `NodeNext`, strict mode, declaration generation).
  - `.gitignore`: Updated with `dist/` ignore rule.

## How to Run the Scripts

From the repository root:

- **Install dependencies**:
  ```bash
  npm install
  ```
- **Run tests**:
  ```bash
  npm test
  # or specifically in domain:
  npm test --workspace=@actionamp/domain
  ```
- **Typecheck across all packages**:
  ```bash
  npm run typecheck
  ```
- **Lint**:
  ```bash
  npm run lint
  ```
- **Build**:
  ```bash
  npm run build
  ```
- **Dev**:
  ```bash
  npm run dev
  ```

## Verification Results

- `npm install`: Clean installation with zero vulnerabilities.
- `npm test`: Runs Vitest across workspaces; `@actionamp/domain` smoke test passes cleanly.
- `npm run typecheck`: Runs `tsc --noEmit` across all workspaces (`api`, `web`, `contract`, `domain`); all pass without errors.
- `npm run lint`: `oxlint apps packages` runs clean with 0 warnings / errors.
- `npm run build`: `tsc` / echo scripts execute and complete successfully.
- Independent surfaces check: `webapp/`, `cli/`, `admin-cli/`, `spikes/` are untouched.

## Notes & Observations

- Nothing surprising. Standard npm workspaces setup with TypeScript NodeNext module resolution.

## Review verdict (Zcode review, 2026-09-01)

```text
REVIEW: F1 · author Gemini/capable · reviewer ZCode (Z.AI)/capable
verdict: pass
notes: gates re-run by reviewer — install (0 vulns), test (1/1 green),
typecheck (all workspaces), lint (oxlint, 0 warnings) all pass. Scope
verified: workspaces = apps/* + packages/* only; webapp/cli/admin-cli
untouched. No fixes needed.
```
