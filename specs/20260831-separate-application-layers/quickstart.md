# Quickstart: Validate Separate Application Layers

## Prerequisites

- Node.js `>=24.15.0 <25.0.0`
- Repository-pinned pnpm 11.22.0 through Corepack
- Docker Desktop/Engine with Compose for PostgreSQL-backed integration tests
- A local `.env` populated with safe development values from `.env.example`
- Current branch: `20260831-separate-application-layers`

## Install and Inspect Framework Guidance

```bash
corepack enable
pnpm install --frozen-lockfile
rg --files node_modules/next/dist/docs | rg 'route.*handler|route-handler'
```

Read the matching installed Next.js 16.3.2 route-handler guide before implementation. Confirm that
routes remain the boundary for `Request`, `Response`, headers, cookies, and redirects. The
repository mirror at `skills/next-best-practices/route-handlers.md` is a fallback reference, not a
replacement for the installed version-specific guide.

## Prepare Generated Code and Test Database

```bash
pnpm db:generate
docker compose up -d --wait db
pnpm db:deploy
```

Expected outcomes:

- The existing Prisma client generates without a schema edit.
- Existing migrations apply with no new migration for this feature.
- PostgreSQL is available for adapter, transaction, lock, and integration tests.

## Focused Unit Validation

```bash
pnpm exec vitest run \
  tests/unit/login-service.test.ts \
  tests/unit/signup-service.test.ts \
  tests/unit/auth-route.test.ts \
  tests/unit/signup-activation-route.test.ts \
  tests/unit/account-deletion-service.test.ts \
  tests/unit/account-deletion-verify-route.test.ts \
  tests/unit/architecture-boundaries.test.ts
```

The account-deletion service and architecture-boundary files are introduced by this feature.
Required outcomes from [application-boundaries.md](contracts/application-boundaries.md):

1. Login and signup timing helpers retain the 500 ms floor, inclusive 0-100 ms jitter, injected test
   seams, and repeated remaining-time loop, but return no `Response`.
2. Login and signup routes still return exactly `{ "status": "accepted" }` after awaiting the
   timing helper on every existing accepted path.
3. Signup and deletion service tests cover unknown token, wrong purpose, unconfirmed delivery,
   expiry, invalid user, no/matching session, conflicting session, and eligible candidate.
4. Signup service tests additionally cover durable activation followed by session failure and the
   generic fallback when that exact state is not established.
5. Route tests mock domain services rather than the database and preserve malformed input,
   canonical origin, Auth.js session ordering, callback query/header composition, redirect
   allowlisting, cookie passthrough, conflict, and exception behavior.
6. The architecture test reports zero prohibited route, service, public-type, or client imports and
   permits only the exact health-route persistence exception.

## HTTP Compatibility Matrix

Use [http-compatibility.md](contracts/http-compatibility.md) as the focused route oracle. Verify all
four touched entry points:

- `POST /api/signup`
- `POST /api/auth/signin/email`
- `GET /api/signup/activate`
- `GET /api/account/deletion/verify`

Expected outcomes:

- All pre-change statuses, payloads, headers, cookies, and redirects match.
- Invalid token classes remain publicly indistinguishable.
- Invalid links do not call the Auth.js session endpoint or callback.
- Conflicting sessions do not consume tokens or invoke internal callbacks.
- Eligible callbacks retain exact request-local authorization and fixed destinations.
- Signup alone retains the `session_failed` recovery distinction after durable activation.

## Live PostgreSQL and Provider Regression

```bash
RUN_INTEGRATION_TESTS=true pnpm exec vitest run \
  tests/integration/signup-onboarding.test.ts \
  tests/integration/account-deletion-reauth.test.ts \
  tests/integration/account-deletion.test.ts \
  tests/integration/email-response-time.test.ts
```

Required outcomes from [data-model.md](data-model.md):

1. The hardened Auth.js adapter revalidates purpose, delivery, expiry, locale, and user status under
   the existing normalized-email advisory lock before exact token consumption.
2. Signup activation still atomically consumes the token, changes `PENDING` to `ACTIVE`, creates the
   existing PolicyAcceptance, and establishes the normal database session.
3. Account-deletion verification still consumes only an eligible deletion token and establishes a
   fresh session without deleting the account.
4. Existing transaction, lock, compensation, replay, and session-failure behavior is unchanged.
5. Login and signup samples still return `200 { "status": "accepted" }`, every sample takes at least
   500 ms, and the existing upper-bound tolerance remains satisfied for both configured providers.
6. Logs contain no raw token, digest, email, account identifier, session material, provider error,
   or persistence error.

## Architecture Guard Failure Check

Temporarily apply one representative prohibited dependency at a time in a disposable working copy
or test fixture, run the architecture test, and immediately discard the probe:

```bash
pnpm exec vitest run tests/unit/architecture-boundaries.test.ts
```

Each probe must fail with the violating workspace-relative path for:

1. a product route importing `@/lib/db` or `@/generated/prisma`;
2. a domain service constructing `Response` or `NextResponse`;
3. a public module `types.ts` importing persistence contracts;
4. a `"use client"` module importing a service, persistence contract, or server-only module.

The unmodified source must pass, and `src/app/api/health/route.ts` must remain the only allowed
product-route scan exception.

## Full Quality Gate

```bash
pnpm lint
pnpm typecheck
RUN_INTEGRATION_TESTS=true pnpm test:coverage
pnpm build
pnpm audit:prod
bash .specify/scripts/bash/compliance-check.sh --all
pnpm test:e2e
```

Expected outcomes:

- Every command succeeds and configured coverage thresholds remain met.
- Existing signup onboarding and account-deletion browser journeys pass with no visible change.
- No new runtime or development dependency is installed.
- SpecKit reports no unresolved marker or incomplete feature artifact.

## Scope and Operations Check

```bash
git diff -- \
  package.json \
  pnpm-lock.yaml \
  prisma/schema.prisma \
  prisma/migrations \
  src/generated \
  .env.example \
  docker-compose.yml \
  docker-compose.prod.yml \
  docker \
  .github/workflows
```

Expected outcome: no diff. This feature adds no dependency, generated-client change, schema change,
migration, environment setting, container, network, healthcheck, deployment step, or CI job.

Review the implementation diff separately and confirm:

- direct persistence imports remain only in the infrastructure health route among API routes;
- services construct no transport response;
- public `types.ts` modules import no persistence contract;
- client modules import no service, database, generated Prisma, or server-only module;
- signup/deletion routes add no new log and preserve existing sanitized logging elsewhere.
