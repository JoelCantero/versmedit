# Research: TypeScript 6 Upgrade

**Date**: 2026-08-26

**Feature**: [TypeScript 6 Upgrade](spec.md)

## Decision 1: Use the 6.0 Patch Line

**Decision**: Declare the root development dependency as `typescript: "~6.0.2"` and resolve TypeScript 6.0.2 initially.

**Rationale**: Registry metadata confirms TypeScript 6.0.2 supports the project's Node.js 24 runtime. `typescript-eslint` 8.67.0 accepts TypeScript `>=4.8.4 <6.1.0`, while Prisma 7.9.1 accepts TypeScript `>=5.4.0`. The tilde range permits compatible 6.0 patches without crossing the lint parser's upper bound.

**Alternatives considered**:

- `^6.0.2`: rejected because it can admit TypeScript 6.1, outside the current `typescript-eslint` peer range.
- Exact `6.0.2`: rejected because the issue explicitly allows compatible 6.0 patch fixes while preventing minor-version drift.
- TypeScript 7 or a native compiler alias: rejected as a separate, larger migration outside this feature.

## Decision 2: Preserve the Current Lint Baseline

**Decision**: Keep ESLint 9.39.4, `eslint-config-next` 16.3.2, `typescript-eslint` 8.67.0, `core-web-vitals`, and the TypeScript preset unchanged.

**Rationale**: The feature branch was created after the dependency baseline advanced from `eslint-config-next` 16.3.1 to 16.3.2. Preserving 16.3.2 matches the issue's intent to retain the current lint stack; downgrading to the stale issue version would be an unrelated regression. The lockfile confirms that all TypeScript ESLint packages use the same `<6.1.0` peer boundary.

**Alternatives considered**:

- Downgrade `eslint-config-next` to 16.3.1: rejected because it reverses an already merged baseline update.
- Upgrade or replace lint tooling: rejected because compatibility is already established and lint-policy changes are explicitly out of scope.

## Decision 3: Keep `tsconfig.json` Unchanged Initially

**Decision**: Start the implementation with the existing `tsconfig.json`. Do not add `types`, `rootDir`, `ignoreDeprecations`, or persistent `stableTypeOrdering`; retain `dom.iterable` and all current strict/no-output settings.

**Rationale**: TypeScript 6 changes the implicit `types` default to `[]`, changes the default source root, folds iterable DOM declarations into `dom`, and offers `stableTypeOrdering` for migration diagnostics. Despite those changes, an isolated TypeScript 6.0.2 invocation completed successfully against the complete current project with `--noEmit --incremental false`. This includes application, tests, configuration, scripts, and generated Next.js type locations selected by the current config. There is therefore no evidence that explicit Node globals or a source root are needed. Keeping `dom.iterable` avoids unrelated cleanup.

**Alternatives considered**:

- Add `types: ["node"]` preemptively: rejected because the complete TS 6 probe passes and a restrictive list can hide other ambient types.
- Add `rootDir`: rejected because the project uses `noEmit` and intentionally checks files across application, test, and configuration areas.
- Remove `dom.iterable`: rejected as unrelated cleanup even though TS 6 makes it redundant.
- Persist `stableTypeOrdering`: rejected because it is a temporary TS 7 preparation aid, not a runtime or correctness requirement.

## Decision 4: Let Next.js Use the Project Compiler

**Decision**: Make no Next.js TypeScript configuration change. Validate both standalone `tsc` and `next build` with the upgraded local compiler.

**Rationale**: The versioned Next.js 16.3.2 documentation states that Next uses the project-local `tsc` CLI by default and checks the complete project selected by `tsconfig.json`. The project does not set `typescript.ignoreBuildErrors`, so production builds continue to fail on type errors instead of bypassing them.

**Alternatives considered**:

- Set `ignoreBuildErrors`: rejected because it would bypass the compiler and violate the constitution and specification.
- Add a separate build-only `tsconfig`: rejected because the shared configuration is currently green and the feature requires full-project coverage.
- Enable TypeScript 7 CLI settings: rejected as outside scope.

## Decision 5: Regenerate the Lockfile Narrowly

**Decision**: Use Corepack with the pinned pnpm 11.22.0 to change only the TypeScript development dependency and regenerate the lockfile, then review every manifest and lockfile hunk before continuing.

**Rationale**: The current lockfile resolves TypeScript 5.9.3 through many peer snapshots. Moving the root compiler necessarily rewrites those TypeScript-qualified snapshot keys, but fixed pnpm plus a current lockfile avoids unrelated package resolution. A frozen reinstall is the reproducibility proof.

**Alternatives considered**:

- Manually edit lockfile entries: rejected because it risks an internally inconsistent dependency graph.
- Run a broad dependency update: rejected because it can move unrelated direct and transitive packages.
- Accept unrelated lockfile churn: rejected by FR-002, FR-016, and SC-005.

## Decision 6: Correct Diagnostics Minimally

**Decision**: After the manifest and lockfile change, rerun TypeScript 6 before editing configuration or source. If new diagnostics appear, make the smallest explicit type correction at the reported site and add or adjust a focused regression test only when observable behavior could change.

**Rationale**: The isolated probe currently reports no diagnostics, so source changes are not expected. Requiring a reproducible error before editing prevents speculative refactors and keeps any correction traceable to the compiler migration.

