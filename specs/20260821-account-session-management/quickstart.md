# Quickstart: Validate Active Session Management

## Prerequisites

- Node.js 24 LTS and repository-pinned pnpm 11.22.0
- Docker Desktop/Engine with Compose running
- Local `.env` populated from `.env.example` with valid development values
- Current branch: `20260821-account-session-management`

## Install and Prepare

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose up -d --wait db
pnpm db:deploy
pnpm db:generate
pnpm exec prisma validate
```

Expected outcomes:

- The forward migration commits idempotent `VerificationPurpose.ACCOUNT_SECURITY` first, then
   transactionally adds/backfills nullable immutable `Session.createdAt`, updates the
   verification-token constraint, adds the session user/expiry index, and normalizes active sessions
   deterministically.
- Accounts above 20 active sessions retain exactly their newest 20; accounts at or below 20 and
  expired retained rows are unchanged.
- Existing non-null `authenticatedAt` creation evidence is copied into `createdAt`; truly unknown
   starts remain null and display as unavailable. No selector, device, network, location, audit,
   intent, or recovery column/table is added.
- No new package, environment variable, service, network, port, volume, cache, queue, or worker is
  required.

## Focused Unit and Component Validation

```bash
pnpm exec vitest run \
  tests/unit/account-security-schema.test.ts \
  tests/unit/account-security-routes.test.ts \
  tests/unit/account-security-session.test.ts \
  tests/unit/account-security-dialog.test.tsx \
  tests/unit/account-security-page.test.tsx \
  tests/unit/account-security-deploy.test.ts \
   tests/unit/e2e-authenticated-user.test.ts \
  tests/unit/account-messages.test.ts \
  tests/unit/auth-adapter.test.ts
```

Expected outcomes from [data-model.md](./data-model.md),
[account-security.openapi.yaml](./contracts/account-security.openapi.yaml), and
[ui-state-machine.md](./contracts/ui-state-machine.md):

1. Strict schemas reject unknown/duplicate fields, wrong action markers, session credentials,
   identity/ownership claims, malformed selectors, and invalid locales.
2. Supported cookie names resolve one exact current active session; missing, expired, revoked, and
   inactive-account sessions fail closed, and null/future/older-than-10-minute evidence is stale.
3. The adapter uses one user advisory lock, explicit `createdAt` null-first oldest ordering, one
   captured time for new `createdAt`/`authenticatedAt`, pre-insert eviction, and transaction rollback
   without calling the unhardened creator.
4. Security routes map canonical-origin, CSRF, authentication, stale-auth, provider, rate-limit,
   completed/no-op, transaction-failure, and callback outcomes to the documented generic contract;
   callback success updates one existing session and never creates a session/cookie.
   Top-level callback GETs succeed without an HTTP `Origin` header when their effective URL is
   canonical, and return `421` for mismatched effective scheme/host/port.
5. Current is pinned, other rows use immutable `createdAt` newest-first order, only-current disables
   bulk, mutable `authenticatedAt` never renders, and no forbidden metadata/visible selector appears.
6. Dialog initial/restored/error focus, Escape/cancel, pending lockout, status/alert announcements,
   and lost-response refresh match the UI state machine.
7. English, Spanish, and Catalan contracts contain navigation, list, timestamp/unavailable,
   confirmation, reauthentication, pending, recovery, success, and generic error copy.
8. The versioned deploy workflow asserts prebuild before downtime and stop/wait before synchronous
   migration and force-created new-app startup; command failure leaves the app stopped and no legacy
   writer can run during normalization.

## Live PostgreSQL, Migration, and Provider Integration

```bash
RUN_INTEGRATION_TESTS=true pnpm exec vitest run \
  tests/integration/account-security-migration.test.ts \
  tests/integration/account-security-reauth.test.ts \
  tests/integration/account-security.test.ts
