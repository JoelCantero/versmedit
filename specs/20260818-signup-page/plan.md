# Implementation Plan: Signup Page

**Branch**: `20260818-signup-page` | **Date**: 2026-08-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/20260818-signup-page/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a separate localized signup flow that creates or reuses an inactive account, sends a
newest-only email onboarding link, activates the account with its link-bound name and policy
acceptance snapshot, and then lets the existing Auth.js email callback create the normal database
session. The implementation extends the current hardened adapter and `VerificationToken` model
instead of weakening login or introducing another authentication system: signup submission owns
pending-account creation, a dedicated activation wrapper preserves conflicting sessions, and
purpose-aware token consumption performs activation atomically before Auth.js establishes the
session.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 26

**Package Manager**: pnpm 11.13.0

**Primary Dependencies**: Next.js 16.2 App Router + React 19.2, Tailwind CSS 4,
next-intl 4.13, Prisma 7.8, Zod 4.4, patched NextAuth 4.24.14 with the Prisma adapter,
Nodemailer 9.0/SMTP, Pino 10.3, and the existing Base UI/shadcn controls. No new runtime
dependency is planned.

**Storage**: PostgreSQL via Prisma; extend `User` with normalized-email uniqueness and an explicit
pending/active state, extend `VerificationToken` with a login/signup purpose and immutable
link-bound candidate metadata, and add one immutable `PolicyAcceptance` record per account activated
through signup. Existing `RateLimitBucket` and Auth.js `Session` storage are reused.

**Testing**: Vitest 4 + jsdom + Testing Library + axe-core for schema, component, route, adapter,
email, and database integration tests; Playwright 1.61 against the production standalone artifact
for the critical browser journey, localization, cookies/redirects, keyboard operation, axe checks,
and 375x667/1440x900 layout measurements. Provider integration exercises the real Nodemailer and
Auth.js boundaries with controlled transport outcomes; no external inbox is required by the default
CI gate. A no-coaching usability evaluation with at least 20 first-time target users uses the
specified locale and mobile/desktop quotas, first-attempt two-minute script, and
`ceil(0.95 × N)` pass threshold; only anonymized aggregate results are retained.

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel → Traefik

**Project Type**: Web application — single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Docker Compose; networks `traefik_network` (external ingress) + `internal` (private); services use `restart: unless-stopped`

**CI/CD**: Pull-request CI on GitHub-hosted x64 runners; existing deployment on the self-hosted
ARM64 runner. The current lint, typecheck, audit, migration, SpecKit compliance, coverage,
production-artifact Playwright, and Docker-image checks remain authoritative.

**Secrets**: Development uses the existing local `.env`; production uses no `.env` file. Existing
`AUTH_SECRET` and SMTP credentials remain GitHub Secrets injected at runtime. Policy versions and
localized policy content are non-secret source-controlled product inputs; no client-supplied version
or timestamp is trusted.

**Observability**: Reuse the healthcheck, request IDs, Pino JSON to stdout, Docker logs, and log
rotation. Emit only aggregate outcome categories and durations; redact name, email, normalized-email
keys, tokens, policy acceptance values, session data, URLs, and recipient-level delivery outcomes.

**Migration Strategy**: One forward-only additive migration introduces `UserStatus`, nullable
`User.normalizedEmail`, signup metadata columns/default purpose on `VerificationToken`, and the
`PolicyAcceptance` table. It also reconciles the current schema-only `VerificationToken` fields with
the actual migration history. Existing users are preflighted for lowercased/trimmed collisions,
backfilled with `normalizedEmail` and `ACTIVE`, then protected by a unique index before application
code relies on it. Existing login tokens default to `LOGIN`; legacy users are not assigned invented
acceptance records. Application code remains compatible with all existing active users throughout
the rollout.

**Recovery Strategy**: The migration is additive and preserves existing account/session data. A
compatible application correction may be deployed after migration; reverting code never claims to
remove the new schema. Data or constraint defects are repaired with a forward corrective migration.
Before any collision remediation or incompatible correction, take and verify the existing logical
backup, restore into a fresh database/volume, deploy migrations, and switch traffic only after the
signup/login quickstart passes.

**Performance Goals**: Preserve the account-independent 500 ms plus 0-100 ms accepted-response
floor without adding artificial delay after it has elapsed; perform at most one SMTP attempt per
accepted submission; keep signup and activation database work bounded to one normalized email and
one short transaction; show pending feedback immediately and avoid layout movement.

**Constraints**: Raspberry Pi memory/CPU limits; no host-specific paths or IPs; portable to VPS;
no new container, queue, cache, password, OAuth provider, or implicit Auth.js user creation; login
serves active users only; pending accounts are retained; all public outcomes remain non-enumerating;
user-authorized development dummy English/Spanish/Catalan Terms and Privacy copy plus stable
`2026-08-18-draft` version IDs are product-owned static inputs and must remain visibly identified as
unreviewed development content; legal sufficiency is outside implementation scope.

