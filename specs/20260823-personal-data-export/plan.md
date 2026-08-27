# Implementation Plan: Personal Data Export

**Branch**: `20260823-personal-data-export` | **Date**: 2026-08-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/20260823-personal-data-export/spec.md`

**Note**: This template is filled in by the `/speckit-plan` skill; its definition describes the execution workflow.

## Implementation summary

Add a protected, localized Download your data section before account deletion on Data & Privacy.
An exact active Session requests a purpose-isolated 15-minute credential through the existing HTTP
email provider. A custom callback, never Auth.js, atomically consumes that credential and creates a
narrow `DataExportAuthorization` only for the exact already-active same-account Session until the
credential's original expiry; it creates no Session/cookie and changes no general freshness.

After a separate explicit download command, an account-domain coordinator runs an immutable,
explicit contributor registry through one read-only PostgreSQL REPEATABLE READ transaction. It
combines the built-in account, policy-acceptance, and active-session projections plus injected
product contributors into a canonical versioned UTF-8 JSON envelope. The complete payload is
validated, bounded by a configurable 25 MiB/30-second default, and buffered before any attachment
byte is returned. No generated export is retained, emailed, queued, logged, or backed up; no worker,
store, service, or package is added.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (`>=24.15.0 <25.0.0`)

**Package Manager**: pnpm 11.22.0

**Primary Dependencies**: Next.js 16.3.1 App Router, React 19.2.8, Tailwind CSS 4, Base UI 1.7,
Prisma 7.9.1 with the PostgreSQL driver adapter, Zod 4.4.3, Auth.js/NextAuth 4.24.15 database
sessions, next-intl 4.13.6, Pino 10.3.1, Lucide React, and the existing provider-neutral HTTP email
boundary; no new runtime or development dependency

**Storage**: PostgreSQL through Prisma. Existing `VerificationToken` stores only the export-purpose
digest/delivery evidence, and one new `DataExportAuthorization` row is keyed by `Session.id` with
`ON DELETE CASCADE`; generated payloads and export histories are never persisted.

**Testing**: Vitest + jsdom + Testing Library for schemas, tokens, registry, canonical serializer,
built-in projections, route/header contracts, UI states, localization, accessibility, and log
redaction; live PostgreSQL Vitest integration for migration, real HTTP provider acceptance/failure,
advisory-lock races, exact-session authorization, shared two-instance limits, REPEATABLE READ
consistency, expiry/cascade, contributor failures, versioning, size/time boundaries, and forbidden
fields; Playwright against the standalone artifact for localized multi-context journeys, attachment
bytes/headers, callback cleanup, keyboard/axe/responsive states, and opt-in ARM64 performance. A
post-release representative usability measurement records aggregate non-identifying outcomes only.

**Target Platform**: Docker Linux containers on Raspberry Pi ARM64, portable to a VPS; ingress via
Cloudflare Tunnel -> Traefik

**Project Type**: Web application: one Next.js full-stack `app` container plus PostgreSQL; the
existing one-shot `migrate` image applies schema changes and no worker participates

**Deployment**: Existing Docker Compose services, healthchecks, named database volume, log rotation,
and networks (`traefik_network` ingress plus private `internal`) remain unchanged. Add only validated
non-sensitive `ACCOUNT_DATA_EXPORT_MAX_BYTES` and `ACCOUNT_DATA_EXPORT_TIMEOUT_MS` values to the
existing environment/deploy wiring; services retain `restart: unless-stopped`.

**CI/CD**: Existing GitHub Actions gates on SpecKit validation, lint, typecheck, configured coverage,
automated tests, production build, production dependency audit, and standalone-artifact E2E; the
opt-in performance cohort runs separately on the target self-hosted Linux ARM64 host

**Secrets**: Reuse `AUTH_SECRET`, canonical `NEXTAUTH_URL`, Auth.js cookies, and existing
email-provider credentials. Development uses local `.env`; production injects GitHub Variables and
Secrets and stores no host `.env`. The two new settings are non-sensitive Variables. Credentials,
digests, cookies, identities, selectors, links, and export values never enter configuration output
or logs.

**Observability**: Reuse the existing health endpoint, Pino newline-delimited JSON to stdout, Docker
logs, and rotation. Emit only fixed export request/verification/generation outcome categories and
duration when required; never emit identity, Session/token/grant/rate-limit values, byte/section
counts, filename, URL/query, contributor namespace/payload, request body, or internal error detail.
No metric endpoint, tracing backend, audit table, or log file is added.

**Migration Strategy**: One forward-only additive migration adds
`VerificationPurpose.ACCOUNT_DATA_EXPORT`, creates `DataExportAuthorization(sessionId,
confirmedAt, expiresAt)`, adds the exact Session foreign key with `ON DELETE CASCADE`, and indexes
`expiresAt`. Apply it before compatible application code and regenerate Prisma from the canonical
schema. Existing rows need no rewrite/backfill; old application code ignores the additive enum/table
during rollback. Correct a faulty constraint/index with a versioned forward migration and never
describe dropping the new schema as normal application rollback.

**Recovery Strategy**: Provisional issuance compensates only the exact failed-delivery token;
credential consumption/grant creation and every snapshot either commit atomically or expose
nothing. Expired or cascade-orphaned grants fail closed even before opportunistic cleanup. A faulty
application rolls back independently while the additive schema remains. For database disaster
recovery, restore the existing logical backup into a fresh database/volume, apply all migrations,
and run focused integration checks before traffic. Pre-feature backups restore with no grants;
post-feature backups may include grant rows but Session/expiry checks remain authoritative. No
backup can contain generated exports because none are persisted.

**Performance Goals**: Default each completed UTF-8 payload to at most 26,214,400 bytes and active
generation to at most 30,000 ms, including snapshot acquisition, contributors, validation, and
canonical serialization but excluding client transfer. On the target Raspberry Pi, run 10 untimed
warm-ups and 100 measured built-in-framework generations through the standalone artifact; nearest-
rank p95 must be below 2 seconds and every attempt below the hard active timeout. Boundary suites
must reject one byte over and active-timeout work with zero attachment. Derived applications repeat
capacity validation after material contributor or limit changes.

**Constraints**: Raspberry Pi memory/CPU limits; complete in-memory buffering bounded by the active
byte cap; sequential deterministic contributors; no host-specific path/IP/hostname or ARM-only
source assumption; no export file/store/history, temporary file, object storage, queue, cache,
worker, remote contributor call, or automatic database discovery; no client-supplied identity,
Session, recipient, ownership, authorization, contributor, scope, filename, or limits; confirmation
is not authentication/freshness; credentials and grants expire at the original 15-minute boundary;
shared allowance windows enforce 5 request/client, 3 request/account, 5 confirmation/client, and 3
generation/exact-Session before protected work; all sensitive failures are generic and no response
may be partial.

**Scale/Scope**: One account and exact Session per operation; three internal HTTP handlers; one
panel on one protected page in English, Spanish, and Catalan; three built-in section namespaces and
an explicit composition extension point for derived product modules; low-volume self-service use;
one reusable grant per exact Session until original expiry; up to three explicit generations per
Session allowance window; at most 25 MiB and 30 seconds per attempt by default; all replicas share
PostgreSQL token, grant, and rate-limit state

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

- **I / IV - Docker portability**: PASS. The feature uses existing Docker/PostgreSQL/application
  boundaries and environment injection, with no host path, local address, machine identity, or
  architecture-specific dependency. The same artifact and logical restore path work on a VPS.
- **II / VII - Operational responsibility and minimal stack**: PASS. UI, internal APIs,
  confirmation, and bounded synchronous generation stay in the existing full-stack app. Direct
  non-retained delivery makes a worker/store semantically inappropriate; no package, service, cache,
  queue, or object store is added.
- **III - Network isolation**: PASS. No port, service, ingress label, or network changes. All routes
  remain behind the application entrypoint and PostgreSQL/email credentials remain private.
- **V - Secrets**: PASS. Existing runtime-injected auth/mail secrets are reused. Raw credentials
  exist only in the intended email/callback transport, persistence uses one-way digests, and neither
  secrets nor PII enter URLs after callback, output metadata, logs, or committed configuration.
- **VI / Database rules - persistence and recovery**: PASS. The schema is additive, indexed, and
  forward-only; no existing row is changed. Transactional operations fail without partial state,
  existing logical backup/restore remains authoritative, and application rollback never claims to
  reverse schema/data.
- **VIII - Production readiness**: PASS. Existing health/log/rotation behavior remains. Byte/time
  limits, sequential reads, rate limits, and an ARM64 p95 gate bound constrained-host work; logs are
  fixed, structured, and non-identifying.
- **IX - Reproducibility**: PASS. Schema, migration, environment validation, registry composition,
  tests, standalone artifact, and deployment wiring are repository-versioned and use existing
  automated gates.
- **X - Security by default**: PASS. The spec defines canonical origin, CSRF, exact active cookie
  Session, server-derived recipient/ownership, purpose isolation, single use, original expiry,
  same-account binding, shared abuse limits, advisory locks, credential-free redirects, generic
  outcomes, consistent snapshots, allowlisted projections, and no partial response.
- **XI - Specification first**: PASS. The clarified specification defines behavior, non-goals,
  threats, abuse boundaries, data classes, extension ownership, operational constraints, and 14
  measurable outcomes before implementation.
- **XII - Tests and verification**: PASS. Planned unit/component, live PostgreSQL, controlled real
  provider, migration/concurrency/recovery, standalone E2E, accessibility/responsive, ARM64, and
  post-release usability checks cover every critical boundary.
- **Internationalization**: PASS. Data & Privacy, provider messages, callback destinations, panel
  states, countdowns, errors, and login returns preserve English, Spanish, or Catalan through the
  existing next-intl routing/catalog boundary.

**Pre-Phase 0 gate result**: PASS. No constitutional violation requires a Complexity Tracking entry.

## Project Structure

### Documentation (this feature)

```text
specs/20260823-personal-data-export/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- usability-results.md                    # Aggregate post-release KPI evidence (after release)
|-- contracts/
|   |-- personal-data-export.openapi.yaml
|   |-- personal-data-export.schema.json
|   |-- contributor-contract.md
|   `-- ui-state-machine.md
`-- tasks.md                                # Created later by /speckit-tasks, not this workflow
```

### Source Code (repository root)
```text
.github/workflows/deploy.yml                          # Inject two non-sensitive production limits
.env.example                                          # Document validated limit defaults
docker-compose.prod.yml                               # Pass limit Variables to app

