# Implementation Plan: Active Session Management

**Branch**: `20260821-account-session-management` | **Date**: 2026-08-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/20260821-account-session-management/spec.md`

**Note**: This template is filled in by the `/speckit-plan` skill; its definition describes the execution workflow.

## Summary

Add a protected, localized Account Security page that lists at most 20 active sessions with the
current session pinned first, revokes one other session or all other sessions after recent
authentication, and immediately invalidates revoked access. Extend the hardened Auth.js adapter's
existing per-user serialized session-creation transaction to preserve a newly created session while
deterministically deleting the oldest prior session at the account cap. A forward migration adds one
nullable immutable start timestamp, minimum lookup support, an account-security verification
purpose, and one atomic rollout normalization statement for accounts already above the cap.
Security-specific route handlers and an
account-domain service reuse the existing canonical-origin, shared rate-limit, email-provider,
database-session, and accessible dialog boundaries without adding infrastructure or collecting
device/network metadata.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS

**Package Manager**: pnpm

**Primary Dependencies**: Next.js 16 App Router + React 19, Tailwind CSS 4, Prisma 7 with the PostgreSQL driver adapter, Zod 4, Auth.js (NextAuth) 4 database sessions, next-intl 4, Pino 10, existing provider-neutral HTTP email boundary; no new runtime dependency

**Storage**: PostgreSQL (via Prisma)

**Testing**: Vitest + jsdom + Testing Library for unit/component contracts; live-PostgreSQL Vitest suites for migration, adapter cap, advisory-lock concurrency, revocation, and controlled real-provider authentication; Playwright for standalone-artifact multi-context, localization, accessibility, responsive, lost-response, and opt-in ARM64 latency checks

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel -> Traefik

**Project Type**: Web application - single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Docker Compose; prebuild images while the legacy app serves, then intentionally quiesce the single app replica, run the migrator synchronously, start the new app, and complete the existing health check; networks `traefik_network` (external ingress) + `internal` (private); services use `restart: unless-stopped`

**CI/CD**: GitHub Actions; pull-request CI runs on GitHub-hosted x64 runners, while production deployment runs on the self-hosted Linux ARM64 runner

**Secrets**: dev uses a local `.env`; prod uses **no** `.env` file - non-sensitive config in GitHub **Variables**, secrets in GitHub **Secrets**, injected into the containers at deploy time. Never committed.

**Observability**: Existing healthcheck + redacted Pino stdout JSON + Docker log rotation; the only feature-owned structured field is one fixed sanitized outcome category, with no new aggregate counter

**Migration Strategy**: Forward-only migration following PostgreSQL's enum boundary: add `ACCOUNT_SECURITY` with `IF NOT EXISTS` outside the explicit transaction, then transactionally add nullable `Session.createdAt`, backfill it only from non-null pre-feature creation-stamped `authenticatedAt`, update the verification-token check constraint, add `Session(userId, expires)`, and delete active rows ranked after each account's deterministic newest 20. Build first and stop/wait for the legacy app before the synchronous migrator so no uncapped writer can race normalization. Existing `Session.id` remains the selector; no selector, device/network metadata, or intent column is added.

**Recovery Strategy**: Revoked sessions are authorization grants and are never recreated by code rollback. If the explicit transaction fails after enum commit, nullable field/backfill/constraint/index/session deletions all remain unchanged and the app stays stopped; verify rollback, then use Prisma's resolved migration state for an idempotent retry or a versioned corrective forward migration before traffic. For an incompatible failure, restore the verified logical backup into a fresh database/volume, reapply every migration/normalization, validate the cap, then switch without reviving grants removed after the backup.

**Performance Goals**: At least 95% of confirmed individual and bulk revocations present the authoritative updated list or a generic recoverable error within 2 seconds on the target ARM64 Raspberry Pi; render and operate a maximum 20-session list without horizontal overflow.

**Constraints**: Raspberry Pi memory/CPU limits; no host-specific paths/IPs; portable to VPS; an intentional brief maintenance window closes the one-time legacy-writer rollout race; current session must survive individual and bulk actions; no session token, cookie, email, IP address, user-agent, device fingerprint, geolocation, or inferred device label may cross the UI/log boundary; revoked access fails on the next authorization check; no worker, queue, cache, trigger, or new external service. Runtime creation/revocation uses the existing transaction-scoped `pg_advisory_xact_lock(hashtextextended(userId, 0))`; immutable ordering is `createdAt ASC NULLS FIRST, id ASC` for eviction and its exact inverse for retention/listing, while `authenticatedAt` is freshness-only.

**Scale/Scope**: One localized Security page in three locales; 1-20 active sessions per account after rollout; individual and account-wide revocation; existing-user email reauthentication through a dedicated `ACCOUNT_SECURITY` credential and callback transaction that refreshes an existing active same-account session in place; extract only shared cookie/session/freshness infrastructure from deletion ownership; all current application replicas share PostgreSQL state

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I / IV - Portability**: PASS. The design uses existing runtime configuration, PostgreSQL, and
  the current Docker topology with no host-specific value or architecture-specific dependency.
- **II / VII - Operational simplicity**: PASS. UI, route handlers, auth adapter, and domain service
  stay in the single app container; no worker, cache, queue, or new package is introduced.
- **III - Network isolation**: PASS. No new public port or service is added; authenticated HTTP
  traffic continues through the existing application entrypoint.
- **V - Secrets**: PASS. Session tokens and email credentials remain server-only; the UI receives
  only a noncredential selector and sanitized metadata. No new secret or environment value is
  required.
- **VI - Persistence and recovery**: PASS WITH DESIGN FOLLOW-UP. Phase 1 must specify the
  forward-only normalization, compatibility, corrective migration, and verified-restore path;
  revoked grants are intentionally not reconstructed by code rollback.
- **VIII - Production readiness**: PASS. Existing health behavior remains; only sanitized outcome
  categories may be logged, with no account/session/PII fields.
- **IX - Reproducibility**: PASS. The versioned migration and all feature behavior run through the
  current build, CI, migrator, and Compose deployment.
- **X - Security by default**: PASS WITH DESIGN FOLLOW-UP. Final contracts must derive identity and
  current session from trusted cookies, recheck ownership/recent authentication under a per-user
  transaction lock, reject invalid origin/CSRF context, bound email issuance, and return generic
  outcomes for forged or replayed selectors.
- **XI - Specification first**: PASS. The clarified specification defines behavior, non-goals,
  threats, data transition, and measurable outcomes before implementation.
- **XII - Verification**: PASS WITH DESIGN FOLLOW-UP. Phase 1 must map unit, PostgreSQL integration,
  controlled-provider integration, production-artifact E2E, accessibility, responsive, migration,
  concurrency, and recovery checks.

**Pre-Phase 0 gate result**: PASS. No constitutional violation requires a Complexity Tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/20260821-account-session-management/
|-- plan.md              # This file (/speckit-plan command output)
|-- research.md          # Phase 0 output (/speckit-plan command)
|-- data-model.md        # Phase 1 output (/speckit-plan command)
|-- quickstart.md        # Phase 1 output (/speckit-plan command)
|-- contracts/           # Phase 1 output (/speckit-plan command)
`-- tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  This is the project's standard layout (Next.js App Router + Prisma + Docker),
  per the constitution. Adjust only the paths a feature actually adds or changes.
  Do NOT split frontend/backend - Next.js combines them in the `app` container
  (constitution Principle II). Organize business code by domain under
  src/modules/<domain>/; shared code stays in app/, components/, lib/, and server/.
