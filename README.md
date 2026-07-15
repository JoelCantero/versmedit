# Web app

A generic, production-minded architecture for **self-hosted, Dockerized web applications**. It is a
full-stack Next.js app (UI + API + Server Actions) backed by PostgreSQL, built to run on constrained
hardware (Raspberry Pi) and move to a VPS with minimal changes.

The non-negotiable engineering principles for this architecture live in
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Stack

- **Language / runtime**: TypeScript on Node.js 24 LTS · **pnpm**
- **Framework**: Next.js (App Router) + React — one full-stack `app` (UI, SSR, API routes, Server Actions, auth)
- **Database**: PostgreSQL via Prisma 7 (driver adapter)
- **Validation**: Zod · **Auth**: NextAuth v4 stable · **Email**: Nodemailer (SMTP)
- **Testing**: Vitest + jsdom + Testing Library + Playwright
- **Logging**: Pino (structured JSON to stdout)
- **Infra**: Docker + Docker Compose · Traefik ingress · Cloudflare Tunnel (home hosting)
- **CI/CD**: GitHub Actions (self-hosted runner)

## Requirements

- Node.js 24 + pnpm (`corepack enable`)
- Docker + Docker Compose (for the local database)

## Getting started (development)

```bash
cp .env.example .env          # fill in AUTH_SECRET, POSTGRES_PASSWORD, ...
pnpm install
pnpm dev                      # runs on http://localhost:3000
```

`pnpm dev` starts the database in Docker via the `predev` hook, then launches Next.js. The quality
gate (`lint` → `typecheck` → `test`) runs later — before opening a PR — via the Spec Kit
`after_implement` hook (`speckit.quality-gate`); CI repeats it with coverage thresholds and adds a
production dependency audit, SpecKit compliance validation, production build, and Playwright tests
as the authoritative merge gate. The mandatory `speckit.compliance-check` verifies that each
feature's spec, plan, and tasks remain complete. To change the schema, edit
`prisma/schema.prisma` and run `pnpm db:migrate`.

Spec Kit creates every feature branch from an up-to-date `origin/main`. Before the first spec, push
the initial main branch (`git push -u origin main`) and commit or stash tracked changes; otherwise
the mandatory `before_specify` hook stops without creating a branch.

### Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Start DB (via `predev`), run Next dev |
| `pnpm build` / `pnpm start` | Production build / start |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` | Static and unit/integration gates |
| `pnpm audit:prod` / `pnpm test:e2e` | Production audit / isolated DB + migrations + build + standalone smoke tests |
| `pnpm db:migrate` / `db:deploy` | Create+apply (dev) / apply (prod) migrations |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:backup:dev` / `db:restore:dev` | Logical development DB backup / restore |
| `COMPOSE_FILE=<file> pnpm db:backup` / `db:restore` | Backup / restore an explicitly selected Compose stack |

## Architecture

```
Development                     Production
-----------                     ----------
pnpm dev (host)                 Cloudflare Tunnel / DNS
   └── db in Docker (localhost)     └── Traefik
                                         └── app (Next.js)
                                              └── internal network
                                                   ├── migrate (one-shot)
                                                   └── db (PostgreSQL, private)
```

- **Dev** ([`docker-compose.yml`](docker-compose.yml)) runs **only the `db`** (published on
  `localhost:5432`); the app runs on the host with `pnpm dev`.
- **Prod** ([`docker-compose.prod.yml`](docker-compose.prod.yml)) runs `app` behind Traefik, a
  one-shot `migrate` service that applies migrations before `app` starts, and a **private** `db` (no
  public ports). Networks: `traefik_network` (external ingress) + `internal` (private).

## Configuration

All runtime configuration comes from environment variables.

- **Development**: a local `.env` (copy of `.env.example`). Never committed.
- **Production**: **no `.env` file** — the deploy workflow injects values from GitHub into the
  Compose process and containers at runtime. Docker builds use non-secret placeholders only while
  Next.js collects build metadata; real credentials are never baked into the image.

| GitHub **Variables** (non-sensitive) | GitHub **Secrets** (sensitive) |
|---|---|
| `PROJECT_NAME`, `APP_DOMAIN`, `DEPLOY_BASE_DIR`, `RUNNER_NAME`, `LOG_LEVEL`, `TRUST_PROXY_HEADERS` _(optional)_ | `POSTGRES_PASSWORD`, `AUTH_SECRET` |
| `AUTH_EMAIL_ENABLED` _(email feature gate, optional)_ | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` _(email, optional)_ | `SMTP_USER`, `SMTP_PASSWORD` _(email, optional)_ |

`POSTGRES_USER`, `POSTGRES_DB`, `DATABASE_URL` and the image/router names are **derived**
from `PROJECT_NAME` / `APP_DOMAIN`. Production percent-encodes database credentials when it builds
`DATABASE_URL`; for local development, encode reserved password characters in the URL yourself.
`NEXTAUTH_URL` is the canonical external origin (`https://APP_DOMAIN` in production); Auth requests
with a different `Host` or `X-Forwarded-Host` are rejected before NextAuth. The optional `SMTP_*`
values point at an external transactional email provider. Leave them empty in the template. The
first application spec must define registration, which existing users may authenticate, the email
provider, and the integration tests before setting `AUTH_EMAIL_ENABLED=true`. SMTP configuration
alone does not activate email sign-in. The hardened auth adapter refuses to create unknown users;
registration remains a separate product flow that validates the application's required fields.
Keep `TRUST_PROXY_HEADERS=false` unless Cloudflare is the exclusive route to the origin and the
ingress overwrites `X-Forwarded-Host` and `CF-Connecting-IP` on every request. A private app network
alone is insufficient because a publicly reachable Traefik instance can forward client-supplied
headers. When the guarantee is enforced, set the GitHub Variable to `true`; otherwise forwarded host
and address headers remain ignored and the email limiter uses one conservative shared client bucket.

