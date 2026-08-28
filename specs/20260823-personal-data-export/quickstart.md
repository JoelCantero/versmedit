# Quickstart: Validate Personal Data Export

## Validation prerequisites

- Node.js 24 LTS and repository-pinned pnpm 11.22.0
- Docker Desktop/Engine with Compose running
- Local `.env` populated from `.env.example` with valid development values
- A controlled Brevo or Mailjet fixture configuration for automated email tests; no live recipient
  is required
- Current branch: `20260823-personal-data-export`

Read [data-model.md](./data-model.md),
[personal-data-export.openapi.yaml](./contracts/personal-data-export.openapi.yaml),
[personal-data-export.schema.json](./contracts/personal-data-export.schema.json),
[contributor-contract.md](./contracts/contributor-contract.md), and
[ui-state-machine.md](./contracts/ui-state-machine.md) before implementation validation.

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

- One additive migration introduces `VerificationPurpose.ACCOUNT_DATA_EXPORT`, the
  `DataExportAuthorization` table, its Session cascade, and expiry index.
- Existing Users, Sessions, Accounts, tokens, policy acceptances, and rate-limit buckets remain
  unchanged; existing Sessions have no export authorization.
- The generated client exposes the new enum branch and one-to-one optional Session relation.
- No export file/job/history/audit table, new service, worker, queue, cache, volume, port, package,
  object storage, or protected-schema mirror appears.
- `.env.example`, production Compose configuration, and deploy workflow expose validated
  non-sensitive `ACCOUNT_DATA_EXPORT_MAX_BYTES=26214400` and
  `ACCOUNT_DATA_EXPORT_TIMEOUT_MS=30000` defaults. No credential or feature-enablement secret is
  added.

## Focused Unit and Component Validation

```bash
pnpm exec vitest run \
  tests/unit/personal-data-export-schema.test.ts \
  tests/unit/personal-data-export-token.test.ts \
  tests/unit/personal-data-export-registry.test.ts \
  tests/unit/personal-data-export-serializer.test.ts \
  tests/unit/personal-data-export-contributors.test.ts \
  tests/unit/personal-data-export-routes.test.ts \
  tests/unit/personal-data-export-panel.test.tsx \
  tests/unit/personal-data-export-email.test.ts \
  tests/unit/account-messages.test.ts \
  tests/unit/auth-adapter.test.ts
```

Required outcomes:

1. Strict request/download schemas accept only CSRF proof and `en`, `es`, or `ca`; callback accepts
   only a 43-character Base64URL credential plus supported locale. Unknown/duplicate fields and all
   identity, Session, authorization, contributor, filename, scope, and limit claims reject.
2. Purpose-isolated digest helpers never match LOGIN, SIGNUP, ACCOUNT_DELETION, or ACCOUNT_SECURITY;
   callbacks create no Auth.js Session/cookie and never update `authenticatedAt`.
3. Registry construction rejects missing, extra, duplicate, invalid, or mismatched declarations and
   contributors. A fixture product contributor is injected only at the composition root; framework
   core has no product import.
4. Empty results remain explicit included sections, allowlisted expected conditions become
   unavailable entries, and throws/timeouts/invalid JSON/undeclared reasons fail the complete
   envelope.
5. Canonical serialization recursively sorts objects, enforces contributor array order, keeps
   envelope/section versions independent, produces byte-identical output for one fixture snapshot,
   measures UTF-8 bytes, and rejects forbidden or cyclic/non-finite/non-JSON values.
6. Built-in projections contain only allowlisted profile, provider-summary, policy-acceptance, and
   active-session values. IDs, provider-account identifiers, credentials, rate-limit/grant data,
   network/device/request metadata, and diagnostics are absent.
7. Route mappings, no-store/nosniff/attachment headers, non-identifying filename, generic errors,
   `Retry-After`, canonical-origin checks, Referrer Policy, and no-partial-response behavior match
   the OpenAPI contract.
8. Panel states, explicit activation, pending lockout, countdown/expiry, announcement cadence,
   focus movement, and no automatic request/download retry match the UI state machine.