**Scale/Scope**: Low-volume self-hosted application; three signup routes, two localized policy
destinations, one signup submission endpoint, one activation endpoint, one pending or active account
per normalized email, at most one current onboarding token per pending account, and one authoritative
signup acceptance record per activated account. Shared limits remain five attempts per client and
three per address in 15 minutes across login and signup.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Gate | Pre-Research Evaluation | Post-Design Evaluation |
|------------------|-------------------------|------------------------|
| I, III, IV - Portable Docker deployment and private data services | PASS - reuses the existing app/db/migrate topology and ingress; no host coupling or exposed service | PASS - contracts and data design add no service, port, network, or architecture-specific dependency |
| II - Operational boundaries | PASS - UI, API, signup domain logic, auth, and database work remain in the single full-stack app | PASS - no worker or frontend/backend split is introduced |
| V - Secrets | PASS - existing Auth/SMTP secrets remain runtime-injected; policy metadata is non-secret | PASS - token URLs and credentials are excluded from artifacts, contracts, and logs |
| VI - Persistence, backup, restore | PASS - an additive migration, collision preflight, forward correction, and verified restore are required | PASS - `data-model.md` defines constraints and `quickstart.md` validates migration and restore-sensitive behavior |
| VII - Minimal maintainable stack | PASS - uses current Next.js, Prisma, NextAuth, Nodemailer, next-intl, Zod, Pino, and test stack | PASS - purpose-tagged existing tokens avoid a parallel authentication/token subsystem and no runtime package is added |
| VIII - Health, logs, resource awareness | PASS - existing health and Pino/Docker logging remain; operations are bounded per email | PASS - only sanitized aggregate events are planned; no new long-running process or unbounded scan is introduced |
| IX - Reproducible CI/CD | PASS - current CI already covers migration, tests, production build, E2E, and images | PASS - quickstart uses repository scripts and adds focused tests under the existing commands |
| X - Security by default | PASS - spec defines CSRF, canonical origin, shared limits, response parity/floor, one-time links, session-conflict handling, and log hygiene | PASS - API contract and transaction model enforce validation order, atomic commit-order arbitration, no callback creation, and same public outcomes |
| XI - Specs before implementation | PASS - clarified specification contains lifecycle, non-goals, threats, recovery, and measurable outcomes | PASS - research, model, contracts, and validation guide trace the complete clarified scope |
| XII - Tests and verification | PASS - unit, component, integration, provider-boundary, and production-artifact browser checks are required | PASS - test ownership is explicit and critical auth/email behavior is not left to unit tests alone |

**Gate Result**: PASS before research and after design. No constitutional exception is required.

## Project Structure

### Documentation (this feature)

```text
specs/20260818-signup-page/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  This is the project's standard layout (Next.js App Router + Prisma + Docker),
  per the constitution. Adjust only the paths a feature actually adds or changes.
  Do NOT split frontend/backend — Next.js combines them in the `app` container
  (constitution Principle II). Organize business code by domain under
  src/modules/<domain>/; shared code stays in app/, components/, lib/, and server/.
-->

```text
src/
├── app/
│   ├── [locale]/
│   │   ├── signup/         # Public form plus invalid-link/session/recovery states
│   │   ├── terms/          # Product-owned localized Terms content
│   │   └── privacy/        # Product-owned localized Privacy Notice content
│   └── api/signup/
│       ├── route.ts        # CSRF/rate-limited uniform signup submission
│       └── activate/       # Session-safe onboarding wrapper around Auth.js callback
├── components/             # Existing shared UI and navigation controls
├── modules/
│   ├── login/              # Active-user-only login and shared response-floor behavior
│   └── signup/
│       ├── components/     # Localized accessible signup form
│       ├── schema.ts       # Exact input and normalization contracts
│       ├── service.ts      # Pending-account, token, email, and failure orchestration
│       ├── policy.ts       # Server-owned policy versions and localized destinations
│       ├── token.ts        # Raw token generation and Auth.js-compatible hashing
│       └── types.ts        # Public result and lifecycle types
├── lib/
│   ├── auth.ts             # Existing Auth.js provider/session configuration
│   ├── auth-adapter.ts     # Purpose-aware atomic token consumption/activation
│   ├── auth-csrf.ts        # Existing CSRF validation
│   ├── email.ts            # Existing SMTP transport/outcome boundary
│   └── shared-rate-limit.ts
└── messages/{en,es,ca}.json

prisma/
├── schema.prisma          # Data model
└── migrations/            # Versioned migrations
prisma.config.ts            # Prisma 7 config: the datasource URL lives here (required)

worker/                     # OPTIONAL: background/scheduled jobs (built as another Dockerfile target)
└── src/

tests/
├── unit/                   # Schema, form, routes, adapter, email, a11y, messages
├── integration/            # DB lifecycle, races, limits, activation/session boundary
└── e2e/                    # Production artifact: localized critical signup journey/layout

docker/
└── Dockerfile             # Multi-stage: builds the `app` and `migrate` (migrator) images

docker-compose.yml          # Dev: db only (run the app on the host with `pnpm dev`)
docker-compose.prod.yml     # Prod: app + migrate + db (no public db ports; log rotation)
.env.example                # Placeholder env vars (dev `.env`; also the prod Variables/Secrets reference)
```

**Structure Decision**: Production runs a single Next.js full-stack `app` container (UI + SSR + API
routes + Server Actions + auth), a one-shot `migrate` service that applies Prisma migrations before
`app` starts, and a `db` (PostgreSQL) service — wired through Docker Compose on `traefik_network`
(ingress) + `internal` (private) networks (`worker` optional). In development, `docker-compose.yml`
runs only the `db`; the app runs on the host via `pnpm dev`. Frontend and backend are intentionally
NOT split (constitution Principle II). Business behavior is organized in cohesive domain modules
under `src/modules/<domain>/`; cross-cutting infrastructure remains in `app`/`components`/`server`/
`lib` and is not duplicated into modules.

For this feature, signup lifecycle code is cohesive under `src/modules/signup`; only cross-cutting
Auth.js, SMTP, request-context, limiter, navigation, and shared UI behavior remains in existing
common modules. Signup submission is a separate public API and is never added as a mode of the login
endpoint. The activation wrapper delegates successful, purpose-validated onboarding tokens to the
existing Auth.js callback so cookie/session behavior continues to have one owner.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations or complexity exceptions are required.