-->

```text
.github/workflows/deploy.yml                       # Build, quiesce, migrate, start order

src/
|-- app/
|   |-- [locale]/account/security/page.tsx        # Protected localized page
|   |-- api/account/security/
|   |   |-- reauthenticate/route.ts               # Bounded email issuance
|   |   |-- verify/route.ts                       # Atomic existing-session freshness
|   |   `-- sessions/
|   |       |-- revoke/route.ts                   # Individual mutation
|   |       `-- revoke-others/route.ts            # Bulk mutation
|-- components/ui/                               # Existing dialog/button primitives
|-- modules/account/
|   |-- components/account-navigation.tsx        # Add localized Security destination
|   |-- security/                                 # List/dialog, schema, service, email, credential
|   `-- session.ts                                # Shared cookie, active-session, freshness helpers
|-- lib/
|   |-- auth-adapter.ts                           # Serialized session creation and cap
|   |-- db.ts                                     # Existing Prisma client singleton
|   |-- request-context.ts                        # Existing canonical request protections
|   `-- shared-rate-limit.ts                      # Existing shared abuse controls
|-- messages/{en,es,ca}.json                      # Localized Security states
`-- generated/
    `-- prisma/                                    # Regenerated Prisma client

prisma/
|-- schema.prisma                                  # Verification purpose, start time, session index
`-- migrations/                                   # Forward normalization migration

