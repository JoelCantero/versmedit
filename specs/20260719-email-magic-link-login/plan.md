# Implementation Plan: Email Magic Link Login

**Branch**: `20260719-email-magic-link-login` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20260719-email-magic-link-login/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a responsive, accessible, email-only login at `/login`, `/es/login`, and `/ca/login` for
existing users. Keep Auth.js v4's email callback and Prisma token compatibility, but wrap the native
email sign-in POST to validate and normalize input, consume the existing shared limits, perform a
server-only existing-user lookup, and return canonical public responses that do not disclose account
existence. Harden verification-token creation so each account has at most one pending link and an
isolated SMTP failure removes the new token. Reuse `RateLimitBucket` for a short-lived shared provider
availability marker, install the official shadcn `login-03` block, and adapt it to the project's
localized design and single-field flow without schema, migration, container, or SMTP-provider changes.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 26

**Package Manager**: pnpm

**Primary Dependencies**: Next.js 16.2 App Router, React 19.2, Tailwind CSS 4, shadcn CLI 4.13.1 / Base UI, next-intl 4.13, next-themes 0.4, NextAuth 4.24, Prisma 7.8, Zod 4.4, Nodemailer 9.0, Pino 10.3

**Storage**: PostgreSQL via Prisma; existing `User`, `VerificationToken`, and `RateLimitBucket` tables only

**Testing**: Vitest 4 + jsdom + Testing Library for component/unit tests; `axe-core` as a direct development dependency for automated DOM accessibility checks; Vitest node integration tests against PostgreSQL for request, token, callback, and shared-limit behavior; and controlled Nodemailer outcomes for deterministic integration coverage. No feature-specific browser E2E test is added.

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel → Traefik

**Project Type**: Web application — single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Docker Compose; networks `traefik_network` (external ingress) + `internal` (private); services use `restart: unless-stopped`

**CI/CD**: GitHub Actions on a self-hosted runner

**Secrets**: dev uses a local `.env`; prod uses **no** `.env` file — non-sensitive config in GitHub **Variables**, secrets in GitHub **Secrets**, injected into the containers at deploy time. Never committed.

**Observability**: Healthcheck endpoint + structured logging (Pino → stdout JSON) + Docker logs + log rotation

**Migration Strategy**: N/A — no schema or data migration. Application rollout reuses compatible existing tables and keys provider state under a reserved `auth:email:provider:*` namespace.

**Recovery Strategy**: Revert application code. No persistent schema conversion occurs; rate-limit/provider-state rows expire naturally and outstanding verification tokens expire within 15 minutes. If rollback follows a partially handled delivery failure, stale tokens are removed by the new compensation path or expire under the existing TTL.

**Performance Goals**: Login page and navigation have no horizontal overflow at 375×667 and 1440×900; required controls remain inside the viewport and the reserved login status region keeps stable dimensions. Accepted valid-email outcomes do not return before their request-start-relative floor of 500 ms plus selected 0–100 ms jitter under a controlled clock; SMTP or other processing may legitimately exceed 600 ms. Request processing adds the existing client/address limiter operations plus one case-insensitive user lookup before SMTP. No absolute timing-indistinguishability target.

**Constraints**: Raspberry Pi memory/CPU limits; no host-specific paths/IPs; portable to VPS; public endpoint; emails/tokens/URLs/SMTP credentials excluded from logs; canonical-origin callbacks only; five client and three normalized-address attempts per 15 minutes; 15-minute single-use newest-only links; no account creation; no feature E2E; no schema/migration or SMTP-provider changes

**Scale/Scope**: Three localized login routes, one email field, eight login UI states, one wrapped Auth.js request endpoint, one Auth.js callback path, existing-user accounts only, shared PostgreSQL coordination across all application replicas, and one localized home navigation shell with session-aware account actions, locale selection, and persistent system-aware theming. Completion scope also replaces application-facing branding with Nextself and moves development seed identity to environment variables.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-design gate: PASS**

- **I–IV, VI–VIII (operations/portability)**: No services, networks, volumes, host assumptions, or
  deployment topology changes. Existing PostgreSQL, health, Pino stdout logging, and Docker runtime
  remain authoritative.
- **V (secrets)**: SMTP credentials, verification tokens, URLs, and session material stay in existing
  runtime configuration and trusted server boundaries; no secret is added to source or logs.
- **IX (reproducibility)**: The feature uses pinned repository dependencies and existing lint,
  typecheck, test, build, integration, and smoke-test commands.
