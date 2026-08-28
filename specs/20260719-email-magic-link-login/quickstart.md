# Quickstart: Validate Email Magic Link Login

## Validation prerequisites

- Node.js 24 LTS and pnpm 11
- Docker Compose
- Local `.env` with valid development database, `AUTH_SECRET` (32+ characters), canonical
  `NEXTAUTH_URL`, and SMTP settings when manually exercising real delivery

Postmark SMTP uses `SMTP_HOST=smtp.postmarkapp.com`, `SMTP_PORT=587`, `SMTP_SECURE=false` for
STARTTLS, provider-issued SMTP credentials in `SMTP_USER`/`SMTP_PASSWORD`, and a sender-signature or
domain-verified address in `SMTP_FROM`. Store credentials as secrets; the host, port, secure flag,
and sender address are non-sensitive.
- Feature implementation completed from this plan; no schema migration is expected

## Install and Prepare

```bash
pnpm install
docker compose up -d --wait db
pnpm db:deploy
pnpm db:generate
```

During implementation, install the required visual baseline once:

```bash
pnpm dlx shadcn@4.13.1 add login-03
pnpm add -D axe-core
```

Review generated changes and retain only primitives used by the adapted email-only login. Do not keep
password, social-provider, name, or registration controls from the source block.

## Focused Automated Validation

### Component, Validation, and Accessibility

```bash
pnpm exec vitest run \
  tests/unit/login-accessibility.test.tsx \
  tests/unit/login-form.test.tsx \
  tests/unit/login-routes.test.tsx \
  tests/unit/login-service.test.ts \
  tests/unit/provider-availability.test.ts
```

Expected outcomes:

- invalid email is announced and no request is sent;
- pending disables duplicate submission and is announced;
- accepted known/unknown payloads render the exact same locale-specific generic message;
- `429` honors `Retry-After`; `503` renders unavailable state;
- initial, pending, accepted, invalid-email, invalid-request, limited, unavailable, and generic
  invalid-link DOM states pass `axe-core` checks;
- keyboard focus remains visible/logical and reserved status space avoids layout replacement.

### Route, Adapter, CSRF, and Redirect Behavior

```bash
pnpm exec vitest run \
  tests/unit/auth-csrf.test.ts \
  tests/unit/auth-route.test.ts \
  tests/unit/auth-adapter.test.ts \
  tests/unit/auth.test.ts \
  tests/unit/verification-context.test.ts \
  tests/unit/proxy.test.ts \
  tests/unit/request-context.test.ts
```

Expected outcomes:

- malformed CSRF is rejected before lookup for every email and still consumes the client limit;
- every server request consumes the client limit before CSRF/email validation, while only valid
  normalized email consumes the address limit;
- known and unknown accepted responses have identical status/body/headers;
- under a controlled clock, known, unknown, delivered, and isolated-failure accepted paths do not
  return before the request-start-relative 500 ms plus selected 0–100 ms jitter floor; processing
  that exceeds 600 ms remains valid;
- provider-wide cooldown is shared; isolated delivery failure remains publicly accepted;
- callback paths cannot escape `NEXTAUTH_URL` and preserve `en`, `es`, or `ca`;
- adapter refuses user creation and serializes newest-token replacement.

### PostgreSQL Integration Flow

```bash
RUN_INTEGRATION_TESTS=true pnpm exec vitest run \
  tests/integration/database.test.ts \
  tests/integration/magic-link-login.test.ts
```

Expected outcomes:

1. Seeded existing user, including a fixture whose stored email contains uppercase characters,
   receives one 15-minute token through case-insensitive lookup and the controlled Nodemailer transport,
   consumes it once through the callback, receives a session, and lands on the locale home.
2. Unknown valid email receives the exact accepted public response and creates no `User` or
   `VerificationToken`.
3. Concurrent/new issuance leaves only the newest token valid; concurrent callback use succeeds once.
4. Isolated failed delivery removes the exact new token and does not restore its predecessor.
5. The sixth client request and fourth normalized-address request receive `429` with `Retry-After`.
6. English, Spanish, and Catalan callback destinations remain same-origin and localized.

The integration test must delete its users, sessions, tokens, limit buckets, and provider marker in
cleanup so reruns are deterministic.

Local implementation note (2026-07-19): the Compose-managed volume on this workstation had stale
credentials, so validation used a disposable PostgreSQL 17 container on an alternate local port.
All seven database and magic-link integration cases passed against the migrated isolated database;
the container was removed afterward without modifying the existing local volume.

## Repository Gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

Expected outcome: all commands exit successfully. The existing production-artifact smoke remains a
repository/CI gate, but this feature adds no new E2E test and does not use `pnpm test:e2e` as feature
acceptance evidence.

## Manual Localized UI Check

Start the application with the prepared database and SMTP configuration:

```bash
pnpm dev
```

Open `/login`, `/es/login`, and `/ca/login` at the canonical local origin. At 375×667 and 1440×900,
confirm one email field, localized text, visible keyboard focus, stable status space, disabled pending
submit, exact generic confirmation, no horizontal overflow, and no registration/password/social
controls. Confirm `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
every required control remains inside the viewport, and the reserved status region keeps the same
dimensions across initial, pending, accepted, invalid, limited, and unavailable states. Verify that
a stale CSRF token renders invalid-request rather than unavailable. Consume a
real development link and confirm redirection to `/`, `/es`, or `/ca` respectively; reuse it and
confirm the same generic invalid-link presentation used for every rejected callback reason.

Do not record email addresses, email bodies, tokens, verification URLs, cookies, or SMTP credentials
when capturing validation output.