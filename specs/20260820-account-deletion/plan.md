# Implementation Plan: Permanent Account Deletion

**Branch**: `20260820-account-deletion` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/20260820-account-deletion/spec.md`

**Note**: This template is filled in by the `/speckit-plan` skill; its definition describes the execution workflow.

## Summary

Add a protected, localized Data & Privacy page where the current account holder can request fresh
email authentication when necessary and permanently delete the account after a separate accessible
confirmation. Extend the canonical Prisma schema with a deletion-specific verification purpose and
a nullable authentication timestamp on database sessions; existing sessions with no timestamp
must reauthenticate. Issue and compensate deletion verification tokens through the existing HTTP
email boundary, then delegate valid callbacks to Auth.js so same-device and cross-device flows
receive a normal database session. Execute final deletion synchronously in one bounded Prisma
transaction that derives identity from the session cookie, coordinates concurrent auth activity,
explicitly removes restricted and email-keyed records, deletes the user, and lets existing foreign
key cascades revoke every session and identity. Return a generic API result that expires Auth.js
session cookies; a non-identifying, 10-minute browser signal recovers a lost response without
resubmitting deletion. The existing protected backup/deletion worker is not used because its
retention and recovery semantics conflict with direct permanent deletion.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS

**Package Manager**: pnpm 11.22.0

**Primary Dependencies**: Next.js 16.3 App Router, React 19.2, Tailwind CSS 4, Base UI 1.7,
Prisma 7.9, Zod 4.4, Auth.js/NextAuth 4.24, next-intl 4.13, Pino 10.3, and the existing
provider-neutral HTTP email boundary. No new package is required.

**Storage**: PostgreSQL through Prisma. `User` is the account root; `Account` and `Session` cascade,
`PolicyAcceptance` restricts deletion, and `VerificationToken` plus `RateLimitBucket` are keyed by
normalized-email-derived values rather than user foreign keys.

**Testing**: Vitest + jsdom + Testing Library for unit/component tests; live PostgreSQL integration
tests for token lifecycle, session freshness, shared rate limits, transaction rollback, concurrency,
complete data removal, and sanitized logs; Playwright against the standalone production artifact
and real HTTP email-provider fixture for localized same-device/cross-device reauthentication,
accessibility, responsive layout, cookie clearing, lost-response recovery, and opt-in ARM64
performance cohorts. A moderated usability study records aggregate, non-identifying results only.

**Target Platform**: Docker Linux containers on Raspberry Pi ARM64, portable to a VPS; ingress via
Cloudflare Tunnel -> Traefik.

**Project Type**: Web application: one Next.js full-stack `app` container plus PostgreSQL. No worker
participates in the account deletion request path.

**Deployment**: Existing Docker Compose topology and networks (`traefik_network` plus private
`internal`) remain unchanged; services retain `restart: unless-stopped`.

**CI/CD**: Existing GitHub Actions gates on lint, typecheck, tests, coverage, production build,
dependency audit, SpecKit validation, and production-artifact E2E smoke coverage.

**Secrets**: Reuse `AUTH_SECRET`, canonical `NEXTAUTH_URL`, and existing email-provider credentials.
Development uses local `.env`; production injects GitHub Variables/Secrets and stores no host
`.env`. Tokens, cookies, email addresses, and account identifiers never enter logs.

**Observability**: Reuse healthchecks and structured Pino JSON to stdout. Emit only sanitized
categories (`reauth_sent`, `reauth_failed`, `delete_completed`, `delete_failed`,
`delete_concurrent_completed`) with duration and retry metadata; never emit identity, token, cookie,
or deletion payload values.

**Migration Strategy**: One forward-only additive migration adds `ACCOUNT_DELETION` to
`VerificationPurpose` and nullable `Session.authenticatedAt`. Existing rows remain null and therefore
require fresh authentication. Deploy migration before compatible application code, regenerate the
canonical client, and retain the additive fields during any application rollback. A corrective
forward migration is used if constraints or indexes need adjustment; no down migration or generated
client snapshot is treated as schema authority.

**Recovery Strategy**: Token issuance and final deletion are transactional and compensate failed
email delivery. A failed deletion rolls back all active-data changes. A successfully deleted account
is intentionally unrecoverable and MUST NOT be reconstructed by this feature. The additive schema
migration needs no destructive schema recovery; existing repository-level backup/restore operations
remain operationally separate and are neither read nor written by this request path.

**Performance Goals**: Run the release benchmark on the target ARM64 Raspberry Pi with the
repository's standalone production-artifact E2E harness and isolated PostgreSQL topology. For each
of the committed and injected-rollback outcomes, run 10 untimed warm-ups followed by 100 measured
final confirmations. Seed each iteration outside the timer with one active User, two Account
identities, three Sessions including the exact recent session, one PolicyAcceptance, one
VerificationToken for each purpose, the exact address bucket, and the applicable client bucket.
Measure from final-action activation until the localized public completion or generic retryable
error is visible, and compute nearest-rank p95 separately for each cohort; both MUST be below 2
seconds. Record hardware, OS, standalone artifact identifier, database image, commit, sample size,
p50, p95, and maximum without identity data. Every query remains bounded by unique
account/session/email keys; there is no scan, queue, polling loop, or remote call inside the
deletion transaction. Fixture setup and email delivery are outside the measured interval.

**Constraints**: Direct permanent deletion only; no soft delete, account tombstone, retention copy,
recovery window, protected-deletion ledger, or background deletion worker. Identity comes only from
the server session cookie. Recent authentication is valid for 10 minutes. The link may continue on
another browser but never deletes by itself. The final mutation must clear session cookies, remain
CSRF/same-origin protected, preserve all data on failure, and keep PII out of logs. Each deletion
POST uses its own client-scoped shared bucket with a limit of 5 requests per 15 minutes;
reauthentication additionally uses the existing exact address bucket with a limit of 3 requests per
15 minutes. Rate-limited requests return a generic `429` with `Retry-After` before email delivery or
the deletion transaction. Successful deletion removes the address bucket and retains client/global
buckets.

**Scale/Scope**: One authenticated account per request, three locales, one Data & Privacy page, one
public completion page, a bounded set of auth identities/sessions/tokens for the account, one policy
acceptance, one email-address rate-limit bucket, and two operation-specific client buckets.
Low-volume self-service mutations; no batch, administrator, billing, export, or cross-account
deletion.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

- **I / IV - Docker portability**: PASS. Reuses the existing app, database, ingress, environment,
  and email-provider boundary with no host path, machine identity, container, or network addition.
- **II / Standard architecture - operational and domain boundaries**: PASS. Account deletion stays
  in the existing full-stack app and cohesive `account/deletion` module; route files compose HTTP
  concerns, while shared auth, email, i18n, logger, and database infrastructure remain shared.
- **V - secrets**: PASS. Reuses runtime-injected secrets; raw verification credentials exist only
  in request/email flow, persisted tokens are one-way digests, and no secret or PII is logged.
- **VI / Database rules - persistence and recovery**: PASS. The migration is additive and
  forward-only. Final deletion is the explicitly specified irreversible product action, is atomic,
  and creates no backup or recovery record. Failures roll back; successful user-requested deletion
  is never reversed or reconstructed by application rollback.
- **VII - minimal stack**: PASS. Uses installed Next.js, React, Base UI, Zod, Auth.js, Prisma,
  next-intl, Pino, and the current HTTP email provider; no queue, cache, worker, or package is added.
- **VIII - production readiness and logging**: PASS. The existing healthcheck remains sufficient;
  bounded synchronous work meets the two-second objective, and only sanitized outcomes/durations
  are emitted to structured logs.
- **IX - reproducible CI/CD**: PASS. Migration/client generation plus existing lint, typecheck,
  unit/integration, build, audit, coverage, and standalone E2E commands reproduce the change.
- **X - security by default**: PASS. Canonical origin, CSRF, exact session-cookie lookup, recent-auth
  evidence, server-derived identity, single-use tokens, rate limits, generic errors, advisory locks,
  and strict callback destinations cover forgery, replay, enumeration, races, and resource abuse.
- **XI - specification first**: PASS. The clarified spec defines behavior, non-goals, threats,
  direct deletion semantics, failure recovery, performance, accessibility, and operational impact.
- **XII - tests and verification**: PASS. Unit/component, live-database integration, provider-boundary
  integration, accessibility, responsive, concurrency, rollback, and production-artifact E2E checks
  cover the critical irreversible flow.
- **Internationalization**: PASS. English, Spanish, and Catalan routes, email copy, dialog states,
  errors, and public completion use existing next-intl catalogs and locale-aware navigation.

No pre-design gate violation requires justification.

### Post-Design Gate

Phase 1 preserves every pre-design result:

- **I-IV / architecture and portability**: PASS. The data model, three internal route contracts,
  and UI state machine remain inside the existing app/database topology with no infrastructure or
  host coupling.
- **V / secrets**: PASS. The contracts accept neither identity nor session tokens in JSON; both
  supported Auth.js session-cookie variants remain server-only, and persisted verification values
  are digests.
- **VI / data and recovery**: PASS. The schema delta is additive, the explicit transaction matches
  current foreign-key behavior, rollback preserves all active rows, and successful deletion creates
  no recoverable application record.
- **VII-VIII / minimal stack and operations**: PASS. No dependency or worker was added; every query
  is uniquely bounded, p95 verification is defined, and observability remains sanitized.
- **IX / reproducibility**: PASS. The quickstart supplies migration, generation, unit, integration,
  coverage, build, audit, compliance, and standalone E2E commands using existing tooling.
- **X / security**: PASS. OpenAPI and the data model require canonical origin, CSRF, exact cookie
  session, recent authentication, purpose-isolated single-use credentials, fixed callbacks, rate
  limits, lock ordering, generic failures, and no client identity.
- **XI-XII / specification and verification**: PASS. Contracts trace all clarified behavior,
  including cross-device return, delivery failure, concurrency, lost response, accessibility,
  localization, and no automatic mutation retry, to executable validation scenarios.
- **Internationalization**: PASS. Route, UI, provider message, errors, and completion contracts cover
  English, Spanish, and Catalan without locale-derived authorization.

**Post-design result: PASS. No Complexity Tracking entry is required.**

## Project Structure

### Documentation (this feature)

```text
specs/20260820-account-deletion/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- usability-results.md              # Aggregate release evidence created during verification
|-- contracts/
|   |-- account-deletion.openapi.yaml
|   `-- ui-state-machine.md
`-- tasks.md                         # Created later by /speckit-tasks
```

### Source Code (repository root)
```text
src/
|-- app/
|   |-- [locale]/
|   |   |-- account/data/page.tsx             # Protected Data & Privacy composition
|   |   `-- account-deleted/page.tsx           # Generic public localized result
|   `-- api/account/deletion/
|       |-- route.ts                           # CSRF-protected final mutation + cookie expiry
|       |-- reauthenticate/route.ts            # Session-derived verification issuance
|       `-- verify/route.ts                    # Single-use callback delegated to Auth.js
|-- components/ui/dialog.tsx                   # Thin Base UI accessible dialog primitive
|-- lib/
|   |-- auth.ts                                # Internal deletion verification provider
|   |-- auth-adapter.ts                        # Fresh session timestamp + purpose-aware consume
|   `-- auth-email-rate-limit.ts               # Shared deterministic address bucket key
|-- messages/{en,es,ca}.json                   # Page, dialog, email, error, completion copy
|-- modules/account/
|   |-- components/account-navigation.tsx      # Shared Profile/Data & Privacy navigation
|   `-- deletion/
|       |-- components/delete-account-dialog.tsx
|       |-- email.ts                           # Localized fresh-auth message
|       |-- schema.ts                          # Exact locale/action/state validation
|       |-- service.ts                         # Issuance + atomic permanent deletion
|       |-- session.ts                         # Exact DB session/cookie freshness boundary
|       |-- token.ts                           # Random credential + persisted digest/expiry
|       |-- types.ts                           # Serializable API/UI states
|       `-- verification-context.ts            # Authorized Auth.js callback context
`-- proxy.ts                                   # Canonical-origin coverage for deletion APIs

prisma/
|-- schema.prisma                              # Purpose enum + nullable auth timestamp
`-- migrations/<timestamp>_add_account_deletion_auth/
  `-- migration.sql

tests/
|-- unit/
|   |-- account-deletion-*.test.{ts,tsx}       # Dialog, routes, schemas, cookies, messages
|   `-- auth-adapter.test.ts                    # Session timestamp and token-purpose isolation
|-- integration/
|   |-- account-deletion.test.ts               # Atomic data graph, rollback, races, logs
|   `-- account-deletion-reauth.test.ts         # Provider/token/session boundary
`-- e2e/
  |-- account-deletion.spec.ts                 # Locales, a11y, mobile, cross-device, recovery
  `-- account-deletion.performance.spec.ts     # Opt-in ARM64 success/rollback p95 cohorts
```

**Structure Decision**: Keep the existing single Next.js application and extend the cohesive
`account` domain with a `deletion` submodule. Route handlers own canonical HTTP/CSRF/cookie behavior;
the module owns token issuance, session freshness, and transactional business rules. Auth.js remains
the sole session creator, Prisma remains the sole active-data store, and the existing email boundary
remains the sole delivery integration. A thin shared Base UI dialog wrapper is added because no
dialog primitive exists. The generated Prisma directory is regenerated from canonical schema and
never used as a design source. Existing protected backup/deletion services and worker declarations
are deliberately unchanged and excluded from this feature.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations or exceptions.