9. English, Spanish, and Catalan catalogs contain complete panel, warning, email, confirmation,
   download, expiry, wait, success, and generic failure copy with no exposed identity.
10. Log assertions allow fixed outcome and duration only; they find no email, IDs, tokens/digests,
   cookies, links, URLs, body values, byte/section/retry values, namespace values, filenames,
   payloads, or internal errors.

## Live PostgreSQL and Provider Integration

```bash
RUN_INTEGRATION_TESTS=true pnpm exec vitest run \
  tests/integration/personal-data-export-migration.test.ts \
  tests/integration/personal-data-export-authorization.test.ts \
  tests/integration/personal-data-export-generation.test.ts
```

Required outcomes:

1. Migration from the pre-feature schema preserves every existing fixture and creates only the enum
   value/table/index/relation. Reapplying deployment is safe; the previous compatible application
   can ignore the additive schema.
2. Request derives recipient from the exact active Session owner. Provider rejection/timeout deletes
   only the exact provisional token and preserves a prior delivered export link. Accepted concurrent
   finalizations serialize so one delivered export credential remains without affecting other
   purposes.
3. The request boundary enforces 5/trusted-client before account work and 3/normalized-account before
   credential/provider work in a 15-minute window. Two app instances admit at most those limits and
   every excess attempt reports a generic remaining wait with zero protected work.
4. Confirmation enforces 5/trusted-client before token hash/lookup. Valid same-account confirmation
   atomically consumes exactly one delivered token and upserts a grant for the consuming exact
   Session until the token's original expiry.
5. Same-account other-Session confirmation grants only that other Session. Signed-out,
   expired/revoked/conflicting Session, malformed, expired, replayed, superseded, wrong-purpose,
   wrong-locale, and injected transaction failure create no grant/session/cookie, update no
   freshness, and preserve any otherwise valid token when the grant transaction does not commit.
6. Deleting/revoking the Session cascades its grant. Session/token/grant boundary timestamps prove
   strict expiry without extension; stale retained rows never authorize and bounded cleanup does not
   affect correctness.
7. Generation enforces 3/exact-active-Session in a 15-minute window before contributors. Concurrent
   requests across two app instances admit at most three; successful generation leaves the grant
   reusable but counts each explicit attempt.
8. All contributors receive one User ID, exact current Session ID, database transaction timestamp,
   read-only REPEATABLE READ transaction client, and deadline signal. A concurrent committed update
   cannot produce a mixed snapshot.
9. Failure at each contributor/validation/serialization/transaction stage returns no attachment,
   leaves no persisted payload, and invokes no later contributor. Explicit empty and declared
   unavailable fixtures retain their distinct contract outcomes.
10. Completed payloads at or below 26,214,400 UTF-8 bytes may succeed; one byte over fails. Work below
    30,000 ms may succeed; active timeout/statement/cancellation boundaries fail generically. Repeat
    the matrix with one validated application-specific byte/time configuration.
11. Fixture-product inclusion, section-version-only evolution, new-section evolution, and an
    incompatible envelope fixture satisfy the version compatibility contract.
12. A forbidden-field/content scanner and captured logs find zero credentials, internal IDs,
    network/device/request values, payload fragments, namespace values, or operational details.

## Full Quality Gate

```bash
pnpm lint
pnpm typecheck
RUN_INTEGRATION_TESTS=true pnpm test:coverage
pnpm build
pnpm audit:prod
```

Expected outcome: every command succeeds, configured coverage thresholds remain met, and the
standalone build contains localized protected Data & Privacy UI plus the three same-origin handlers.

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

The repository harness starts isolated PostgreSQL and a controlled real HTTP email-provider
fixture, applies migrations, builds the standalone artifact, and runs Chromium at 1440 x 900 plus
the feature's 375 x 667 mobile project. The implementation extends the harness without making an
external provider request or printing an email credential.

Required journeys:

1. Signed-out English, Spanish, and Catalan Data & Privacy routes enter exact localized login
   destinations. Authenticated pages show the unframed export section before deletion and preserve
   existing navigation/theme behavior.