scripts/
`-- test-e2e.sh                                    # Select opt-in security performance cohort

tests/
|-- unit/                                          # Schema/routes/helpers/UI/messages/adapter/deploy order
|-- integration/                                   # Migration, provider, locks, cap, revocation, rollback
`-- e2e/                                           # Localized multi-context and opt-in ARM64 journeys
```

**Structure Decision**: Keep session-security behavior in `src/modules/account/security`, route and
page entrypoints in `src/app`, and the cross-cutting Auth.js creation invariant in the existing
hardened adapter. Reuse the app, migrator, database, networks, email boundary, and deployment
topology. Move only cookie parsing, active-session resolution, and freshness calculation from the
deletion submodule to the existing account session boundary so both features share one invariant;
security never imports through deletion. Account-security verification refreshes the exact existing
same-account callback session in one credential/session transaction; it does not add an Auth.js
provider, session, or cookie and therefore cannot invoke cap eviction. Update the versioned deploy
workflow, without adding an operator-only host step, to prebuild, quiesce the legacy app, migrate
synchronously, and start the new app. Keep selectors in strict JSON bodies rather than URLs so
infrastructure logs do not capture them.

## Post-Design Constitution Check

- **I / IV - Portability**: PASS. All behavior remains TypeScript/PostgreSQL/Docker Compose, and the
  versioned rollout sequence uses service names rather than host paths, addresses, or architecture
  assumptions. The same brief quiesced migration works on a VPS.
- **II / VII - Operational simplicity**: PASS. The existing app and one-shot migrator own all work;
  there is no package, trigger, worker, queue, cache, daemon, or external service. Two explicit
  revocation routes keep strict payloads clearer than a generic mutation framework.
- **III - Network isolation**: PASS. No service, port, ingress label, or network changes; all four
  HTTP operations remain behind the authenticated application entrypoint and PostgreSQL stays
  private.
- **V - Secrets**: PASS. Existing Auth.js and mail secrets remain runtime-injected. The render/API
  contracts expose only dates, a current flag, generic ordinal, and an opaque noncredential selector
  in an individual JSON body; credentials and PII remain server-only and redacted.
- **VI - Persistence and recovery**: PASS. [data-model.md](data-model.md) defines the idempotent enum
  commit boundary, transactional nullable start/backfill/constraint/index/one-statement
  normalization, quiesced rollout, partial-migration resolution, forward repair, and
  restore-before-traffic. Revoked grants are intentionally never reconstructed.
- **VIII - Production readiness**: PASS. The existing healthcheck/log rotation/resource limits stay
  unchanged. Feature-owned logs contain only a fixed sanitized outcome category and add no
  aggregate counter; the list/mutations are bounded to 20 rows under a keyed database lock.
- **IX - Reproducibility**: PASS. Migration, deploy ordering, provider fixture, standalone build,
  E2E harness, and performance cohort are repository-versioned and exercised by the documented
  commands; no production `.env` or manual database edit is introduced.
- **X - Security by default**: PASS. The [HTTP contract](contracts/account-security.openapi.yaml)
  requires canonical origin, Auth.js CSRF, trusted cookie identity, purpose-isolated single-use
  email verification, existing same-account callback session, shared issuance limits, atomic
  token-consumption/freshness, locked ownership rechecks, generic no-ops, credential-free redirects,
  and no automatic mutation replay.
- **XI - Specification first**: PASS. Research resolves every technical unknown, while the model and
  contracts trace the clarified cap, ordering, rollout, authorization, privacy, and interaction
  requirements without expanding into audit/device/admin functionality.
- **XII - Verification**: PASS. [quickstart.md](quickstart.md) maps unit/component, live PostgreSQL
  migration/concurrency/rollback, controlled-provider, standalone multi-context E2E, axe, 320 px,
  lost-response, secret-redaction, rollout-drill, ARM64 p95, and post-release usability evidence.

**Post-Phase 1 gate result**: PASS. All pre-design follow-ups are resolved, no clarification marker
remains, and no constitutional violation requires a Complexity Tracking entry.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
