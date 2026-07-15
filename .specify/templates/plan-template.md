# Implementation Plan: [FEATURE]

**Branch**: `[YYYYMMDD-HHMMSS-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[YYYYMMDD-HHMMSS-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  These defaults reflect the project's standard stack (see the constitution at
  .specify/memory/constitution.md). Keep them unless a feature has a justified
  reason to differ; fill feature-specific values (or mark NEEDS CLARIFICATION)
  during /speckit.plan.
-->

**Language/Version**: TypeScript 5.x on Node.js 24 LTS

**Package Manager**: pnpm

**Primary Dependencies**: Next.js (App Router) + React, Tailwind CSS, Prisma, Zod, Auth.js (NextAuth), Pino (structured logging) [+ feature-specific dependencies; add Nodemailer/SMTP only when the spec enables email authentication]

**Storage**: PostgreSQL (via Prisma)

**Testing**: Vitest + jsdom + Testing Library (unit/component); Playwright for production-artifact smoke tests and feature-specific E2E. Authentication features MUST test the selected real provider boundary; the template does not emulate SMTP.

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel → Traefik

**Project Type**: Web application — single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Docker Compose; networks `traefik_network` (external ingress) + `internal` (private); services use `restart: unless-stopped`

**CI/CD**: GitHub Actions on a self-hosted runner

**Secrets**: dev uses a local `.env`; prod uses **no** `.env` file — non-sensitive config in GitHub **Variables**, secrets in GitHub **Secrets**, injected into the containers at deploy time. Never committed.

**Observability**: Healthcheck endpoint + structured logging (Pino → stdout JSON) + Docker logs + log rotation

**Migration Strategy**: [Forward-only schema/application rollout, compatibility window, and corrective migration plan; or N/A]

**Recovery Strategy**: [Verified backup/restore procedure for destructive or incompatible changes; never assume reverting code reverses data]

**Performance Goals**: [domain-specific per feature, e.g., p95 API < 200ms on Raspberry Pi or NEEDS CLARIFICATION]

**Constraints**: Raspberry Pi memory/CPU limits; no host-specific paths/IPs; portable to VPS [+ feature-specific or NEEDS CLARIFICATION]

**Scale/Scope**: [domain-specific per feature, e.g., expected users/records/screens or NEEDS CLARIFICATION]

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
specs/[YYYYMMDD-HHMMSS-feature-name]/
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
├── app/                    # Next.js App Router: UI, layouts, pages
│   ├── api/                # Route handlers (REST/webhooks/health)
│   └── globals.css         # Tailwind/global styles
├── components/             # Shared React components (UI primitives)
├── modules/                # Business domains (<domain>/{components,actions,services,types})
├── server/                 # Server-only logic (never imported by client)
│   ├── actions/            # Server Actions
│   └── services/           # Domain/business logic
├── lib/                    # Shared utilities
│   ├── auth.ts             # Auth.js (NextAuth) config
│   ├── db.ts               # Prisma client singleton (imports @/generated/prisma/client)
│   └── validation/         # Zod schemas
└── generated/
    └── prisma/             # Generated Prisma client (gitignored; run `prisma generate`)

prisma/
├── schema.prisma          # Data model
└── migrations/            # Versioned migrations
prisma.config.ts            # Prisma 7 config: the datasource URL lives here (required)

worker/                     # OPTIONAL: background/scheduled jobs (built as another Dockerfile target)
└── src/

tests/
├── unit/                  # Vitest unit tests
├── integration/           # API/route + DB integration tests
└── e2e/                   # Playwright (optional)

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

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