```

Required outcomes:

1. A schema-isolated upgrade seeds accounts with 0, 20, and more than 20 active rows plus expired
   rows, null/equal start times, and deterministic IDs. The migration copies only known pre-feature
   creation evidence, preserves exactly the expected newest 20 per over-cap account, and leaves
   every other fixture unchanged.
2. The migration exposes the new enum branch, check constraint, and index. A failure injected after
   enum commit rolls back the constraint, index, and every normalization deletion; Prisma resolution
   plus the idempotent enum statement permits a safe retry or corrective forward migration.
3. Sequential and concurrent creates at 19/20 sessions never exceed 20; each creation commits with
   its own new row active and revokes the null-first, earliest-`createdAt`, stable-ID prior row. A
   later creation may evict an earlier new row only when it has become that later request's oldest
   prior row.
4. A failed session insert rolls its tentative eviction back. Expired rows consume no slot, while a
   defensive pre-existing over-cap state is reduced to 19 before the new row is inserted.
5. Security reauthentication derives recipient from the exact current session, enforces the
   5-per-client and shared 3-per-address limits, and stores only one delivered `ACCOUNT_SECURITY`
   credential. Provider rejection compensates the exact provisional token and changes no session.
6. Valid same-device and already-authenticated same-account cross-device links are single-use and
   locale-preserving. Token consumption and updating only the callback browser's exact existing
   session `authenticatedAt` commit together while `createdAt` stays unchanged; no session/cookie is
   created or revoked. With exactly 20 active rows, identities/count/access remain unchanged.
   Malformed, expired, replayed,
   wrong-purpose, superseded, signed-out, expired-session, and conflicting-account callbacks update
   nothing and do not consume an otherwise valid credential presented by an ineligible browser.
7. Individual revocation removes only an owned non-current target. Missing, expired, current,
   foreign, and already-revoked selectors converge on the same completed no-op and reveal no state.
8. Bulk revocation preserves the exact locked confirming session and removes all others, including
   one committed before the bulk lock; a creation committed after bulk completion remains valid.
9. Null/stale/future authentication, invalid CSRF/origin, inactive account, and revoked current
   session change nothing. Failure injected before commit rolls individual and bulk mutations back.
10. Concurrent individual, bulk, creation, and replay cases serialize to a permitted session set;
    the confirming current session is never removed and revoked access fails its next authorization.
11. The only feature-owned structured field is one fixed sanitized outcome category; this feature
   adds no aggregate counter. Logs contain no operation argument, duration, retry value, name, email,
   account/session ID, selector, token, cookie, link, IP, user agent, database detail, request body,
   or provider payload; response headers and test-side timers verify retry/latency behavior.

## Full Quality Gate

```bash
pnpm lint
pnpm typecheck
RUN_INTEGRATION_TESTS=true pnpm test:coverage
pnpm build
pnpm audit:prod
```

Expected outcome: every command succeeds, configured coverage thresholds remain met, and the build
contains protected localized Security pages plus same-origin account-security handlers.

After implementation tasks are complete, run SpecKit compliance:

```bash
bash .specify/scripts/bash/compliance-check.sh --all
```

Expected outcome: every feature artifact validates and every implementation task is checked. The
registered `after_implement` hooks then run compliance and the local quality gate; CI repeats the
authoritative checks.

## Production-Artifact E2E

```bash
pnpm test:e2e
```

The existing harness starts isolated PostgreSQL and controlled HTTP email-provider fixtures,
applies migrations, builds the standalone artifact, and runs desktop Chromium plus 320 x 900 mobile.

Required journeys:

1. Signed-out Security routes enter matching localized login destinations and expose no session
   projection; Account navigation preserves locale and marks Profile/Data & Privacy/Security.
2. Separate browser contexts create current, selected-other, and additional sessions. The list pins
   current, localizes known/null immutable start times, omits mutable freshness/forbidden metadata,
   and revokes only the selected other context on its next protected request.
3. The bulk review changes nothing on open/cancel. A session created while it is open but before
   confirmation is removed; only the confirming browser remains authorized after commit.
4. Current-row revocation is absent and existing sign-out remains available. With only current
   active, the localized empty state appears and bulk is unavailable.
5. Stale/null evidence requests a security-specific email. Delivery failure remains retryable;
   same-device and already-authenticated same-account cross-device links refresh only the consuming
   session and return to a refreshed list with no dialog/selection. At 20 sessions no row disappears.
   Signed-out, expired-session, invalid, reused, and conflicting links remain generic and change
   nothing.
6. An aborted individual or bulk response is allowed to commit server-side, causes one authoritative
   Security refresh, emits a generic recovery announcement, and causes no second mutation POST.
7. All confirmation, pending, error, callback, recovered, and current-only states pass keyboard and
   focus assertions plus axe with zero serious/critical violations.
8. All three locales, light/dark themes, desktop, and the maximum 20 rows at 320 px have no overlap,
   clipped control, hidden timestamp, obscured focus, or horizontal document overflow.
9. Rendered/final URLs, page text/markup, HTTP bodies, and collected logs expose no credential,
   link, identity, selector, network metadata, or inferred device information. The controlled
   provider fixture alone captures the intentionally delivered inbound credential URL; callback
   `Location`, application logs, and browser destination never repeat its token.

## ARM64 Performance Gate

Run this opt-in cohort on the target Raspberry Pi through the standalone production-artifact E2E
harness:

```bash
RUN_ACCOUNT_SECURITY_PERF=true pnpm test:e2e
```

`tests/e2e/account-security.performance.spec.ts` remains skipped during ordinary E2E. When enabled,
it records only non-identifying environment/build metadata, seeds outside each timer, performs 10
warm-ups and 100 measured individual confirmations plus the same bulk cohort, and measures from
confirm activation until the authoritative list or generic recoverable error is visible. It reports
separate nearest-rank p50/p95/maximum values; both p95 cohorts must remain below 2 seconds. Fresh
email delivery is outside this latency gate.

## Deployment Rollout Drill

The first deployment containing this migration intentionally trades a brief maintenance window for
the immediate account-wide cap. In a staging copy of the production topology, verify the versioned
workflow performs this order:

```bash
set -Eeuo pipefail
docker compose -f docker-compose.prod.yml build app migrate
docker compose -f docker-compose.prod.yml up -d --wait db
docker compose -f docker-compose.prod.yml stop app
docker compose -f docker-compose.prod.yml rm -f migrate
docker compose -f docker-compose.prod.yml run --rm --no-deps migrate
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate --remove-orphans app
```

The workflow run block is fail-fast. Therefore, a non-zero stop/migration command prevents the
start command and leaves the legacy app stopped for forward repair.

1. Build the new `app` and `migrate` images while the old app remains healthy.
2. Stop and wait for the old `app`; confirm no application writer remains.
3. Run the new one-shot migrator synchronously. On injected migration failure, keep `app` stopped,
   retain the complete pre-normalization rows, and surface the failed deployment.
4. On success, start only the new app image and wait for its existing healthcheck.
5. Confirm an aggregate query finds no account above 20 active sessions, then create sessions
   concurrently through supported authentication and confirm the maximum remains 20.
6. Re-run the workflow and verify migration/deploy outcome is reproducible. Do not recreate any
   session removed by normalization during application rollback or restore rehearsal.

The drill needs no external port, host path, manual database edit, or unversioned command. A disaster
restore must apply all migrations and cap normalization before traffic resumes.

## Manual Visual and Assistive Verification

After database preparation, start the app without rerunning setup:

```bash
pnpm exec next dev
```

Review light/dark themes at desktop and 320 x 900:

- English: `http://localhost:3000/account/security`
- Spanish: `http://localhost:3000/es/account/security`
- Catalan: `http://localhost:3000/ca/account/security`