src/
|-- app/
|   |-- [locale]/account/data/page.tsx                # Compose export before deletion
|   `-- api/account/data-export/
|       |-- request/route.ts                          # CSRF/session/client+account limits + issuance
|       |-- verify/route.ts                           # Clean exact-session confirmation callback
|       `-- download/route.ts                         # Explicit buffered attachment response
|-- lib/
|   |-- env.ts                                        # Validate active byte/time settings
|   |-- request-context.ts                            # Reuse canonical origin/trusted client
|   `-- shared-rate-limit.ts                          # Reuse atomic PostgreSQL allowance windows
|-- messages/{en,es,ca}.json                          # Panel, email, countdown, outcome copy
|-- modules/account/
|   |-- session.ts                                    # Reuse exact active Session boundary
|   `-- data-export/
|       |-- components/data-export-panel.tsx          # Accessible explicit request/download states
|       |-- contributors/
|       |   |-- account.ts                            # Profile/provider allowlist projection
|       |   |-- active-sessions.ts                    # Timestamp/freshness projection
|       |   `-- policy-acceptances.ts                 # Acceptance or explicit empty projection
|       |-- composition.ts                            # Declared inventory + injected contributors
|       |-- email.ts                                  # Localized export-only confirmation message
|       |-- rate-limit.ts                             # Operation-isolated shared allowance keys
|       |-- registry.ts                               # Product-independent declaration validation
|       |-- schema.ts                                 # Strict HTTP/contribution schemas
|       |-- serializer.ts                             # Canonical JSON + UTF-8 size validation
|       |-- service.ts                                # Issuance, atomic grant, snapshot coordinator
|       |-- token.ts                                  # Random credential, digest, exact expiry
|       `-- types.ts                                  # Contributor/envelope/API/UI contracts
`-- generated/prisma/                                 # Regenerated, gitignored client

prisma/
|-- schema.prisma                                     # Purpose enum + authorization relation/model
`-- migrations/<timestamp>_add_personal_data_export/
  `-- migration.sql                                   # Additive enum/table/cascade/index

scripts/
`-- test-e2e.sh                                       # Select opt-in export ARM64 cohort

