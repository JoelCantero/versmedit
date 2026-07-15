<!--
SYNC IMPACT REPORT
==================
Version change: 1.6.1 → 1.6.2 (clarification)
Ratified: 2026-07-10 | Last amended: 2026-07-14

1.6.2 — Clarified that the template's reference deployment targets a self-hosted ARM64 Raspberry
Pi while derived applications may select another Docker-compatible host without weakening the
portability, security, or operational requirements.

1.6.1 — Clarified that the reusable template does not emulate SMTP or prescribe account creation;
the first authentication spec must separate registration from existing-user authentication and
define provider-specific integration tests before email sign-in is enabled.

1.6.0 — Made SpecKit compliance and coverage thresholds authoritative CI checks; required canonical
authentication origins and integration/E2E verification of enabled authentication flows.

1.5.0 — Expanded the authoritative CI gate to include production dependency auditing and an E2E
smoke test for deployable HTTP applications; clarified that critical public flows require
integration or E2E coverage rather than unit tests alone.

1.4.0 — Made CI the authoritative lint/typecheck/test/build merge gate while retaining the local
quality hook for fast feedback; distinguished template obligations from derived-application
decisions; added explicit threat/abuse analysis, timestamp feature identifiers, forward-only
migration and recovery requirements, and a mandatory post-implementation compliance hook.

1.3.1 — Clarified Principle XII: each meaningful feature includes automated tests derived from its
verification strategy; manual-only verification requires an explicit justification in the plan.
Synchronized plan/tasks templates with domain modules and TypeScript paths, and added a task-review
gate before implementation.
1.3.0 — Adopted Pino as the standard for structured application logging: added Pino to
Principle VII (Minimal, Boring, Maintainable Stack) and to Default Technology Choices; strengthened
Principle VIII to require structured JSON logs to stdout with secret/PII redaction and no
in-container log files; expanded the Observability Rules to describe the stdout → host collector →
aggregator flow while keeping the app infrastructure-agnostic.
1.2.1 — Clarified Principle IX: the pre-PR quality gate (lint/typecheck/tests) runs only through the
local `speckit.quality-gate` after_implement hook, never in CI; CI and the deploy pipeline stay
build + deploy only.
1.2.0 — Added the "Internationalization (i18n)" section: apps are multilingual by default (English
at `/`, Spanish at `/es`, Catalan at `/ca`) via the next-intl middleware and `src/app/[locale]/`
routing; added next-intl to Default Technology Choices.
1.1.3 — Made domain-module organization explicit in the Standard Project Architecture section:
applications MUST default to domain-based modules rather than a purely layer-based structure.
1.1.2 — Clarified Principle IX: the pre-PR quality gate runs via the Spec Kit `speckit.quality-gate`
after_implement hook (moved out of the `predev` script); CI and the deploy pipeline stay build +
deploy only.
1.1.1 — Clarified Principle I (VPS migration recreates env vars/secrets at runtime; production uses
no committed or host `.env` file) and Principle IX (lint/typecheck/tests run as a pre-PR gate,
locally or in CI; the deploy pipeline handles build + deploy).
1.1.0 — Added "Code Organization (within the `app`)" guidance under Standard Project
Architecture: default layer-based structure; grow into feature modules; shared stays shared.
1.0.0 — Initial ratification of the principles and sections listed below.

