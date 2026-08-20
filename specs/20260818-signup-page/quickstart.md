# Quickstart: Validate Signup Page

This guide validates the feature end to end without duplicating implementation details. The expected
data transitions are defined in [data-model.md](./data-model.md); public request and response shapes
are defined in [contracts/openapi.yaml](./contracts/openapi.yaml).

## Prerequisites

- Node.js 24 LTS and pnpm 11.22.0.
- Docker with Compose.
- Existing local development environment values, including `AUTH_SECRET`.
- User-authorized development dummy English, Spanish, and Catalan Terms and Privacy Notice content,
  stable `2026-08-18-draft` Terms and Privacy version identifiers, and the corresponding
  application-local policy destinations. The content must remain visibly labeled as an unreviewed
  development draft and must not be represented as legal advice.
- For live manual email delivery only: configured SMTP values. Automated tests start and stop their
  controlled local SMTP fixture and must not use production credentials.

## Prepare a Fresh Database

```bash
pnpm install --frozen-lockfile
docker compose up -d --wait db
pnpm db:generate
pnpm db:deploy
```

Expected outcome:

- Prisma Client generation succeeds.
- All migrations apply from an empty database.
- Existing users in an upgrade fixture are `ACTIVE` with unique normalized addresses.
- The migration aborts before uniqueness enforcement if an upgrade fixture contains normalized-email
  collisions; it does not choose or merge accounts automatically.
- No policy acceptance is fabricated for a legacy user.

## Run Focused Automated Checks

Run the form, schema, route, adapter, localization, and accessibility slice:

```bash
pnpm exec vitest run tests/unit/signup-schema.test.ts \
  tests/unit/signup-form.test.tsx \
  tests/unit/signup-accessibility.test.tsx \
  tests/unit/signup-route.test.ts \
  tests/unit/signup-activation-route.test.ts \
  tests/unit/signup-messages.test.ts
```

Run the real PostgreSQL lifecycle, controlled SMTP transport, and Auth.js session boundary:

```bash
RUN_INTEGRATION_TESTS=true pnpm exec vitest run tests/integration/signup-onboarding.test.ts \
  tests/integration/magic-link-login.test.ts
```

Run the production standalone browser journey:

```bash
pnpm test:e2e
```

Expected outcome: every command exits successfully. Test fixtures use unique account identifiers,
clean up users, sessions, tokens, acceptances, and limiter rows, and close the local SMTP server.

## Required Validation Scenarios

### 1. Localized Public Form

Visit `/signup`, `/es/signup`, and `/ca/signup`.

Verify:

- Each page uses its route language and established login-card visual language.
- Name, email, and one unchecked native combined policy checkbox are present.
- Terms and Privacy links open the current localized application pages.
- Login remains a separate localized action.
- An authenticated user is redirected to the corresponding localized home page.

### 2. Validation, CSRF, and Exact Shape

Verify automated cases for empty/invalid/overlong names, malformed or overlong emails, unchecked
acceptance, invalid locale, missing/invalid CSRF, malformed JSON, and additional properties.

Expected outcome:

- The client allowance is consumed first.
- No address allowance, account lookup, account mutation, token, acceptance, or email occurs unless
  CSRF and the complete exact body are valid.
- Focus moves to the first invalid control and the localized message is announced.
- Client-supplied policy versions or timestamps are rejected as additional properties.

### 3. Uniform New, Pending, and Active Outcomes

Submit matched valid requests for an unused address, a retained pending address, and an active
address under a controlled clock.

Expected outcome:

- All three return the same `200` status, exact `{ "status": "accepted" }` body, navigation, and
  request-start-relative 500 ms plus selected 0-100 ms minimum floor.
- New and pending addresses receive onboarding mail; the active address receives only the private
  localized login notice.
- Active account profile, status, acceptance, sessions, and tokens remain unchanged.

### 4. Newest Link and Candidate Snapshot

Submit two valid pending-account requests with different valid names/locales while policy versions
are controlled.

Expected outcome:

- One pending user exists.
- Only the second token remains usable.
- The second token owns the authoritative candidate name, locale, Terms version, Privacy version,
  and server-recorded acceptance time.
- Opening the first link reaches the generic localized invalid-link state.

### 5. Activation and Immediate Session

Open the newest link with no current session.

Expected outcome:

- One transaction consumes the signup token, changes the user from `PENDING` to `ACTIVE`, applies
  the token's name, sets verification time, and inserts one immutable acceptance.
- NextAuth creates the normal database session and secure cookie.
- The browser reaches the matching localized home page without a second login step.
- Replaying the link cannot authenticate again.

### 6. Concurrency and Commit Order

Run simultaneous first signup, pending resubmission, signup-versus-activation, and duplicate token
consumption cases against PostgreSQL.

Expected outcome:

