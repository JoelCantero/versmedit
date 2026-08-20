# Implementation Plan: Transactional Email HTTP Providers

**Branch**: `20260819-http-email-providers` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/20260819-http-email-providers/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Replace Nodemailer/SMTP with a server-only transactional-email boundary that selects Brevo or
Mailjet from validated runtime configuration, builds provider-specific HTTP requests, and returns
one redacted normalized result to the existing login and signup domain flows. Preserve current
anti-enumeration, response-floor, token invalidation, localization, and account-lifecycle behavior;
make one bounded provider attempt per operation; derive fixed official endpoints from
`MAIL_PROVIDER`; replace `AUTH_EMAIL_ENABLED` with the global `MAIL_ENABLED` gate; and retain only
structured outbound-send logs, with no webhooks, delivery persistence, worker, fallback, or schema
change. Remove Nodemailer and SMTP wiring after development and production smoke verification.

## Technical Context

<!--
  These defaults reflect the project's standard stack (see the constitution at
  .specify/memory/constitution.md). Keep them unless a feature has a justified
  reason to differ; fill feature-specific values during /speckit.plan.
-->

**Language/Version**: TypeScript 5.x on Node.js 24 LTS

**Package Manager**: pnpm

**Primary Dependencies**: Next.js 16.2.11 (App Router), React 19.2.8, Auth.js (NextAuth) 4.24.15, Zod 4.4.3, Prisma 7.9.1, Pino 10.3.1, and Node's built-in WHATWG `fetch`/`AbortSignal`; Nodemailer 9.0.5 and its types are removed after migration verification

**Storage**: PostgreSQL (via Prisma)

**Testing**: Vitest 4.1 with unit, contract, and PostgreSQL-backed integration suites, including a concurrent database-backed provider-health lock race; a controlled local HTTP fake injected through a test-only transport boundary; Playwright 1.62 production-artifact/E2E smoke coverage; redacted development and production smoke sends against the selected real provider before SMTP cleanup

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel → Traefik

**Project Type**: Web application — single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Docker Compose; networks `traefik_network` (external ingress) + `internal` (private); services use `restart: unless-stopped`

**CI/CD**: GitHub Actions on a self-hosted runner

**Secrets**: dev uses a local `.env`; prod uses **no** `.env` file — non-sensitive config in GitHub **Variables**, secrets in GitHub **Secrets**, injected into the containers at deploy time. Never committed.

**Observability**: Healthcheck endpoint + structured logging (Pino → stdout JSON) + Docker logs + log rotation

**Migration Strategy**: Forward-only application/configuration rollout with no schema migration: deploy the HTTP-capable artifact with `MAIL_*` configuration while legacy SMTP secrets remain provisioned but unread, verify login and signup against the selected provider in development and production, then remove Nodemailer, SMTP test fixtures, `SMTP_*`/`AUTH_EMAIL_ENABLED` wiring, and legacy secrets

**Recovery Strategy**: Before cleanup, revert to the last SMTP-capable artifact using still-provisioned legacy credentials; after cleanup, correct/rotate `MAIL_*` configuration or deploy a compatible forward fix. No data restore or reverse migration is required because this feature stores no delivery state and changes no schema

**Performance Goals**: Preserve the existing 500 ms plus 0-100 ms jitter minimum for accepted valid-email responses; after two warm-ups, at least 19 of 20 sequential requests for each login/signup and Brevo/Mailjet combination complete within 5 seconds against the immediate-accept controlled provider with pre-warmed health state and no outlier exclusions; bound each provider send attempt to 2,500 ms and each provider-health probe to 1,500 ms

**Constraints**: Raspberry Pi memory/CPU limits; no host-specific paths/IPs; portable to VPS; one provider attempt per business operation; no SMTP/provider fallback, retry, worker, webhook, delivery persistence, client-selectable endpoint, or runtime base-URL override; logs exclude recipients, account identifiers, credentials, tokens, URLs, subjects, bodies, and raw provider payloads; provider health uses a recipient-independent authenticated metadata probe cached for 60 seconds and coordinated across app instances through PostgreSQL

**Scale/Scope**: One selected provider per application instance; three existing transactional message paths (magic-link login, signup onboarding/activation, and existing-account notice) across English, Spanish, and Catalan; current single-app deployment and shared PostgreSQL rate-limit state; no bulk or marketing delivery

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I / IV — Docker portability**: PASS. All provider selection and credentials remain runtime
  environment configuration; fixed provider endpoints contain no host-specific deployment values;
  no new container or architecture-specific dependency is introduced.
- **II / VII — Operational responsibility and minimal stack**: PASS. Synchronous bounded HTTP
  delivery remains in the existing Next.js app because the public flows already await one delivery
  result for token invalidation. Native Node HTTP APIs avoid a provider SDK, queue, or worker.
- **III — Network isolation**: PASS. The app makes outbound HTTPS calls only to the official endpoint
  selected by `MAIL_PROVIDER`; no inbound provider route or new exposed service is added.
- **V / X — Secrets and security**: PASS. API credentials stay server-only and use GitHub Secrets;
  non-sensitive settings use GitHub Variables. Fixed endpoints prevent credential exfiltration by
  URL override, public responses remain anti-enumerating, and individual sends cannot alter public
  provider health.
- **VI — Persistence and recovery**: PASS. No product data or schema changes are introduced;
  existing backup/restore remains unchanged and rollback is an application/configuration concern.