Principle set (template's 5 generic placeholders → 12 concrete principles):
  I.    Docker-First, Portable by Default
  II.   Separate by Operational Responsibility, Not by Artificial Layers
  III.  Reverse Proxy and Network Isolation Are Mandatory
  IV.   VPS Migration Must Be a Design Constraint
  V.    Secrets Must Never Be Committed
  VI.   Data Persistence, Backups, and Restore Are First-Class Features
  VII.  Minimal, Boring, Maintainable Stack
  VIII. Production Readiness Requires Health, Logs, and Resource Awareness
  IX.   CI/CD Must Be Reproducible
  X.    Security by Default
  XI.   Specs Before Implementation
  XII.  Tests and Verification Are Required

Added sections:
  - Purpose
  - Standard Project Architecture
  - Default Technology Choices
  - Deployment Rules
  - Database Rules
  - Worker Rules
  - Observability Rules
  - Raspberry Pi Constraints
  - VPS Migration Checklist

Removed sections:
  - Generic [SECTION_2_NAME] / [SECTION_3_NAME] template placeholders (superseded)

Template sync status:
  ✅ .specify/templates/plan-template.md — synchronized with domain modules under src/modules
  ✅ .specify/templates/spec-template.md — added Non-Goals, Security & Privacy Implications, Operational Impact (Principles X, XI); updated for the logging change (structured-logging Observability prompt + Log hygiene bullet)
  ✅ .specify/templates/tasks-template.md — TypeScript/domain paths; automated tests required unless the plan explicitly justifies manual-only verification
  ✅ .specify/templates/checklist-template.md — generic; no changes required
  ✅ README.md — updated for the logging change (Pino added to the Stack list)

Deferred TODOs: none
-->

# Constitution

## Purpose

This constitution defines the non-negotiable engineering principles for web applications built for
self-hosted Docker environments, initially deployed on a Raspberry Pi and designed to be portable to
a VPS or cloud host later.

The goal is to build small, maintainable, secure, production-capable web applications that can run
reliably on constrained infrastructure without becoming tightly coupled to that infrastructure.

## Applicability: Template vs. Derived Applications

This repository is a reusable baseline, not a finished product. The template MUST provide working,
secure defaults, extension points, validation examples, and operational documentation. It MAY omit
product-specific feature artifacts until a real feature is specified.

The template's reference deployment targets a self-hosted ARM64 Raspberry Pi. Derived applications
MAY select another Docker-compatible host while preserving all portability, security, and
operational requirements in this constitution.

Every derived application MUST replace template identifiers and placeholders, select its actual
domain and deployment values, and document product-specific security, data, scale, availability,
and recovery requirements. Conditional capabilities such as SMTP, workers, queues, or external
monitoring become mandatory only when the derived application's requirements need them. The
constitution's security, verification, portability, and data-protection rules always apply.

The template MUST NOT treat successful authentication as implicit account registration. A derived
application's first authentication spec MUST define registration fields and validation separately,
state which existing users may authenticate, and add integration or E2E coverage for the selected
provider before enabling that authentication flow.

## Core Principles

### I. Docker-First, Portable by Default

Every application MUST be runnable through Docker Compose. The project MUST NOT depend on
machine-specific paths, hostnames, local IPs, or Raspberry Pi-only assumptions unless explicitly
isolated in environment configuration.

Required:

- Provide a `docker-compose.yml` for local/development usage when needed.
- Provide a `docker-compose.prod.yml` or a clearly documented production compose profile.
- All runtime configuration MUST come from environment variables.
- Persistent data MUST use named volumes or explicitly documented bind mounts.
- The application MUST be movable to a VPS by copying the repository and compose files, recreating
  its environment variables and secrets on the target host (production injects them at runtime — no
  `.env` file is committed or written to the host), and restoring volumes/backups.

Avoid:

- Hardcoded paths such as `/home/k4nts/...` inside application code.
- Hardcoded domains, local IPs, or machine names.
- Manual server steps that are not documented.

**Rationale**: Portability and reproducibility are only guaranteed when the runtime is fully
described by the repository and its environment, never by the host it happens to run on.

### II. Separate by Operational Responsibility, Not by Artificial Layers

Containers MUST be separated by operational responsibility. A strict "frontend container + backend
container + database container" split is NOT required when the chosen framework naturally combines
frontend and backend capabilities.

For Next.js applications, one application container MAY include: React UI, SSR / Server Components,
API routes, Server Actions, authentication, Backend-for-Frontend logic, and WebSocket/SSE endpoints
when appropriate.

Separate containers are REQUIRED when responsibilities differ operationally:

- `app`: main web application and HTTP/API entrypoint.
- `worker`: background jobs, queues, async processing, scheduled work.
- `db`: database.
- `cache` or `queue`: only when justified by requirements.
- `reverse-proxy`: shared infrastructure such as Traefik.

The default application shape SHOULD be:

```
app
db
worker (optional)
```

**Rationale**: Operational boundaries (lifecycle, scaling, failure isolation) are the meaningful
seams; artificial layer splits add ceremony without operational value.

### III. Reverse Proxy and Network Isolation Are Mandatory

Public traffic MUST enter through a shared reverse proxy layer. The standard ingress pattern is:

```
Cloudflare Tunnel or public DNS
→ Traefik
→ application container
→ internal services
```

Requirements:

- Only the application entrypoint SHOULD be reachable from Traefik.
- Databases MUST NEVER be exposed publicly.
- Workers MUST NOT expose public ports.
- Each application MUST use an internal Docker network for private service communication.
- Apps exposed through Traefik MUST declare explicit labels.
- If a container is attached to multiple networks, Traefik's Docker network MUST be explicitly set.

Recommended network pattern:

```
traefik_network   external shared ingress network
internal          private per-application network
```

**Rationale**: A single controlled ingress and private internal networks minimize attack surface and
prevent accidental exposure of stateful services.

### IV. VPS Migration Must Be a Design Constraint

Every project MUST be designed so it can move from Raspberry Pi to VPS with minimal changes. A
successful migration SHOULD require only:

1. Installing Docker and Docker Compose on the target host.
2. Copying the repository or deployment directory.
3. Copying environment variables and secrets.
4. Restoring database backups or copying volumes.
5. Creating the required Docker networks.
6. Running Docker Compose.
7. Updating DNS or Cloudflare Tunnel routing.

The application MUST NOT assume: ARM64-only behavior, Raspberry Pi-specific paths, local home-network
IPs, a specific Linux username, or a specific hostname. When architecture-specific images are used,
the reason MUST be documented.

**Rationale**: Treating migration as a design constraint from day one prevents the accumulation of
host-specific coupling that is expensive to unwind later.

### V. Secrets Must Never Be Committed

Secrets MUST NEVER be committed to Git. This includes database passwords, API keys, SMTP
credentials, OAuth secrets, JWT/Auth secrets, HMAC secrets, cloud provider service account JSON, and
private certificates or tokens.

Requirements:

- Provide `.env.example` with safe placeholder values.
- Use `.env` for local runtime values.
- Use GitHub Secrets or another secret manager for CI/CD.
- GitHub repository Variables MAY only contain non-sensitive values.
- Production secrets MUST be injected at runtime, not baked into Docker images.
- Service account files MUST be mounted read-only when file-based credentials are required.

**Rationale**: Committed secrets are effectively permanent and public; runtime injection keeps the
blast radius of a leak small and recoverable.

### VI. Data Persistence, Backups, and Restore Are First-Class Features

Any application with a database MUST define a backup and restore strategy before being considered
production-ready.

Requirements:

- Database data MUST live in persistent volumes or documented bind mounts.
- A backup command or script MUST be provided.
- A restore command or procedure MUST be documented.
- Backups MUST be portable to another host.
- Production deployment notes MUST identify where persistent data lives.
- If using PostgreSQL or MySQL/MariaDB, prefer logical backups for portability.

No project is production-ready until restore has been tested at least once.

**Rationale**: Backups that have never been restored are unproven; data durability is a feature, not
an afterthought.

### VII. Minimal, Boring, Maintainable Stack

Prefer boring, well-supported technology over unnecessary complexity.

Default stack for modern web applications: TypeScript; Next.js when SSR, auth, APIs, or full-stack
React are useful; PostgreSQL for relational data; Prisma or a similarly documented data access layer;
Docker Compose for deployment; Traefik for routing; Cloudflare Tunnel when running behind a home
network; GitHub Actions for CI/CD; Pino for structured application logging.

Avoid adding infrastructure unless justified:

- Do NOT add Kubernetes for small self-hosted apps.
- Do NOT add Redis unless caching, queues, rate limiting, or pub/sub needs require it.
- Do NOT add a message broker unless database-backed jobs are insufficient.
- Do NOT split frontend and backend unless operationally useful.
- Do NOT introduce microservices prematurely.

**Rationale**: On constrained infrastructure, every added component costs memory, operational
attention, and failure modes; boring technology maximizes reliability per watt.

### VIII. Production Readiness Requires Health, Logs, and Resource Awareness

Every production container SHOULD have basic operational safeguards.

Requirements:

- Main application containers MUST expose a health endpoint when practical.
- Compose files SHOULD define healthchecks for app and database services.
- Logs MUST be available through Docker logs.
- Production compose files SHOULD include log rotation.
- Application logs MUST be structured JSON emitted to stdout/stderr via Pino; the app MUST NOT write
  log files inside the container.
- Logs MUST NOT contain secrets or PII; sensitive fields MUST be redacted at the logger.
- Resource limits SHOULD be considered for Raspberry Pi deployments.
- Long-running workers MUST fail safely and restart cleanly.
- Services MUST use `restart: unless-stopped` unless there is a documented reason not to.

For Raspberry Pi deployments, memory and CPU constraints MUST be considered part of the architecture.

**Rationale**: Constrained hosts fail in ways that only surface under load; health, logs, and limits
make failures observable and recoverable rather than silent.

### IX. CI/CD Must Be Reproducible

Deployment MUST be repeatable from Git.

Requirements:

- Builds MUST be reproducible from the repository.
- CI MUST run lint, typecheck, automated tests, and a production build for every pull request.
- CI MUST audit production dependencies and fail on high or critical known vulnerabilities.
- CI MUST enforce configured coverage thresholds and validate every existing SpecKit feature.
- Deployable HTTP applications MUST run an E2E smoke test against the production artifact in CI.
- The local `speckit.quality-gate` after_implement hook SHOULD repeat lint, typecheck, and tests
  before opening a PR to provide early feedback; CI remains the authoritative merge gate.
- Deployment SHOULD be automated through GitHub Actions or a documented command.
- The deployment process MUST NOT require undocumented manual edits on the server.
- Build artifacts and generated files MUST NOT be manually copied unless documented.
- Production deployments MUST NOT depend on local developer machine state.

Recommended deployment model for Raspberry Pi:

```
push to main
→ self-hosted GitHub Actions runner
→ rsync or checkout into deploy directory
→ write env/secrets
→ docker compose up -d --build
```

**Rationale**: A deployment that depends on undocumented manual steps or a developer's laptop is not
reproducible and cannot be trusted to recover under pressure.

### X. Security by Default

Applications MUST be secure by default, even for personal projects.

Requirements:

- Use HTTPS at the edge.
- Keep database and internal services private.
- Apply authentication to admin areas.
- Validate all input on the server.
- Use rate limiting for public mutation endpoints.
- Use CSRF protection where applicable.
- Use secure cookies in production.
- Authentication MUST use a validated canonical external origin and reject mismatched hosts.
- Avoid exposing stack traces or sensitive errors.
- Do NOT trust client-provided identity, roles, prices, permissions, or ownership.
- Prefer server-side authorization checks close to the business action.

Public endpoints MUST be intentionally public and documented as such.
Their specifications MUST identify realistic abuse cases, trust boundaries, automated misuse,
enumeration, replay, privilege escalation, and resource exhaustion, together with controls and
accepted residual risk. Multi-instance applications MUST use shared rate-limit state.

**Rationale**: Secure defaults prevent the most common and costly failures; trusting the client is
the root cause of most authorization vulnerabilities.

### XI. Specs Before Implementation

Every meaningful feature MUST start with a specification.

Feature directories and branches MUST use the configured timestamp identifier format
`YYYYMMDD-HHMMSS-feature-name` so parallel specification work cannot collide.

The specification MUST describe: the user problem; the expected behavior; the users or roles
involved; acceptance criteria; non-goals; edge cases; security or privacy implications; and
operational impact, if any. The specification MUST focus on what and why.

The implementation plan MUST define: technology choices; architecture; data model; API contracts;
Docker/deployment changes; migration impact; and testing strategy.

Tasks MUST be derived from the spec and plan, not invented directly from a vague prompt.

**Rationale**: Specifying intent before implementation surfaces security, data, and operational
consequences while they are still cheap to change.

### XII. Tests and Verification Are Required

Every feature MUST include a verification strategy.

Meaningful features MUST include automated tests derived from that strategy. A plan MAY use only
manual verification for a change that cannot be tested practically, but MUST explain why and define
repeatable manual steps. Tests MUST NOT be omitted merely because the initial request did not ask
for them explicitly.

Minimum expectations:

- Typecheck MUST pass.
- Lint MUST pass.
- Unit tests for business logic where practical.
- Integration tests for critical API flows.
- E2E smoke tests for routing, security headers, and health of deployable HTTP applications.
- Manual verification steps for UI-heavy features.
- Migration tests and forward-recovery notes for database changes.
- Healthcheck validation after deployment.

For critical flows such as authentication, payments, public forms, event registration, email
sending, or live translation, integration or E2E tests are REQUIRED before production use; unit
tests alone are insufficient.

**Rationale**: Verification is what converts "it works on my machine" into a claim that can survive
deployment to constrained, unattended infrastructure.

## Standard Project Architecture

The default architecture for self-hosted web apps is:

```
Cloudflare Tunnel / DNS
        ↓
Traefik
        ↓
app container
        ↓
internal Docker network
        ├── db container
        └── worker container (if needed)
```

For Next.js apps:

```
app container:
  - React UI
  - SSR / server components
  - API routes
  - server actions
  - auth
  - WebSocket/SSE if required

worker container:
  - async jobs
  - background processing
  - scheduled work

db container:
  - PostgreSQL or MariaDB/MySQL
```

### Code Organization (within the `app`)

Organize application code by domain. The default structure MUST be domain-based modules, with shared
infrastructure kept in the common layers:

- **Default: domain modules.** Each business domain lives in its own module under
  `src/modules/<domain>/` with its own UI, server actions, services, types, and tests.
- **Shared stays shared.** Cross-cutting code (UI primitives, `db`, `auth`, validation, helpers,
  app shell, routing) remains in the shared locations (`src/app`, `src/components`, `src/lib`,
  `src/server`) and is NOT duplicated into domain modules.
- **Keep modules cohesive.** A module should encapsulate the full behavior of one domain rather than
  spreading its concerns across unrelated folders.

## Internationalization (i18n)

Applications are multilingual by default. User-facing text MUST come from message catalogs, never
hardcoded in components.

- **Supported locales**: English (`en`, the default), Spanish (`es`), and Catalan (`ca`). New
  locales are added by extending the routing config and message catalogs.
- **URL scheme**: the default locale has NO prefix; the others are prefixed (`localePrefix:
  as-needed`). English is `/dashboard`, Spanish is `/es/dashboard`, Catalan is `/ca/dashboard`.
- **Routing** is handled by the `next-intl` middleware in the Next.js proxy file (`src/proxy.ts`),
  which resolves the active locale from the URL prefix, then the `NEXT_LOCALE` cookie, then
  `Accept-Language`.
- **Structure**: localized pages live under `src/app/[locale]/`; i18n config lives in `src/i18n/`
  (`routing`, `request`, `navigation`); message catalogs live in `src/messages/<locale>.json`.
- **API routes are NOT localized** and stay outside the `[locale]` segment.
- Use the locale-aware `Link`/`redirect` from `src/i18n/navigation.ts` instead of `next/link` /
  `next/navigation`.

## Default Technology Choices

Unless a feature has a good reason to choose otherwise, prefer:

- TypeScript for application code.
- Next.js for full-stack web apps.
- PostgreSQL for new custom applications.
- MariaDB/MySQL only when required by WordPress or existing software.
- Prisma for database schema and migrations in TypeScript projects.
- Zod or equivalent for runtime validation.
- next-intl for internationalization (i18n) in Next.js apps.
- Pino for structured application logging (newline-delimited JSON to stdout).
- Docker Compose for local and production deployment.
- Traefik for routing.
- Cloudflare Tunnel for home-hosted deployments.
- GitHub Actions for CI/CD.
- GitHub Secrets for sensitive deployment values.

## Deployment Rules

Each deployable project MUST document: domain name; required environment variables; required
secrets; required Docker networks; persistent volumes; backup location; restore procedure;
healthcheck endpoint; how to deploy; how to revert compatible application code; and how to recover
schema and data independently. Documentation MUST NOT imply that a code rollback reverses data.

Production compose files MUST NOT expose database ports publicly.

## Database Rules

Database changes MUST be explicit and reviewed.

Requirements:

- Use migrations.
- NEVER modify production schema manually without documenting it.
- Include seed data only when safe.
- Prefer forward-only, expand-and-contract migrations that remain compatible during deployment.
- Reverting application code MUST NOT be described as reversing an applied schema or data change.
- Every data-changing feature MUST define a corrective forward migration strategy.
- Destructive or incompatible changes require a verified backup and documented restore procedure.
- Avoid destructive migrations unless the compatibility window, backup, restore, and recovery plan
  are reviewed explicitly.
- Prefer stable IDs and explicit constraints.
- Add indexes for common lookup paths.
- Do NOT store secrets in plain application tables unless required and justified.

## Worker Rules

A worker SHOULD be introduced when work is long-running, retryable, asynchronous, potentially
expensive, or not required to complete during the user's request.

Workers MUST: be idempotent where practical; handle retries safely; log failures; avoid duplicate
processing; use database-backed state or a queue; and shut down gracefully when possible.

## Observability Rules

At minimum, every production app MUST provide: Docker logs; healthcheck status; clear startup errors;
documented environment validation; and basic operational notes.

For more important apps, add: error tracking; uptime monitoring; metrics; alerting; and backup
success notifications.

Application logs MUST be structured JSON written to stdout via Pino (never to files inside the
container), so the host's Docker log driver or log collector can ship them to an aggregator. The
specific aggregator (for example Grafana Loki via a collector such as Alloy) is a host/deployment
concern and MUST NOT be a hard dependency of the application. Logs SHOULD include enough context to
correlate a request (for example a request/correlation id) and MUST redact secrets and PII.

## Raspberry Pi Constraints

When deploying to Raspberry Pi: prefer lightweight services; avoid unnecessary containers; set log
rotation; consider memory limits; avoid heavy build steps during peak usage; prefer native ARM64
images; monitor disk usage; keep backups outside the Pi when possible; and document whether the app
is suitable for real production or only beta/demo use.

## VPS Migration Checklist

A project is considered portable when this checklist is true:

- No Raspberry-specific values in source code.
- All config is in environment variables.
- Docker Compose works on a clean Linux host.
- Persistent data location is documented.
- Backup and restore are documented.
- DNS/Tunnel changes are documented.
- Secrets can be recreated on the new host.
- The app does not require local home-network assumptions.
- Architecture-specific image constraints are documented.

## Governance

This constitution overrides individual implementation preferences. When a spec, plan, or
implementation conflicts with this constitution, the constitution wins unless explicitly amended.

Amendments to this constitution MUST:

- Be intentional.
- Be documented.
- Explain the reason for the change.
- Preserve portability, security, and maintainability unless there is a justified exception.

**Versioning policy**: This constitution follows semantic versioning. MAJOR increments for
backward-incompatible governance or principle removals/redefinitions; MINOR for new principles or
materially expanded guidance; PATCH for clarifications and non-semantic refinements.

**Compliance review**: Every spec, plan, and pull request is expected to verify compliance with the
applicable principles. Any deviation MUST be justified in the plan's Complexity Tracking (or an
equivalent, documented exception).

**Scope**: Self-hosted Docker web applications for Raspberry Pi, VPS, and small production
deployments.

**Version**: 1.6.2 | **Ratified**: 2026-07-10 | **Last Amended**: 2026-07-14