- **X (security)**: The endpoint is intentionally public; input is server-validated; account lookup
  is server-only; callbacks are same-origin; shared client/address limits and trusted proxy identity
  remain enforced; public known/unknown responses are canonicalized; token replay and replacement are
  handled atomically.
- **XI (specs first)**: The clarified spec defines scope, non-goals, privacy, abuse cases, failure
  states, measurable acceptance criteria, and the cross-cutting authentication shell/seed completion
  work represented by the implementation tasks.
- **XII (verification)**: Component and PostgreSQL integration coverage verifies the critical auth
  flow and provider boundary. The repository's existing production-artifact smoke remains unchanged;
  no feature-specific E2E is added as explicitly required by the feature spec.
- **Internationalization**: UI text comes from `src/messages/{en,es,ca}.json`; pages live below
  `src/app/[locale]`; locale-aware navigation/callbacks preserve default-prefix behavior.
- **Database rules**: No schema change. Existing indexed/unique fields and expiring shared-state rows
  are reused; rollback does not imply data reversal.

**Post-design gate: PASS**

- `research.md` resolves endpoint ownership, CSRF parity, account privacy, provider-state lifetime,
  exact-token compensation, PostgreSQL concurrency, localization, accessibility, and recovery without
  introducing unresolved decisions.
- `data-model.md` preserves the existing Prisma schema and defines application invariants and state
  transitions for users, tokens, limits, provider availability, locale, requests, and UI.
- `contracts/magic-link-login.md` makes public outcomes testable, keeps API routes unlocalized,
  validates CSRF before account lookup, constrains callbacks to the canonical origin, and exposes no
  PII or account-existence signal.
- `quickstart.md` provides component, accessibility, unit, PostgreSQL integration, lint, typecheck,
  test, and build validation. It adds no feature-specific E2E and retains the existing repository
  smoke gate.
- Deployment remains one application container plus the existing database/migrator topology; no
  schema, migration, SMTP provider, secret, variable, worker, cache, or recovery-procedure change is
  required.

The technical design remains constitution-compliant with no tracked exception.

## Project Structure

### Documentation (this feature)

```text
specs/20260719-email-magic-link-login/
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
│   ├── [locale]/login/
│   │   ├── page.tsx                    # localized login page and metadata
│   │   └── error/page.tsx              # generic invalid-link recovery UI
│   ├── api/auth/[...nextauth]/route.ts # wrapped Auth.js request + native callbacks
│   └── globals.css                     # shadcn tokens adapted to project design
├── components/
│   ├── app-navigation.tsx              # account, locale, theme, and responsive grouping
│   ├── theme-provider.tsx               # CSP-aware next-themes integration
│   └── ui/                              # generated shadcn primitives used by login and navigation
├── lib/
│   ├── auth.ts                         # provider, delivery, locale redirects
│   ├── auth-adapter.ts                 # existing-user + newest-token invariants
│   ├── auth-csrf.ts                    # compatible double-submit prevalidation
│   ├── shared-rate-limit.ts            # existing shared counters
│   └── provider-availability.ts        # expiring shared SMTP availability state
├── messages/{en,es,ca}.json            # login text and exact generic response
└── modules/login/
  ├── components/login-form.tsx       # accessible client state machine
  ├── schema.ts                       # shared email/locale validation and normalization
  ├── service.ts                      # server-only lookup/public response policy
  └── verification-context.ts         # per-request token/delivery compensation context

tests/
├── unit/
│   ├── login-form.test.tsx
│   ├── login-service.test.ts
│   ├── auth-route.test.ts
│   ├── auth-adapter.test.ts
│   └── provider-availability.test.ts
│   └── app-navigation.test.tsx
└── integration/
  └── magic-link-login.test.ts        # PostgreSQL token/request/callback flow

components.json                         # shadcn generator configuration
prisma/seed.mjs                         # environment-driven development identity
prisma/schema.prisma                    # unchanged
docker-compose*.yml                     # unchanged
```

**Structure Decision**: Keep one Next.js full-stack application. Login-specific validation, public
response policy, request coordination, and UI live in `src/modules/login`; shared Auth.js adapter,
provider, rate-limit, and database infrastructure remain in `src/lib`; routes stay in `src/app`.
Use `pnpm dlx shadcn@4.13.1 add login-03` as required for the official visual baseline, retain only
primitives the adapted email-only page needs, and do not create a worker, auth microservice, custom
token table, or second public API.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations.
