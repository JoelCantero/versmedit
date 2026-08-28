# Quickstart: Validate the TypeScript 6 Upgrade

**Feature**: [TypeScript 6 Upgrade](spec.md)

## Validation prerequisites

- Node.js `>=24.15.0 <25.0.0`
- Corepack enabled; `package.json` selects pnpm 11.22.0
- Docker with BuildKit available for the final image checks
- The existing local test environment and non-committed environment values required by database, build, and E2E commands
- A clean feature worktree except for the intended migration files

Never print `.env` or secret values while collecting validation evidence.

## 1. Confirm the Dependency State

Run from the repository root after implementation:

```bash
corepack pnpm install --frozen-lockfile
node -p "require('./package.json').devDependencies.typescript"
corepack pnpm exec tsc --version
corepack pnpm why typescript
```

Expected outcomes:

- The declared range is `~6.0.2`.
- The project-local compiler reports TypeScript 6.0.x.
- No resolved root compiler is 6.1 or later.
- Installation and peer resolution report no TypeScript compatibility conflict.

## 2. Confirm Configuration Safeguards

```bash
grep -q '"dom.iterable"' tsconfig.json
! grep -Eq '"(types|rootDir|ignoreDeprecations|stableTypeOrdering)"' tsconfig.json
! grep -q 'ignoreBuildErrors' next.config.ts
corepack pnpm lint
corepack pnpm typecheck
```

Expected outcomes:

- `dom.iterable`, strict type checking, no emit, and bundler resolution remain present.
- No speculative global type list, source root, deprecation suppression, permanent migration flag, or build-error bypass is added.
- Existing lint and type checks pass without policy changes.

If implementation discovers a reproducible need for explicit `types`, document that evidence in the pull request and update this check to assert the reviewed minimal list. The isolated planning probe passed without it, so an unexplained addition is a failure.

## 3. Run the Full Application Gate

Use the existing local environment without exposing its values:

```bash
corepack pnpm db:generate
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm audit:prod
bash .specify/scripts/bash/compliance-check.sh --all
corepack pnpm test:coverage
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm exec playwright test --config emails/playwright.config.ts
```

Where the CI test database is available, also run the migration step used by the authoritative PR workflow:

```bash
corepack pnpm db:deploy
```

Expected outcomes:

- Every command exits successfully.
- Coverage thresholds remain satisfied.
- Production and email-preview browser journeys report no behavior regression.
- No command requires a lint, type, audit, compliance, or test suppression.

## 4. Build the Deployment Targets

```bash
docker build --target runner --tag "${PROJECT_NAME}-ts6-ci:latest" --file docker/Dockerfile .
docker build --target migrator --tag "${PROJECT_NAME}-ts6-migrate-ci:latest" --file docker/Dockerfile .
```

Expected outcomes:

- Both images build successfully from the same frozen dependency graph.
- No Dockerfile, runtime image, service, port, network, volume, or secret change is needed for the migration.

## 5. Review Scope and Lockfile Churn

```bash
git diff --check
git diff -- package.json pnpm-lock.yaml tsconfig.json next.config.ts eslint.config.mjs
git status --short
```

Review the output and confirm:

- `package.json` changes only the TypeScript range.
- `pnpm-lock.yaml` changes only TypeScript resolution and unavoidable TypeScript-qualified peer snapshots.
- ESLint, Next.js, React, Prisma, Node.js, and pnpm versions do not move.
- `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, source, and tests remain unchanged unless a documented TS 6 diagnostic required a minimal correction.
- `.specify/templates/overrides/plan-template.md` reports TypeScript 6.0.x.
- No pre-existing feature under `specs/**` is rewritten to update its historical compiler reference.

## 6. Recovery Check

If an in-scope correction cannot make every gate pass, revert the compiler declaration, lockfile, template update, and compiler-specific corrections together. Reinstall with the restored frozen lockfile and rerun the baseline lint and typecheck. No database or persistent-data recovery action is required.