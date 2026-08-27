# Quickstart: Validate Permanent Account Deletion

## Validation prerequisites

- Node.js 24 LTS and repository-pinned pnpm 11.22.0
- Docker Desktop/Engine with Compose running
- Local `.env` populated from `.env.example` with valid development values
- Current branch: `20260820-account-deletion`

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

- The additive account-deletion authentication migration applies successfully.
- `VerificationPurpose.ACCOUNT_DELETION` and nullable `Session.authenticatedAt` generate from the
  canonical schema.
- Existing Session rows remain valid for ordinary use but have null recent-auth evidence until a
  new authentication creates a fresh session.
- No deletion/recovery ledger, tombstone, protected-schema relation, or new service is created.

## Focused Unit and Component Validation

```bash
pnpm exec vitest run \
  tests/unit/account-deletion-schema.test.ts \
  tests/unit/account-deletion-dialog.test.tsx \
  tests/unit/account-deletion-routes.test.ts \
  tests/unit/account-deletion-cookie.test.ts \
  tests/unit/account-messages.test.ts \
  tests/unit/auth-adapter.test.ts
```

Expected outcomes:

- Strict requests reject unknown/duplicate fields and never accept email, user ID, session token,
  ownership, or authorization from the client.
- First activation changes no data; Cancel, Escape, and close restore focus.
- Initial focus is Cancel; pending states block duplicates/dismissal; progress and errors use the
  correct live regions and focus targets.
- Session timestamps, token purpose isolation, exact localized callbacks, CSRF failures, cookie
  expiry variants, and browser-signal expiry pass.
- English, Spanish, and Catalan message contracts include page, dialog, email, error, progress, and
  public confirmation states.

## Live PostgreSQL and Provider Integration

```bash
RUN_INTEGRATION_TESTS=true pnpm exec vitest run \
  tests/integration/account-deletion-reauth.test.ts \
  tests/integration/account-deletion.test.ts
```

Required outcomes from [data-model.md](./data-model.md) and
[account-deletion.openapi.yaml](./contracts/account-deletion.openapi.yaml):

1. Reauthentication derives recipient from the exact session and creates only one delivered
   `ACCOUNT_DELETION` token per normalized email.
2. Provider rejection compensates the exact provisional token, leaves the dialog-retry contract
   possible, and changes no User or Session row.
3. Direct, wrong-purpose, expired, consumed, and conflicting-session callbacks create no session;
   valid same-device and cross-device callbacks create a session with fresh `authenticatedAt`.
4. Null, expired, stale, forged, and revoked sessions cannot delete an account.
5. Reauthentication and final deletion each enforce a separate 5-per-15-minute client bucket;
   reauthentication also enforces the shared 3-per-15-minute address bucket. Exhaustion returns
   generic `429` plus `Retry-After` before provider delivery or the deletion transaction.
6. A successful transaction removes User, Account, every Session, PolicyAcceptance, every
   VerificationToken for the normalized email, and the exact address rate-limit bucket while
   retaining both deletion client buckets and all global/provider buckets.
7. Failure injected at each deletion stage rolls the whole transaction back and preserves every
   pre-existing targeted row.
8. Two requests authorized before the lock race perform one physical deletion and both receive the
   generic completed outcome; a request begun after revocation is unauthenticated.
9. Session/token creation racing deletion cannot leave an attributable row after commit.
10. Sanitized logs contain category, duration, and retry metadata only, with no email, IDs, tokens,
    cookies, body values, or database error details.

## Full Quality Gate

```bash
pnpm lint
pnpm typecheck
RUN_INTEGRATION_TESTS=true pnpm test:coverage
pnpm build
pnpm audit:prod
```

Expected outcome: every command succeeds, configured coverage thresholds remain met, and the build
contains localized dynamic Data & Privacy and public completion routes.

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

The repository harness starts an isolated PostgreSQL container and real HTTP email-provider
fixture, applies migrations, builds the standalone artifact, and runs desktop Chromium plus the
320 x 900 mobile project.

Required journeys from [ui-state-machine.md](./contracts/ui-state-machine.md):

1. Signed-out localized Data & Privacy routes redirect to matching login destinations and expose no
   account data; the public completion routes remain directly accessible and generic.
2. Authenticated navigation exposes Profile/Data & Privacy, with correct active semantics and
   locale preservation.
3. First click opens the dialog with all consequences and zero database changes; every cancellation
   method preserves the account and restores focus.
