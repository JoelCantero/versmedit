# Implementation Plan: Unified Branded Transactional Emails

**Branch**: `20260824-branded-transactional-emails` | **Date**: 2026-08-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20260824-branded-transactional-emails/spec.md`

**Note**: This template is filled in by the `/speckit-plan` skill; its definition describes the execution workflow.

## Implementation summary

Add one pure React Email presentation layer before the existing provider-neutral delivery boundary.
The layer renders 12 strictly typed variants in English, Spanish, and Catalan from shared catalogue
copy and deployment-wide branding, producing both HTML and plain text without owning recipients,
credentials, business events, persistence, logging, or submission. Migrate the six existing email
wrappers to this renderer while preserving their URL decisions and compensation paths. Add six
future-only variants and an isolated 36-entry local catalogue with fictional fixtures and no
sending surface.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS

**Package Manager**: pnpm

**Primary Dependencies**: Next.js 16.3 App Router + React 19.2, Zod 4, Auth.js (NextAuth), Pino,
existing provider-neutral HTTP email boundary; add `@react-email/components` and
`@react-email/render` at runtime; reuse the existing Next.js development server for local preview

**Storage**: No feature storage or schema change; existing PostgreSQL credential lifecycle remains
unchanged

**Testing**: Vitest in Node/jsdom for catalogue, rendering, environment, architecture, escaping,
contrast, size, and provider payload contracts; existing PostgreSQL integration tests for six
business flows and exact-token compensation; Playwright and the fake provider fixture against the
production standalone artifact; Docker runner build; and automated responsive layout checks across
all locales, representative widths, logo states, brand colors, and long-content cases

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel -> Traefik

**Project Type**: Web application - single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Docker Compose; networks `traefik_network` (external ingress) + `internal` (private); services use `restart: unless-stopped`

**CI/CD**: GitHub Actions on a self-hosted runner

**Secrets**: dev uses a local `.env`; prod uses **no** `.env` file - non-sensitive config in GitHub **Variables**, secrets in GitHub **Secrets**, injected into the containers at deploy time. Never committed.

**Observability**: Healthcheck endpoint + structured logging (Pino -> stdout JSON) + Docker logs + log rotation

**Migration Strategy**: Application-only forward rollout. Configure global `BRAND_COLOR` and
`SUPPORT_EMAIL` Variables before deploying; `PROJECT_NAME` remains the shared product/legal
identity and `MAIL_LOGO_URL` remains optional. No Prisma migration, data rewrite, compatibility
window, or backup change is required.

**Recovery Strategy**: Invalid global branding fails application startup. Correct Variables
and restart, or roll back to the previous image; extra brand Variables are harmless to the old
release. Existing provisional credentials retain their current expiry and compensation behavior.

**Performance Goals**: Rendering performs no network or database I/O; one warmed render should have
p95 below 100 ms on the ARM64 target; all 36 fixture combinations should render within 5 seconds in
CI; both provider-adapter serializations of each completed fictional message remain below the
existing 1 MiB UTF-8 limit, and the existing HTTP boundary rejects oversize operational requests
before network submission

**Constraints**: Raspberry Pi app limit of 512 MiB; no new production service or long-lived process;
no host-specific path/IP; portable to VPS; email-safe inline presentation; locale-pure output; one
unique business-action destination where required; loopback-only local preview with no raw HTML
input, provider access, application logging, or production data; runtime packages must survive
Next.js standalone tracing

**Scale/Scope**: Exactly 12 variants x 3 locales = 36 preview combinations; six operational
variants continue to send one message per existing business request; no batch, campaign, queue,
retry, retained render, or multi-brand workload

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

| Principle | Status | Plan Evidence |
|-----------|--------|---------------|
| I. Docker-First, Portable | PASS | Brand settings are environment Variables; runtime packages support Node 24 on ARM64/amd64; Docker and standalone builds are release gates. |
| II. Operational Responsibility | PASS | Rendering stays in the existing app container; no preview, worker, or provider container is added. |
| III. Reverse Proxy and Isolation | PASS | No route, ingress, webhook, or public service is added; the separate local preview binds only to loopback during development. |
| IV. VPS Migration | PASS | No Pi-specific source path or API is introduced; dependencies and configuration are portable. |
| V. Secrets | PASS | New brand fields are non-secret GitHub Variables; existing provider secrets and handling remain unchanged. |
| VI. Persistence and Recovery | PASS | No storage change exists; rollout and image/config recovery are documented and require no data rollback. |
| VII. Minimal Stack | PASS | Two focused runtime packages implement rendering; preview reuses Next.js and React without new infrastructure, persistence, or production service boundaries. |
| VIII. Production Readiness | PASS | Startup validation fails closed; rendering has bounded payloads and safe fixed-category diagnostics with no content logging. |
| IX. Reproducible CI/CD | PASS | Lockfile, lint, typecheck, coverage, standalone E2E, dependency audit, and Docker image checks remain authoritative. |
| X. Security by Default | PASS | Strict variant inputs, URL/config validation, React escaping, no raw HTML, credential isolation, and a preview with no provider or action endpoint preserve the trust boundaries. |
| XI. Specs Before Implementation | PASS | The clarified specification and this plan precede task generation and implementation. |
| XII. Tests and Verification | PASS | Unit, integration, E2E, standalone, Docker, and automated layout checks cover the critical email flows. |

No constitutional violation requires a complexity exception.

### Post-Design Re-check

Phase 1 keeps every gate above at PASS: the logical data model adds no persistence, the contracts
preserve the existing delivery API and domain URL ownership, the preview contract creates no public
or sending interface, and the quickstart includes the complete automated release gate.

## Project Structure

### Documentation (this feature)

```text
specs/20260824-branded-transactional-emails/
|-- plan.md              # This file (/speckit-plan command output)
|-- research.md          # Phase 0 output (/speckit-plan command)
|-- data-model.md        # Phase 1 output (/speckit-plan command)
|-- quickstart.md        # Phase 1 output (/speckit-plan command)
|-- contracts/
|   |-- email-presentation.md
|   |-- preview-catalog.md
|   `-- runtime-configuration.md
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
emails/
|-- app/
|   |-- [locale]/[variant]/page.tsx # One display-only route over 36 static parameters
|   |-- globals.css
|   |-- layout.tsx
|   `-- page.tsx                 # Complete catalogue index
|-- components/
|   |-- preview-inspector.tsx
|   `-- viewport-control.tsx
|-- lib/
|   |-- preview-fixtures.ts      # Immutable public-brand overlay and fictional fixture values
|   `-- preview-manifest.ts      # Exact deterministic 36-entry manifest
|-- next-env.d.ts
|-- next.config.ts
|-- playwright.config.ts
`-- tsconfig.json                # Isolated preview project configuration

src/
|-- instrumentation.ts             # Validates runtime environment before serving requests
|-- lib/
|   |-- auth.ts                  # Login URL/recipient ownership; invokes presentation + delivery
|   |-- env.ts                   # Global brand and conditional provider startup validation
|   `-- email/
|       |-- index.ts             # Existing provider-neutral delivery boundary (contract unchanged)
|       |-- types.ts             # Existing TransactionalEmail and 1 MiB request bound
|       `-- presentation/
|           |-- brand.ts         # Normalized brand and contrast selection
|           |-- catalog.ts       # Typed 12-variant/3-locale catalogue selection
|           |-- components/
|           |   |-- email-action.tsx
|           |   `-- email-document.tsx
|           |-- constants.ts     # Closed locale and variant constants
|           |-- index.ts         # Presentation-only public exports
|           |-- render.tsx       # Pure HTML/plain-text rendering boundary
|           |-- types.ts         # Discriminated variant inputs and safe output
|           `-- templates/       # Variant-specific body composition only
|-- messages/
|   |-- en.json                  # Adds complete Email catalogue
|   |-- es.json
|   `-- ca.json
`-- modules/
  |-- signup/email.ts           # Activation and credential-free existing-account wrappers
  `-- account/
    |-- deletion/email.ts     # Existing deletion URL owner
    |-- security/email.ts     # Existing security URL owner
    `-- data-export/email.ts  # Existing export-confirmation URL owner

tests/
|-- unit/
|   |-- email-presentation.test.tsx
|   |-- email-preview-catalog.test.ts
|   |-- email-architecture.test.ts
|   `-- env.test.ts
|-- integration/                  # Existing login/signup/account flow and compensation suites
`-- e2e/                          # Production standalone flows against fake Brevo/Mailjet

package.json                       # Runtime/dev dependency split and email:dev script
pnpm-lock.yaml                     # Exact dependency resolution
.env.example                       # Required global and optional email brand settings
docker-compose.prod.yml            # Forwards brand settings to app only
.github/workflows/deploy.yml       # Validates/injects GitHub Variables
next.config.ts                     # Changed only if standalone evidence requires a narrow trace include
docker/Dockerfile                  # Existing standalone runner; no new stage or service
```

**Structure Decision**: Transactional presentation is cross-cutting infrastructure and therefore
lives under the existing `src/lib/email` boundary rather than being duplicated across signup and
account modules. Domain modules continue to own recipients, origins, tokens, and localized action
destinations. Production remains one Next.js `app` container plus the existing one-shot `migrate`
and PostgreSQL services; no worker or preview container is added. The top-level `emails/` directory
is a separate loopback-only development project that imports only pure presentation code plus
fictional fixtures and is not copied into the production runner. Static runtime imports keep Next.js
standalone tracing deterministic.

## Complexity Tracking

No violations. No complexity exception is required.
