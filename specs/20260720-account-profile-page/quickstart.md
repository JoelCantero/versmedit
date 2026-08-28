# Quickstart: Validate the Account Profile Page

## Validation prerequisites

- Node.js 24 LTS and the repository-pinned pnpm version
- Docker Desktop/Engine with Compose
- Local `.env` populated from `.env.example` with valid development values
- Current branch: `20260720-account-profile-page`

## Install and Prepare

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm predev
```

`pnpm predev` starts PostgreSQL, applies existing migrations, and seeds the configured development user. This feature must not generate a migration.

## Focused Automated Validation

Run the profile and affected login/navigation unit and component tests:

```bash
pnpm exec vitest run \
  tests/unit/account-profile-schema.test.ts \
  tests/unit/account-initials.test.ts \
  tests/unit/account-action.test.ts \
  tests/unit/account-profile-form.test.tsx \
  tests/unit/account-accessibility.test.tsx \
  tests/unit/app-navigation.test.tsx \
  tests/unit/login-routes.test.tsx \
  tests/unit/login-form.test.tsx
```

Expected outcomes:

- Required/trimmed/80-character/Unicode name rules pass.
- Extra and duplicate fields reject the whole update.
- Initials use name, then email fallback.
- Pending, success, validation, persistence, focus, read-only email, active navigation, keyboard, and live-region behavior pass.
- English, Spanish, and Catalan message contracts are complete.
- Login callback validation preserves only matching localized account paths.

Run PostgreSQL integration coverage:

```bash
RUN_INTEGRATION_TESTS=true pnpm exec vitest run tests/integration/account-profile.test.ts
```

Expected outcomes:

- A real database Session selects only its associated User.
- Missing/expired sessions cannot update a user.
- Forged identity, email, image, and unknown fields persist nothing.
- Successful updates change only `name`; email/image and record counts remain unchanged.
- Validation normalization, replay, persistence failure, and last-accepted concurrent update behavior pass.

## Full Quality Gate

```bash
pnpm lint
pnpm typecheck
RUN_INTEGRATION_TESTS=true pnpm test:coverage
pnpm build
pnpm audit:prod
```

Expected outcome: all commands succeed and configured coverage thresholds remain met.

After implementation tasks are checked, run the same compliance boundary used by CI and the
registered `after_implement` hook:

```bash
bash .specify/scripts/bash/compliance-check.sh --all
```

Expected outcome: every Spec Kit feature passes and every implementation task is complete. The
registered local quality-gate hook then repeats lint, typecheck, and tests; CI independently runs
compliance, coverage, audit, build, and production E2E.

## Production-Artifact E2E

```bash
pnpm test:e2e
```

Run the existing end-to-end (E2E) harness. It starts an isolated PostgreSQL container and applies existing migrations. It then builds the standalone Next.js artifact and runs Chromium on desktop and at a 320×900 mobile viewport.

Required account scenarios:

1. Signed-out `/account`, `/es/account`, and `/ca/account` requests redirect to matching localized login pages with validated account callback paths and expose no profile data.
2. A database-backed Auth.js session opens the matching localized account page and shows the existing name, read-only email, image or fallback initials, and active Profile navigation.
3. Keyboard-only submission updates a valid name; success is announced and the value persists after reload.
4. Validation failure retains the entered value and focuses name; simulated persistence failure retains the value and submit-button focus.
5. Account navigation preserves locale in all three languages.
6. Desktop and 320 px pages have no horizontal document overflow or overlapping form/navigation content.
7. Automated axe checks report no serious or critical violations in initial, error, pending, and success states.

## Manual Visual Verification

Start the development app after `pnpm predev`:

```bash
pnpm dev
```

Review each locale in light and dark themes:

- English: `http://localhost:3000/account`
- Spanish: `http://localhost:3000/es/account`
- Catalan: `http://localhost:3000/ca/account`

Confirm:

- The page uses an unframed settings layout with no nested decorative cards or empty sections.
- Desktop navigation sits beside the form; mobile navigation sits above it.
- Long valid names, long emails, and translated text wrap without overlap or horizontal scrolling.
- Read-only email styling remains legible in both themes.
- Avatar image failure falls back cleanly to initials.

## Data and Operations Check

```bash
git diff -- prisma/schema.prisma prisma/migrations docker-compose.yml docker-compose.prod.yml .env.example
```

Expected outcome: no feature changes to schema, migrations, environment variables, containers, volumes, networks, or external services.

Do not inspect logs for user data. Tests should assert that emitted profile failure logs contain only sanitized categories/request correlation and no name, email, submitted value, or session token.

## Implementation Validation Record

Validated on 2026-07-20:

- `pnpm lint`: passed with one advisory for the intentional arbitrary-provider avatar `<img>`; no lint errors.
- `pnpm typecheck`: passed.
- `RUN_INTEGRATION_TESTS=true pnpm test:coverage`: 34 files passed, 248 tests passed, 1 skipped; 86.56% statements, 77.95% branches, 84.17% functions, and 88.48% lines.
- `pnpm build`: passed; the localized account route is emitted as a dynamic server-rendered route.
- `pnpm audit:prod`: passed with no known vulnerabilities.
- `pnpm test:e2e`: 12 standalone-production journeys passed across desktop Chromium and 320x900 Chromium, including CSP/static-asset hydration, localized redirects, database-session authentication, Enter-key update and reload, axe checks, all locales/themes, avatar failure fallback, and horizontal-overflow checks.

Visual captures for English, Spanish, and Catalan in light and dark themes were reviewed at desktop and 320x900. The unframed layout has no nested cards or empty sections; navigation moves above the form on mobile; long names, emails, and translations stay within the viewport; fallback initials render after an image failure; and no overlap or horizontal document scrolling was observed.

The final scope diff contains no changes to `prisma/schema.prisma`, `prisma/migrations/`, `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`, or infrastructure. Authentication provider configuration and sign-in semantics are unchanged; the account feature only adds the database user ID to authenticated server sessions through the existing Auth.js callback boundary.