- At most one user exists for the normalized address.
- The last signup committed while still pending owns the only valid link and snapshot.
- If activation commits first, the later signup follows the active-account notice path and cannot
  alter the account.
- If replacement signup commits first, the old activation fails generically.
- At most one concurrent token use activates and creates a session.

### 7. Delivery and Provider Failures

Use controlled SMTP outcomes for accepted delivery, isolated recipient rejection, timeout/provider-
wide failure, and failed active-account notice.

Expected outcome:

- A known shared outage returns the same `503 unavailable` response and `Retry-After` before account
  mutation for every account state.
- Isolated failures retain the generic accepted public response.
- Failed onboarding delivery leaves no usable credential, attempts exact-token cleanup, restores no
  predecessor, and retains a reusable pending user even if cleanup also fails.
- Failed active-account notice creates no token, session, acceptance, or account change.
- Logs contain no recipient, name, token, URL, account identifier, acceptance value, or session data.

### 8. Existing Session and Session Failure

Open a valid onboarding link while another user is authenticated, then separately inject session
creation failure after successful activation.

Expected outcome:

- A different session is preserved; the pending account and token are unchanged; localized guidance
  tells the user to sign out and reopen the email link.
- After successful activation followed by session failure, the account and acceptance remain active,
  the link remains consumed, no replacement credential is sent, and localized ordinary login is
  offered.

### 9. Login Regression

Exercise known and unknown addresses through `/api/auth/signin/email` and attempt a signup token
directly against the generic callback.

Expected outcome:

- Existing active-user login still issues and consumes its newest link normally.
- Unknown and pending addresses create no login token, user, or session.
- Generic callbacks cannot create a user or consume/activate a signup-purpose token without the
  dedicated activation context.

### 10. Accessibility and Responsive Layout

Use keyboard-only interaction and axe on all three localized routes. Measure at 375x667 and
1440x900 in both supported appearances with long valid content.

Expected outcome:

- Explicit labels/descriptions, native checkbox semantics, visible focus, logical tab order, and
  at least 24x24 CSS-pixel targets are present.
- Validation and service states use appropriate live-region urgency and first-invalid focus.
- There are no serious or critical axe violations.
- `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, every required
  control stays in the viewport, and the reserved status/error regions do not change dimensions.

## Verified Operational Outcomes (2026-08-18)

The following checks were executed locally with disposable PostgreSQL schemas or an isolated
Compose project; no production or development data was modified:

- `tests/integration/signup-migration.test.ts`: 4/4 passed. This covered a fresh schema, legacy user
  and login-token backfill, normalized-email collision abort before lifecycle changes, default
  `LOGIN` token purpose, and zero fabricated legacy policy acceptances.
- Fresh isolated migration deploy: all four repository migrations applied successfully to an empty
  PostgreSQL database, including `20260818000000_add_signup_lifecycle`.
- Logical backup and clean restore: `scripts/db-backup.sh` produced a portable compressed SQL dump;
  the isolated database and volume were removed and recreated; `scripts/db-restore.sh` restored into
  the empty database in one transaction.
- Restored lifecycle verification: the seeded active status and both `2026-08-18-draft` policy
  version values matched exactly after restore. A subsequent `prisma migrate deploy` reported no
  pending migrations.
- Restored-database recovery checks: `tests/integration/signup-onboarding.test.ts` passed 14/14 and
  `tests/integration/magic-link-login.test.ts` passed 6/6 against the restored database, including
  signup retry/failure behavior and active-user login regression coverage.
- Cleanup completed: the isolated Compose project, volume, and temporary backup directory were
  removed after verification.

## Verified Convergence Outcomes (2026-08-19)

- Fresh production-artifact deployment applied all five migrations, including
  `20260819000000_add_signup_delivery_confirmation`.
- The focused unit command collected 6 files and passed 86/86 tests; the focused integration command
  collected 2 files and passed 20/20 tests without running unrelated suites.
- The full integration-enabled coverage gate passed 398 tests with 1 intentional skip across 48
  files. Coverage remained at 90.51% statements, 82.99% branches, 90.58% functions, and 92.25%
  lines.
- The production Playwright gate passed 14 tests with no project-specific skips. EN/ES/CA each
  completed an accessible keyboard submission; every required signup state was checked in light and
  dark appearances at 375x667 and 1440x900; the real SMTP/Auth.js activation journey remained intact.

## Full Pre-PR Gate

```bash
pnpm lint
pnpm typecheck
pnpm audit:prod
RUN_INTEGRATION_TESTS=true pnpm test:coverage
pnpm test:e2e
docker build --target runner --tag versmedit-signup:latest --file docker/Dockerfile .
docker build --target migrator --tag versmedit-signup-migrate:latest --file docker/Dockerfile .
```

After implementation, the mandatory SpecKit compliance and quality hooks must also pass. CI remains
the authoritative merge gate.