2. Request is explicit, sends no export data, derives the account email server-side, and produces a
   complete localized fixture-provider message. Provider failure remains generic/retryable and does
   not supersede a prior accepted credential.
3. Same-Session and already-authenticated same-account other-Session contexts consume the link and
   expose Download data only in the consuming context. The requesting and third Sessions receive no
   grant. No callback creates a Session or changes general freshness.
4. Signed-out, expired/revoked Session, conflicting account, malformed, expired, superseded,
   wrong-purpose, replayed, cross-origin, and rate-limited links converge on generic credential-free
   localized destinations and create no file/privilege/state disclosure.
5. Browser current/history URLs, callback Location/Referer, page markup, console, network artifacts,
   and application logs contain no credential after callback processing. Only the controlled email
   fixture observes the intentionally delivered inbound URL.
6. Explicit Download returns one valid canonical UTF-8 JSON attachment with manifest, built-ins,
   exact account values, correct classifications/versions/order, safe filename, Content-Length,
   no-store/private, no-cache, and nosniff. No forbidden field/content or retained server copy
   exists.
7. Empty and declared unavailable sections serialize distinctly. Contributor throw, mixed-snapshot
   fixture, size breach, timeout, transaction failure, and response-construction failure show a
   generic retryable state and deliver zero attachment bytes.
8. Losing the completed download response sends no automatic second generation. One explicit retry
   before grant expiry generates a new snapshot and consumes another rate-limit allowance.
9. Countdown exposes the remaining original credential window, announces without per-second noise,
   removes Download at zero, and server expiry wins over a skewed client clock. Revoking the Session
   removes access immediately.
10. Exact request/account/confirmation/generation limits are shared across two application instances;
    each excess attempt has `Retry-After`, generic copy, and zero downstream protected work.
11. Keyboard-only flow, focus transitions, pending lockout, status/alert semantics, and axe checks
    pass every visible state with zero serious/critical violations.
12. All locales and light/dark themes at 375 x 667 and 1440 x 900 show no untranslated text,
    clipping, overlap, obscured focus, content collision, or horizontal document overflow.

## ARM64 Performance Gate

Run this opt-in cohort only on the target Raspberry Pi through the standalone production-artifact
E2E harness:

```bash
RUN_PERSONAL_DATA_EXPORT_PERF=true pnpm test:e2e
```

`tests/e2e/personal-data-export.performance.spec.ts` skips during ordinary E2E runs. When enabled,
it:

1. Requires Linux ARM64 and records only Pi model, architecture, OS, standalone artifact identifier,
   application commit, active byte/time limits, and database image; no hostname, address, account,
   Session, namespace, filename, or payload is reported.
2. Seeds the built-in framework dataset and exact active authorized Session outside each timer. It
   uses no email delivery, product fixture, network dependency, or size/timeout boundary fixture.
3. Performs 10 untimed warm-ups followed by 100 sequential measured explicit generations, resetting
   only operation-specific generation buckets outside each measured attempt while retaining the
   same valid authorization/snapshot shape.
4. Starts timing immediately before Download data activation and stops only after the browser has
   received and validated the complete attachment headers and bytes.
5. Sorts all 100 values and reports nearest-rank p50, p95 (`ceil(0.95 * 100)`), maximum, payload bytes,
   and failures. It discards/retries no measured result.
6. Requires p95 below 2 seconds and every attempt below the hard active 30-second default. Any
   failure, partial response, schema mismatch, forbidden field, or retained server copy fails the
   cohort.

A derived application repeats this capacity cohort after adding material contributors or changing
`ACCOUNT_DATA_EXPORT_MAX_BYTES`/`ACCOUNT_DATA_EXPORT_TIMEOUT_MS`.

## Migration and Recovery Drill

Perform this only against the disposable E2E/staging database, never the working development or
production database.

1. Start the pre-feature application/schema, seed active/expired Sessions plus every existing token
   purpose and rate-limit type, and create a logical backup with the existing backup script.
2. Deploy the new migration, generate the Prisma client, and run the migration integration suite.
   Confirm all seeded rows are byte/value equivalent and all existing flows still pass.