4. A stale/null authentication timestamp requests a deletion-specific link. Provider failure keeps
   the dialog open and retryable; accepted delivery uses complete localized email copy.
5. Separate browser contexts consume the link, restore the localized dialog, and require a second
   explicit confirmation. Expired/reused/conflicting links remain generic.
6. Successful deletion clears the initiating cookie, revokes a second device on its next
   authorization check, invalidates pending links, and reaches the localized public result.
7. Simulated transaction failure leaves the full account usable and produces an announced generic
   retryable error.
8. The final response is aborted after the server commits; recovery waits for connectivity, checks
   session once, sends no second deletion POST, and reaches generic completion. If the server did
   not commit and the session remains valid, recovery shows retryable error instead of false success.
9. Axe reports zero serious/critical violations in all dialog/result states; keyboard-only flow,
   initial/restored/error focus, Escape, pending lockout, and announcements match the contract.
10. All three locales, light/dark themes, desktop, and 320 px mobile have no overlap, clipped action,
    obscured focus, or horizontal document overflow with longest translated content.
11. Exhausting either operation-specific client limit, or the additional address limit for
    reauthentication, produces the generic retryable state with `Retry-After` and no expensive work.

## ARM64 Performance Gate

Run this opt-in cohort only on the target Raspberry Pi through the standalone production-artifact
E2E harness:

```bash
RUN_ACCOUNT_DELETION_PERF=true pnpm test:e2e
```

`tests/e2e/account-deletion.performance.spec.ts` skips during ordinary E2E runs. When enabled, it:

1. Records the Pi model, CPU architecture, OS, standalone artifact identifier, application commit,
   and database image without hostnames, addresses, or account data.
2. Seeds each iteration outside the timer with one active User, two Accounts, three Sessions
   including the exact recent session, one PolicyAcceptance, LOGIN/SIGNUP/ACCOUNT_DELETION tokens,
   the exact address bucket, and the applicable client bucket.
3. Runs 10 untimed warm-ups and 100 measured confirmations that commit, then repeats 10 warm-ups and
   100 measurements with an isolated database failure that forces complete rollback.
4. Starts timing immediately before activating Permanently delete account and stops when the public
   completion heading or generic retryable error is visible. Email delivery is not exercised.
5. Sorts each cohort and calculates nearest-rank p95 as element `ceil(0.95 * 100)`, reporting p50,
   p95, and maximum separately. Both p95 values must be below 2 seconds.
6. Removes the temporary failure injection and all retained rollback fixtures after the cohort.

## Manual Visual and Assistive Verification

After database preparation, start the app without rerunning setup:

```bash
pnpm exec next dev
```

Review in light/dark themes and at desktop plus 320 x 900:

- English: `http://localhost:3000/account/data`
- Spanish: `http://localhost:3000/es/account/data`
- Catalan: `http://localhost:3000/ca/account/data`

Confirm the settings layout stays unframed, the destructive section is visually distinct, the
dialog never nests cards, long translations scroll/wrap without hiding actions, visible focus meets
contrast requirements, and reduced-motion preference removes non-essential transition. Use macOS
VoiceOver to confirm title, consequences, pending status, errors, and public result are announced in
the expected order.

## Post-Release Representative Usability Measurement

After release and separately from implementation and merge gates, recruit at least 20 target
participants, with at least 5 completing the first-attempt script in each of English, Spanish, and
Catalan and with both mobile and desktop represented. Do not provide a feature walkthrough. Ask each
participant to find Data & Privacy, explain the consequences before confirmation, then either
complete deletion with a disposable seeded account or safely abandon it. Pause timing during email
delivery; otherwise stop at 3 minutes.

Record only aggregate counts, locale/viewport totals, completion-time distribution, and
non-identifying defect notes in `specs/20260820-account-deletion/usability-results.md`. The KPI
target is met only when at least 90% identify both irreversibility and all-device sign-out and at
least 90% complete or safely abandon the flow on their first attempt within 3 minutes.

## Data and Operations Check

```bash
git diff -- \
  prisma/schema.prisma \
  prisma/migrations \
  docker-compose.yml \
  docker-compose.prod.yml \
  .env.example \
  src/generated/protected \
  worker
```

Expected outcome:

- Only the canonical Prisma schema and one additive migration change among persisted data files.
- No environment variable, container, network, volume, protected schema, recovery envelope, backup
  workflow, or deletion worker is added or modified for the request path.
- Application rollback never claims to restore a successfully deleted account.
- Log tests, rather than manual inspection of user events, prove deletion output remains sanitized.