- **VIII — Observability**: PASS. Pino emits allowlisted structured submission metadata to stdout;
  recipient data, credentials, links, content, and raw provider data are prohibited. Acceptance is
  never labeled delivery.
- **IX / XII — Reproducibility and verification**: PASS. The plan includes unit, provider-contract,
  integration, E2E, coverage, audit, production-build, Docker-build, and real-provider smoke checks.
- **XI — Specification first**: PASS. The clarified spec defines behavior, security boundaries,
  migration, edge cases, and measurable acceptance before implementation planning.

**Pre-design gate result**: PASS. No constitution violations require justification.

## Project Structure

### Documentation (this feature)

```text
specs/20260819-http-email-providers/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
├── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
└── verification.md      # Redacted migration and release-gate evidence created during implementation
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
├── app/api/auth/[...nextauth]/route.ts  # Existing public login response/health gate
├── app/api/signup/route.ts              # Existing signup response/health gate
├── lib/
│   ├── auth.ts                           # Auth.js email-provider integration
│   ├── env.ts                            # MAIL_ENABLED/provider configuration validation
│   ├── logger.ts                         # Existing redacted Pino logger
│   ├── provider-availability.ts          # Recipient-independent shared health state
│   ├── email.ts                          # Legacy SMTP boundary removed after consumer cutover
│   └── email/                            # Shared server-only transactional transport
│       ├── index.ts                      # Provider selection and public boundary
│       ├── types.ts                      # Input/result/provider contracts
│       ├── http.ts                       # One-attempt bounded native-fetch primitive
│       ├── brevo.ts                      # Brevo request/response adapter
│       └── mailjet.ts                    # Mailjet request/response adapter
└── modules/signup/
  ├── email.ts                          # Existing localized signup message builders/consumer
  └── service.ts                        # Existing signup token confirmation/compensation rules

tests/
├── helpers/http-mail-provider.ts         # Controlled local HTTP fake/test transport
├── helpers/smtp-server.ts                # Legacy SMTP fixture removed after production verification
├── unit/                                 # Config, adapters, classification, logging, consumers
├── integration/                          # Login/signup + DB + controlled provider boundary
└── e2e/
  └── helpers/
      ├── provider-http-fixture.ts        # Provider fake + inspection control API
      ├── provider-fetch-preload.mjs      # Exact-URL interception in isolated app process
      └── smtp-fixture-server.ts          # Legacy E2E fixture removed after production verification

.github/workflows/deploy.yml              # Repository Variables/Secrets injection
.env.example                              # Safe MAIL_* placeholders and classification
docker-compose.prod.yml                   # Runtime MAIL_* pass-through
README.md                                 # Provider setup, staged migration, smoke/recovery runbook
scripts/test-e2e.sh                       # Controlled provider fixture process lifecycle
playwright.config.ts                      # Isolated preload and MAIL_* E2E runtime configuration
package.json / pnpm-lock.yaml / pnpm-workspace.yaml
                                           # Remove Nodemailer and SMTP fixture dependencies/override
```

**Structure Decision**: Keep the existing single Next.js `app` container and PostgreSQL service.
Create one shared server-only `src/lib/email/` infrastructure boundary because transport selection,
credential handling, redaction, and provider adapters are cross-cutting; keep localized signup
composition in its existing domain module and Auth.js integration in `src/lib/auth.ts`. The test-only
HTTP substitution enters through an injected internal request function for Vitest and an exact-URL
Node preload in the isolated Playwright app process, never an application environment URL.
No worker, webhook route, Prisma model, migration, or administrative UI is added.

## Post-Design Constitution Check

- **I / IV - Docker portability**: PASS. The data model adds no host path, architecture-specific
  dependency, service, or schema migration; both provider and health endpoints are portable HTTPS
  constants selected from runtime configuration.
- **II / VII - Operational responsibility and minimal stack**: PASS. The contracts keep one
  synchronous bounded attempt in the existing app and use native fetch plus the existing PostgreSQL
  table. No SDK, queue, worker, scheduler, webhook, or cache service is introduced.
- **III - Network isolation**: PASS. Only fixed outbound provider endpoints are added. The E2E
  preload is test-process-only, exact-URL allowlisted, and absent from production configuration;
  no public route or container port is added.
- **V / X - Secrets and security**: PASS. The configuration and HTTP contracts keep credentials in
  provider-required headers, disable redirect following, reject endpoint overrides, preserve the
  pre-account health gate, and define strict response-size and log allowlists.
- **VI - Persistence and recovery**: PASS. `data-model.md` confirms no delivery persistence or
  migration. Existing `RateLimitBucket` rows hold only provider-scoped operational state, and
  rollback remains application/configuration-only.
- **VIII - Observability**: PASS. Contracts distinguish provider acceptance from delivery and permit
  only normalized, non-personal structured fields. Health and send bodies are discarded or bounded
  and never logged.
- **IX / XII - Reproducibility and verification**: PASS. `quickstart.md` defines controlled Brevo
  and Mailjet contract matrices, cross-process E2E substitution, domain-security comparisons,
  quality gates, real-provider smoke checks, cleanup, and rollback.
- **XI - Specification first**: PASS. All Phase 0 decisions are recorded in `research.md`; Phase 1
  entities and interfaces trace directly to the clarified requirements without unresolved markers.

**Post-design gate result**: PASS. No constitution violation or additional complexity exception is
required.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