3. Authorize two exact Sessions, then revoke one and advance database time beyond the other's grant
   expiry. Confirm neither stale/cascaded authorization can invoke a contributor even if physical
   cleanup has not run.
4. Simulate application rollback by running the last compatible pre-feature artifact against the
   additive schema. Confirm ordinary authentication/account flows ignore the enum branch/table. Do
   not drop the enum value/table during normal rollback.
5. Simulate migration failure in a schema-isolated database. Confirm the migration either commits
   its additive state or leaves a forward-correctable state; deploy a corrected forward migration
   before traffic rather than editing the database manually.
6. Restore the pre-feature logical backup into a fresh empty disposable database with
   `pnpm db:restore:dev <backup-file>`, apply all migrations, and confirm the feature starts with no
   grants while existing account data remains valid.
7. Back up and restore a post-feature database. Confirm authorization rows restore through ordinary
   logical backup but are still rejected by Session/expiry checks; no generated payload, file,
   history, queue entry, or special recovery object is present.

The deployment requires no maintenance window because the schema is additive. If the new
application is faulty, roll back the application and fix forward. If backup restoration is needed,
restore into a fresh database, apply every migration, and resume traffic only after focused
integration checks pass.

## Manual Visual, Accessibility, and Localization Check

After database preparation, start the app without rerunning setup:

```bash
pnpm exec next dev
```

Review light/dark themes and reduced-motion preference at 375 x 667 and 1440 x 900:

- English: `http://localhost:3000/account/data`
- Spanish: `http://localhost:3000/es/account/data`
- Catalan: `http://localhost:3000/ca/account/data`

Confirm the export/deletion sections are sibling unframed regions; warnings and longest translations
wrap; controls/statuses retain stable dimensions; no nested card, overlap, clipping, content
collision, horizontal overflow, or obscured focus appears. Use keyboard-only interaction and macOS
VoiceOver to verify section/action names, sensitivity warning, pending status, sent/ready/downloaded
announcements, rate/error alerts, expiry warning, and focus transfer when Download disappears. No
ordinary countdown tick should announce or move focus.

Inspect the controlled email fixture in all locales for subject, text, HTML, 15-minute expiry,
same-account active-Session warning, safe HTTPS link, and no export content. Keep credentials out of
screenshots, traces, videos, console output, and issue attachments.

## Post-Release Representative Usability Measurement

This is a post-release outcome measurement, not a merge gate. Recruit at least 20 representative
participants so the 95% target is measurable, with English, Spanish, Catalan, mobile, desktop, and
assistive-technology users represented. Provide a disposable seeded account but no feature
walkthrough. Ask each participant to find Data & Privacy, request the export, follow the received
email, download the JSON, and identify where the file was saved.

Start the five-minute timer when the controlled mailbox receives the message, not when request
delivery starts. Record only aggregate completion counts, locale/viewport/assistive-technology
totals, completion-time distribution, and non-identifying defect categories in
`specs/20260823-personal-data-export/usability-results.md`. The target passes when at least 95% finish
the complete first-attempt journey within five minutes after receipt.

## Data and Operations Check

```bash
git diff -- \
  prisma/schema.prisma \
  prisma/migrations \
  .env.example \
  .github/workflows/deploy.yml \
  docker-compose.yml \
  docker-compose.prod.yml \
  scripts/test-e2e.sh \
  src/generated/protected \
  worker
```

Expected outcome:

- Persisted changes are limited to the canonical enum/relation/new authorization table and one
  additive forward migration.
- Deployment wiring adds only the two non-sensitive byte/time settings with validated defaults.
- E2E harness changes only select the opt-in export performance cohort and, where required, provide
  deterministic trusted-client identities inside the isolated test environment.
- No package, public endpoint/service, container, port, network, volume, host path, cache, queue,
  worker, export storage, protected-schema mirror, credential, user/session tracker, or backup format
  is introduced.
- Structured log tests, controlled provider capture, attachment scanning, and storage inspection
   prove no sensitive export/token/identity data is retained or emitted.