Confirm the account layout remains unframed, 20 rows scan clearly without fabricated device labels,
dates and long translations wrap, dialog actions remain reachable, pending labels cause no layout
shift, and visible focus meets contrast requirements. Use macOS VoiceOver to confirm navigation,
current/other distinction, generic ordinals, dates/unavailable values, consequences, progress,
errors, refreshed state, and focus movement are announced in the contract order.

## Post-Release Representative Usability Measurement

After release and separately from implementation/merge gates, recruit at least 20 target
participants, with English, Spanish, Catalan, mobile, and desktop represented. Without a feature
walkthrough, ask each participant to find Security, identify the exact current session, and revoke
one seeded other session. Pause timing during fresh-email delivery; otherwise stop at 2 minutes.

Record only aggregate completion counts, locale/viewport totals, timing distribution, and
non-identifying defect notes in
`specs/20260821-account-session-management/usability-results.md`. The KPI is met when at least 90%
correctly identify current and complete the revocation on their first attempt within the allowed
time.

## Data and Operations Check

```bash
git diff -- \
  prisma/schema.prisma \
  prisma/migrations \
  .github/workflows/deploy.yml \
  docker-compose.yml \
  docker-compose.prod.yml \
  .env.example \
  scripts/test-e2e.sh
```

Expected outcome:

- Persisted-data changes are limited to the canonical Prisma enum/nullable `Session.createdAt`/index
   and one forward migration.
- The deploy workflow contains the explicit build/quiesce/migrate/start ordering; Compose topology
  remains unchanged.
- The E2E harness changes only to select the opt-in account-security performance cohort and to
   assign deterministic per-context client identifiers while trusted proxy parsing is enabled only
   inside the isolated harness.
- No secret/configuration, service, port, network, volume, protected schema, worker, queue, cache,
  session-history record, device/network/location metadata, or recovery mechanism is introduced.
