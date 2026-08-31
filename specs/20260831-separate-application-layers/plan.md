# Implementation Plan: Separate Application Layers

**Branch**: `20260831-separate-application-layers` | **Date**: 2026-08-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/20260831-separate-application-layers/spec.md`

**Note**: This template is filled in by the `/speckit-plan` skill; its definition describes the execution workflow.

## Summary

Refactor signup activation and account-deletion verification so their route handlers retain only
HTTP, canonical-origin, Auth.js orchestration, callback allowlisting, and result translation while
server-only domain services own token hashing, persistence reads, token/user eligibility, session
conflict decisions, and signup post-callback reconciliation. Preserve the current call order with a
staged preflight followed by a pure session decision; keep the hardened Auth.js adapter as the
locked transactional authority for token consumption, account activation, policy acceptance, and
session creation. Convert login/signup accepted-response helpers into timing-only waits while routes
construct the unchanged JSON response. Move Prisma-dependent export contributor contracts to a
server-only internal type module and add a Vitest source-scan guard for all declared boundaries,
with the infrastructure health route as the one exact persistence exception.

## Technical Context

**Language/Version**: TypeScript 6.0.x on Node.js 24 LTS

**Package Manager**: pnpm 11.22.0 through Corepack

**Primary Dependencies**: Next.js 16.3.2 App Router, React 19.2.8, Prisma 7.9.1 with
`@prisma/adapter-pg`, Zod 4.4.3, Auth.js/NextAuth 4.24.15, next-intl 4.13.7, and Pino 10.3.1. Reuse
the existing provider-neutral email boundary and Node filesystem APIs available to Vitest. No new
runtime or development dependency.

**Storage**: Existing PostgreSQL schema through the shared Prisma client. `User`, `Session`,
`VerificationToken`, and `PolicyAcceptance` behavior is unchanged; no schema or migration change.

**Testing**: Vitest 4.1.11 for server-only service, route, timing, and architecture tests; live
PostgreSQL integration suites for Auth.js adapter transactions, advisory locks, token consumption,
signup activation, deletion reauthentication, and response timing; existing Playwright 1.62.1
signup and account-deletion journeys against the standalone production artifact. Coverage retains
80% statements, 75% branches, 80% functions, and 80% lines.

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel -> Traefik

**Project Type**: Web application - single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Docker Compose; networks `traefik_network` (external ingress) + `internal` (private); services use `restart: unless-stopped`

**CI/CD**: Existing GitHub Actions pull-request gate on GitHub-hosted Linux x64 runners: frozen
install, Prisma generation, lint, typecheck, production audit, SpecKit compliance, PostgreSQL-backed
coverage tests, build/image validation, and production-artifact E2E. No workflow step changes.

**Secrets**: Reuse `AUTH_SECRET`, canonical `NEXTAUTH_URL`, Auth.js cookies, and current email
provider credentials. Development uses local `.env`; production injects GitHub Variables/Secrets
and stores no host `.env`. Raw tokens, digests, emails, user/session IDs, and errors remain absent
from responses and logs.

**Observability**: Existing healthcheck, Pino JSON to stdout, request correlation, Docker logs, and
rotation remain unchanged. Add no event to signup activation or deletion verification, which
currently emit none; preserve existing sanitized submission and adapter/service events.

**Migration Strategy**: N/A. No schema, migration, generated-client, stored-data, or compatibility
window change.

**Recovery Strategy**: Revert the cohesive route, service, internal-type, and test changes together
if validation fails. No database restore or schema reversal applies because persisted state is
unchanged and the existing Auth.js transactions remain authoritative throughout rollout.

**Performance Goals**: Preserve the accepted login/signup timing algorithm exactly: 500 ms minimum
from request start plus inclusive integer jitter of 0-100 ms and repeated remaining-time sleeps.
Malformed and domain-invalid verification links perform no Auth.js session/callback call, matching
the current I/O order. Each preflight remains bounded to one unique token and one unique user read;
signup failure reconciliation retains two parallel unique reads.

**Constraints**: Raspberry Pi memory/CPU limits; no host-specific path or address; portable to VPS;
zero public contract, route, cookie, redirect, rate-limit, transaction, lock, logging, or timing
change; no repository/DAO or generic verification framework; no Auth.js adapter/provider/context
change; no new dependency; exact direct-database exception only for `/api/health`; Server Component
to domain-service calls remain supported.

**Scale/Scope**: Four existing HTTP entry points, two domain verification flows, two accepted timing
helpers, one export type boundary, and one architecture test. One token, user, and current session
per verification request; no new user, record, endpoint, page, locale, batch, queue, or background
operation.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

- **I / III / IV - portability and network isolation**: PASS. The refactor stays in the existing
  application container and database network, adds no endpoint, service, port, host assumption, or
  architecture-specific dependency, and remains identical on ARM64 and VPS deployments.
- **II / standard architecture - cohesive domain ownership**: PASS. Routes keep transport and
  Auth.js integration; signup, login, account deletion, and data export retain cohesive domain
  modules; persistence stays behind the shared client and server-only services. No container or
  artificial repository layer is introduced.
- **V - secrets**: PASS. Existing one-way token hashing and request-local callback authorization
  remain unchanged. New internal results never enter client payloads or logs and carry no raw token.
- **VI / database rules - persistence and recovery**: PASS. There is no schema or data change.
  Existing adapter, issuance, compensation, deletion, export, rate-limit, advisory-lock, and
  transaction behavior remains untouched; recovery requires no migration or restore.
- **VII - minimal stack**: PASS. The architecture guard uses installed Vitest and Node APIs. No
  package, repository, DAO, cache, queue, worker, or service is added.
- **VIII - production readiness**: PASS. Query cardinality remains bounded, accepted-response timing
  is invariant, health behavior is unchanged, and no new log risks sensitive disclosure.
- **IX - reproducible CI/CD**: PASS. Existing lint, typecheck, audit, compliance, coverage,
  PostgreSQL integration, build, and E2E gates exercise all changes without workflow modification.
- **X - security by default**: PASS. Canonical origin, CSRF on submission, purpose/delivery/expiry
  checks, user eligibility, uniform failures, session conflict, fixed redirects, request-local
  authorization, adapter revalidation, locks, rate limits, and log redaction are preserved.
- **XI - specification first**: PASS. The validated spec defines behavior, actors, non-goals,
  security invariants, edge cases, and measurable regression outcomes before implementation.
- **XII - tests and verification**: PASS. Planned service and route units separate responsibilities;
  live PostgreSQL/provider suites prove critical auth transactions; existing Playwright journeys
  retain production-artifact coverage.
- **XIII - discoverability and indexing**: PASS. No page, route path, metadata, sitemap, robots, or
  indexing classification changes. Existing API crawler headers and policy remain untouched.
- **Internationalization**: PASS. Existing English, Spanish, and Catalan locale parsing and fixed
  destinations remain byte-for-byte compatible; no message catalog or visible copy changes.

**Pre-design result: PASS. No constitutional violation requires justification.**

### Post-Design Gate

- **Architecture and minimality**: PASS. [research.md](research.md) and
  [application-boundaries.md](contracts/application-boundaries.md) define domain-local staged
  preflights, preserve route-owned Auth.js orchestration, and reject a generic verification layer or
  new dependency.
- **Persistence and recovery**: PASS. [data-model.md](data-model.md) records no schema delta and
  keeps adapter locks, transactions, state transitions, and query bounds unchanged. Internal
  preflight values are transient and server-only.
- **Security and privacy**: PASS. [http-compatibility.md](contracts/http-compatibility.md) preserves
  every public status, payload, header, cookie, redirect, timing defense, generic failure, and fixed
  callback. Sensitive candidates are neither serialized nor logged.
- **Verification and reproducibility**: PASS. [quickstart.md](quickstart.md) maps service, route,
  architecture, PostgreSQL/provider, full quality, E2E, and no-scope-drift checks to existing
  commands. The architecture test reports exact violating paths and permits only the health route.
- **Operations, portability, i18n, and indexing**: PASS. Phase 1 adds no operational artifact,
  endpoint, UI, copy, locale behavior, metadata, crawler behavior, or platform coupling.

**Post-design result: PASS. All Phase 0 decisions are resolved, and no Complexity Tracking entry is
required.**

## Project Structure

### Documentation (this feature)

```text
specs/20260831-separate-application-layers/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- checklists/
|   `-- requirements.md
|-- contracts/
|   |-- application-boundaries.md
|   `-- http-compatibility.md
`-- tasks.md                              # Created later by /speckit-tasks
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
src/
|-- app/api/
|   |-- auth/[...nextauth]/route.ts               # Await login timing; construct accepted JSON
|   |-- signup/
|   |   |-- route.ts                              # Await signup timing; construct accepted JSON
|   |   `-- activate/route.ts                     # HTTP/Auth.js orchestration, no persistence
|   |-- account/deletion/verify/route.ts           # HTTP/Auth.js orchestration, no persistence
|   `-- health/route.ts                            # Sole direct DB route exception, unchanged
|-- lib/auth-adapter.ts                            # Locked authoritative callbacks, unchanged
|-- modules/
|   |-- login/service.ts                           # Timing-only accepted wait
|   |-- signup/service.ts                          # Preflight/session/failure decisions + wait
|   `-- account/
|       |-- deletion/service.ts                    # Preflight and session decision
|       `-- data-export/
|           |-- types.ts                           # Client-safe public contracts
|           |-- internal-types.ts                  # New server-only Prisma-aware contracts
|           |-- registry.ts
|           |-- service.ts
|           `-- contributors/*.ts                  # Updated internal type imports only

tests/
|-- unit/
|   |-- architecture-boundaries.test.ts            # New source dependency guard
|   |-- login-service.test.ts
|   |-- signup-service.test.ts
|   |-- signup-activation-route.test.ts
|   |-- account-deletion-service.test.ts            # New isolated verification decisions
|   |-- account-deletion-verify-route.test.ts
|   `-- auth-route.test.ts
|-- integration/
|   |-- signup-onboarding.test.ts                   # Existing real DB/provider regression
|   |-- account-deletion-reauth.test.ts              # Existing adapter/callback regression
|   |-- account-deletion.test.ts                    # Existing transaction regression
|   `-- email-response-time.test.ts                 # Existing 500 ms timing regression
`-- e2e/
  |-- signup-onboarding.spec.ts                   # Existing standalone journey
  `-- account-deletion.spec.ts                    # Existing standalone journey
```

**Structure Decision**: Keep the existing single full-stack application and domain modules. Add
verification operations to the existing signup and account-deletion services rather than creating a
repository or generic verifier. Routes remain thin but continue to orchestrate the Auth.js session
and callback because only Auth.js may create its session cookie. The new export internal-types file
is a narrow server boundary, not a new layer. One Node-environment Vitest file enforces the resulting
dependency direction and runs through the existing test/coverage job. Prisma schema, generated
client, adapter, Docker, environment, CI workflow, UI, messages, and deployment files remain
unchanged.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations or exceptions.