tests/
|-- fixtures/personal-data-export-product-contributor.ts # Product contract and failure fixtures
|-- helpers/personal-data-export.ts                   # Safe fixtures with no logged credentials
|-- unit/personal-data-export-*.test.{ts,tsx}         # Token/registry/serializer/routes/UI/email
|-- integration/
|   |-- personal-data-export-migration.test.ts        # Upgrade/retry/compatibility/restore shape
|   |-- personal-data-export-authorization.test.ts    # Provider, locks, token/grant, shared limits
|   |-- personal-data-export-generation.test.ts       # Snapshot, contributors, limits, redaction
|   |-- personal-data-export-observability.test.ts    # Fixed outcomes and strict redaction
|   `-- personal-data-export-rate-limit.test.ts       # Shared two-instance allowance boundaries
`-- e2e/
  |-- helpers/personal-data-export.ts               # Real-HTTP provider capture/failure controls
  |-- personal-data-export.spec.ts                  # Localized multi-context attachment journey
    `-- personal-data-export.performance.spec.ts      # Opt-in ARM64 built-in p95 cohort
```

**Structure Decision**: Keep HTTP/cookie/CSRF/response concerns in three narrow App Router handlers
and all export policy in the cohesive `account/data-export` module. Reuse the established exact
Session, request-context, shared limiter, email-provider, logger, i18n, and Prisma boundaries rather
than routing through deletion or account-security ownership. The custom callback calls no Auth.js
session callback. `composition.ts` is the only application extension point: it supplies a complete
declared inventory and matching built-in/product contributors to `registry.ts`; the coordinator
accepts the validated registry by injection and imports no product module. Every contributor reads
through the one transaction client, and `serializer.ts` completes canonical validation and the
active byte check before `download/route.ts` constructs a response. Two non-sensitive limits flow
through existing environment validation/deployment, with no topology or retained-output change.