## Deployment

Push to `main` (or run it manually) triggers
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on the self-hosted **ARM64** runner
named by the `RUNNER_NAME` Variable:

1. `rsync` the repository into the deploy directory (`DEPLOY_BASE_DIR`/`PROJECT_NAME`).
2. Ensure the external `traefik_network` exists.
3. `docker compose -f docker-compose.prod.yml up -d --build --remove-orphans` — Compose orders it
   **db → migrate → app**.

The local SpecKit hooks provide pre-PR feedback. CI is authoritative and requires lint, typecheck,
unit/integration tests with coverage thresholds, SpecKit compliance, a production dependency audit,
a production build, and Playwright smoke tests for routing, CSP, request correlation, and database
readiness against the standalone artifact. The template intentionally does not emulate SMTP or test
an application-specific authentication flow. Deployments are serialized and are never canceled
mid-build or mid-migration.

Application code may be reverted only while it remains compatible with the applied schema. Prisma
migrations are forward-only: recover with a corrective migration in normal operation. For an
incompatible or destructive change, restore a verified backup into a fresh database/volume and
switch traffic only after validation; reverting Git does not reverse schema or data.

## Database, backups & health

- **Migrations**: versioned in `prisma/migrations/`; applied by the `migrate` service on deploy.
- **Persistent data**: the named volume `pgdata`.
- **Backup / restore**: `pnpm db:backup:dev` creates a portable logical development dump and
  `pnpm db:restore:dev <file>` restores it. Other stacks require an explicit selection, for example
  `COMPOSE_FILE=docker-compose.prod.yml pnpm db:backup`. Restore deliberately refuses a non-empty
  database and runs transactionally, preventing mixed old/restored state.
- **Restore verification**: the weekly/manual `Verify Backup And Restore` workflow migrates a test
  database, backs it up, recreates its volume, restores it, and verifies a sentinel record.
- **Healthcheck**: `GET /api/health` (used by the container healthcheck).

## Security and observability baseline

- The proxy adds a nonce-based CSP with `strict-dynamic`; locale pages render per request so Next.js
  can attach the nonce to framework scripts and styles. Standard security headers apply globally.
- Every proxied response carries `x-request-id`; server logs can create Pino child loggers with the
  same ID for correlation.
- The optional email sign-in endpoint includes a PostgreSQL-backed limit of five attempts per client
  and three per normalized email every 15 minutes, shared by all application replicas. Email keys
  are SHA-256 hashes, so the limiter does not retain addresses. The adapter rejects implicit user
  creation; the first application spec must still add tests for the chosen account lifecycle.
- Public endpoints and privileged actions must document threats, abuse controls, trust boundaries,
  and residual risk in their SpecKit feature specification.

## Convert this template into an application

1. Create the new repository from this template and change `name` in `package.json`.
2. Replace `fullstack-webapp-template` in `.env.example` with the application's stable
   `PROJECT_NAME`. Keep it suitable for Docker names and PostgreSQL identifiers.
3. Set the real domain and deployment target through GitHub Variables: `PROJECT_NAME`,
  `APP_DOMAIN`, `DEPLOY_BASE_DIR`, and `RUNNER_NAME`; optionally configure `LOG_LEVEL`. Set
  `TRUST_PROXY_HEADERS=true` only after enforcing the exclusive Cloudflare ingress contract above.
4. Create `POSTGRES_PASSWORD` and `AUTH_SECRET` as GitHub Secrets. Configure SMTP and set
  `AUTH_EMAIL_ENABLED=true` only after the first application spec defines registration,
  existing-user authentication, and their tests.
5. Confirm the `traefik_network` exists on the target host and that the named ARM64 runner is online.
6. Adapt locales, message catalogs, Auth.js providers, Prisma models, resource limits, retention,
   availability, and monitoring to the derived application's requirements.
7. Push the initial `main` to `origin`, then start the first real feature through SpecKit. Feature
   directories use `YYYYMMDD-HHMMSS-feature-name`; the template itself intentionally has no
   product-specific `specs/` directory.
8. Before production, run the CI gate, the backup/restore verification workflow, and a deployment
   healthcheck against the actual target environment.

## VPS migration

Portable by design: install Docker on the target, copy the repository + compose files, recreate the
environment variables/secrets (no `.env` to copy — they are injected at runtime), restore the DB
backup/volume, create the networks, run Compose, and repoint DNS / the Cloudflare Tunnel.