**Alternatives considered**:

- Refactor nearby code while resolving diagnostics: rejected as unrelated scope and harder to review.
- Suppress diagnostics or weaken strictness: rejected because it removes the migration's quality value.
- Skip behavior verification for source changes: rejected because type-driven edits can still alter runtime behavior.

## Decision 7: Use the Existing Delivery Matrix as the Contract

**Decision**: Require the issue's full command matrix plus current CI-only checks, the production build, and both Docker targets. Do not add a new test framework or a feature-specific external contract.

**Rationale**: This change affects compiler interpretation across all TypeScript surfaces, so existing unit, integration, E2E, email-catalog, build, audit, compliance, database-generation, and image-build checks provide broader evidence than a synthetic compiler-only test. The feature changes no API, CLI, schema, event, file format, or user interface, so a `contracts/` artifact would invent an interface that does not exist.

**Alternatives considered**:

- Validate only `pnpm typecheck`: rejected because Next.js build, Prisma generation, tests, and Docker stages also consume the dependency graph.
- Add a dedicated application test for the compiler version: rejected because manifest, version, frozen-install, and CI checks directly verify the migration without production code.
- Create an interface contract document: rejected because no external interface changes.

## Sources

- [TypeScript 6.0 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html)
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md` from installed Next.js 16.3.2
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/typescript.md` from installed Next.js 16.3.2
- Registry metadata for TypeScript 6.0.2, `@typescript-eslint/typescript-estree` 8.67.0, and Prisma 7.9.1 queried on 2026-08-26
- Project `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `.github/workflows/ci.yml`, and `docker/Dockerfile`

## Research Outcome

All technical-context questions are resolved. No open research questions remain.

## Implementation Evidence

### Pre-Migration Baseline (2026-08-26)

- Node.js: 24.16.0 (within the declared `>=24.15.0 <25.0.0` range)
- pnpm: 11.22.0 through Corepack (matches `packageManager`)
- Project-local TypeScript: 5.9.3
- `pnpm lint`: passed with the existing ESLint configuration
- `pnpm typecheck`: passed with the existing `tsconfig.json`

This baseline was captured before editing `package.json` or `pnpm-lock.yaml` and is the comparison point for the TypeScript 6 migration.

### Compiler Migration Result (2026-08-26)

- Declared range: `~6.0.2`
- Resolved project-local compiler: TypeScript 6.0.3
- Frozen installation: passed with one TypeScript version and no peer conflict
- Lint: passed with ESLint 9.39.4, `eslint-config-next` 16.3.2, and `typescript-eslint` 8.67.0 unchanged
- Full-project typecheck: passed with no TypeScript 6 diagnostic
- Migration paths at this checkpoint: `package.json` and `pnpm-lock.yaml` only

`compilerOptions.types` remains omitted. TypeScript 6.0.3 successfully checks every application, test, email, script, and configuration file selected by the existing `tsconfig.json`, so there is no evidence that an explicit `types: ["node"]` list is required. Adding it would unnecessarily restrict ambient type discovery. No source, test, or TypeScript configuration correction was needed.

### Final Compatibility and Delivery Result (2026-08-26)

- Peer compatibility: the frozen pnpm 11.22.0 install resolved one TypeScript version, 6.0.3, with no peer conflict. This remains below the `typescript-eslint` 8.67.0 upper bound of 6.1.0 and within Prisma 7.9.1's supported range.
- Static safeguards: lint and the full-project typecheck passed with the existing ESLint, Next.js, and TypeScript configuration unchanged.
- Generation and persistence: Prisma Client generation passed, all eight existing migrations were current, and no schema or migration changed.
- Supply chain: the production dependency audit reported no known vulnerability at the high-or-critical failure level.
- Automated tests: unit and integration coverage passed against an isolated migrated database at 89.09% statements, 84.25% branches, 90.16% functions, and 91.72% lines.
- Production build: Next.js 16.3.2 compiled the standalone application and completed its TypeScript check without `ignoreBuildErrors` or another bypass.
- Browser behavior: all 72 production-artifact E2E tests and all four isolated email-preview catalogue tests passed.
- Deployment artifacts: the CI-equivalent Docker builds passed for both the `runner` and `migrator` targets without a Docker, Compose, runtime, network, volume, port, or secret change.
- Scope: all 74 removed and 74 added lockfile lines normalize to the TypeScript range, resolved version, integrity, and TypeScript-qualified peer snapshots. No historical plan, application source, test, email, Prisma, workflow, or deployment file changed.

### Final Changed-File Set

- `package.json`: TypeScript declaration only, from `^5` to `~6.0.2`.
- `pnpm-lock.yaml`: TypeScript 6.0.3 resolution and unavoidable TypeScript-qualified peer snapshots only.
- `.specify/templates/overrides/plan-template.md`: future-plan baseline only, from TypeScript 5.x to TypeScript 6.0.x.
- `specs/20260826-typescript-6-upgrade/`: the new specification, checklist, plan, research, data model, quickstart, and task evidence for this feature.

The final global-type decision is to leave `compilerOptions.types` absent. The complete compiler, build, test, and image matrix provides no reproducible need for an explicit list, and `tsconfig.json` remains unchanged.