## Post-Design Constitution Check

- **I / IV - Portability**: PASS. [research.md](research.md) and the concrete tree use only portable
  TypeScript, PostgreSQL, environment variables, and existing Docker service names. No Pi path,
  address, hostname, or ARM-only behavior enters source; ARM64 is a performance target only.
- **II / VII - Simplicity**: PASS. All work remains in the app plus one read-only database snapshot.
  The explicit registry and small internal canonical serializer solve required extensibility and
  deterministic output without a package, global plugin system, worker, queue, cache, store, or
  separate service.
- **III - Network isolation**: PASS. The [HTTP contract](contracts/personal-data-export.openapi.yaml)
  adds only internal paths on the current app entrypoint. No public service, port, network, or
  direct database/provider exposure changes.
- **V - Secrets**: PASS. The model stores a digest and exact-session foreign key only. Strict route
  schemas reject client identity/authority, the callback immediately removes credential material,
  the filename is non-identifying, and log/output contracts exclude secrets and PII.
- **VI - Persistence and recovery**: PASS. [data-model.md](data-model.md) defines one additive model,
  Session cascade, exact expiry, transaction boundaries, compatibility, corrective forward repair,
  and logical restore behavior. No generated payload can enter a database or backup.
- **VIII - Production readiness**: PASS. Active byte/time/database/cancellation bounds, sequential
  contributors, operation-specific shared limits, complete buffering, existing health/rotation,
  fixed outcome plus duration logs, and the Raspberry Pi capacity cohort address resource and
  operational risks without adding infrastructure.
- **IX - Reproducibility**: PASS. Environment defaults, migration, composition inventory, provider
  fixture, standalone E2E, boundary tests, and ARM64 cohort are versioned. [quickstart.md](quickstart.md)
  supplies install, quality, migration/recovery, accessibility, and release commands with no manual
  production database edit.
- **X - Security by default**: PASS. OpenAPI, data model, contributor contract, and UI state machine
  require canonical same-origin POSTs, Auth.js CSRF, trusted exact Session identity, isolated
  credentials, lock-ordered atomic confirmation, original expiry, generic failures, clean redirects,
  shared limits before protected work, allowlisted same-account projections, read-only repeatable
  snapshots, no automatic retry, and no partial attachment.
- **XI - Specification first**: PASS. Sixteen research decisions resolve every architecture,
  security, persistence, consistency, versioning, UI, operations, and verification choice. The model
  and four contracts refine all 41 requirements without introducing a product-specific domain.
- **XII - Verification**: PASS. The quickstart maps all 14 success criteria to unit/component, real
  PostgreSQL/provider, two-instance concurrency, migration/restore, standalone browser, schema and
  forbidden-field scans, accessibility/localization, ARM64 p95, and aggregate post-release
  usability evidence. Manual checks supplement rather than replace automation.
- **Internationalization**: PASS. [ui-state-machine.md](contracts/ui-state-machine.md) fixes localized
  routes and presentation states for `en`, `es`, and `ca`; API routes stay unlocalized, locale never
  grants authority, and all visible/provider text comes from catalogs.

**Post-Phase 1 gate result**: PASS. Every pre-design follow-up is resolved, no clarification marker
remains, and no constitutional violation requires a Complexity Tracking entry.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations or exceptions.
