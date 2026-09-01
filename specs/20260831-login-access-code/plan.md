# Implementation Plan: Login Access Code

**Branch**: `20260831-login-access-code` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/20260831-login-access-code/spec.md`

**Note**: This template is filled in by the `/speckit-plan` skill; its definition describes the execution workflow.

## Summary

Add a 10-character access code as a second representation of the existing single-use login challenge,
delivered in the same email as the magic link, and replace the post-submit login form with a
"Check your email" confirmation that offers manual code entry.

Technical approach: keep one `VerificationToken` row per login challenge and add a keyed,
identifier-bound `loginCodeHash` plus a `loginCodeAttempts` counter to it. Because link and code
resolve to the same row, single use, newest-only issuance, shared expiry and delivery-failure
compensation are inherited from the existing implementation rather than reimplemented. A new
`POST /api/auth/login/code` route validates the submitted code and then delegates to the native
Auth.js email callback inside an AsyncLocalStorage authorization — the pattern already proven by
`src/app/api/signup/activate/route.ts` — so session creation stays on the verified Auth.js path. The
login challenge TTL drops from 15 to 5 minutes for the `email` provider only. The login page becomes
a three-step client state machine on one URL.

## Technical Context

**Language/Version**: TypeScript 6.0.x on Node.js 24 LTS

**Package Manager**: pnpm

**Primary Dependencies**: Next.js 16 (App Router) + React 19, Tailwind CSS 4, Prisma 7, Zod 4, Auth.js (NextAuth 4, patched), next-intl, `@react-email/render`, Pino. No new runtime dependency.

**Storage**: PostgreSQL (via Prisma) — `VerificationToken` gains two columns; `RateLimitBucket` gains two new key families.

**Testing**: Vitest + jsdom + Testing Library (unit/component); Vitest integration against a real PostgreSQL database; Playwright for the three login screens and one complete code sign-in. Per the spec's clarification, challenge semantics (single use, expiry, replacement, concurrency, throttling) are proven by integration tests; the real mail provider boundary is exercised as it is today and is never replaced by an unverified transport.

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel -> Traefik

**Project Type**: Web application - single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Docker Compose; networks `traefik_network` (external ingress) + `internal` (private); services use `restart: unless-stopped`. No compose, container, volume, network or environment-variable change.

**CI/CD**: GitHub Actions on a self-hosted runner

**Secrets**: No new secret. The code hash is keyed with the existing `AUTH_SECRET` / `NEXTAUTH_SECRET`, read the same way the Auth.js token hash already reads it.

**Observability**: Existing Pino request logger. New structured events for code validation outcome classes only (`accepted`, `rejected`, `throttled`) and challenge issuance; the code and the raw address are never logged.

**Migration Strategy**: Forward-only. One migration adds `VerificationToken.loginCodeHash String?` (nullable) and `VerificationToken.loginCodeAttempts Int @default(0)`. Nullable means challenges issued before deploy simply have no code and keep working through the link; the compatibility window is bounded by the 5-15 minute challenge lifetime. Corrective forward migration drops the two columns; the magic link path never depends on them.

**Recovery Strategy**: No destructive change and no data rewrite, so the documented `scripts/db-backup.sh` / `scripts/db-restore.sh` procedure is unchanged. If the code path misbehaves in production, the corrective forward migration above plus reverting application code restores exactly the current magic-link behavior, because no existing column, row or semantic is modified.

**Performance Goals**: Code validation adds one indexed single-row lookup and at most one small write. All `POST /api/auth/login/code` responses — accepted and rejected alike — are held to the existing 500 ms floor + 0-100 ms jitter envelope so timing cannot reveal whether a pending challenge exists. Excluding that deliberate envelope, p95 server work stays under 200 ms on Raspberry Pi.

**Constraints**: Raspberry Pi memory/CPU limits; no host-specific paths/IPs; portable to VPS. The code must never appear in a URL, query string, log, trace or analytics payload. The email presentation layer forbids unknown request fields and copy keys, so the code must be introduced through its declared variant contract. The `maxAge` change must not leak into the `signup` and `account-deletion` providers.

**Scale/Scope**: Single-instance self-hosted deployment, low login volume. Scope: 1 migration, 1 new API route, 1 new domain code module, 3 login UI steps, 3 message catalogs, 1 email variant extension.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Docker-First, Portable by Default | No new container, volume, host path or env var; behavior fully described by repo + existing environment | PASS |
| II. Separate by Operational Responsibility | New behavior stays in the existing `app` container; no worker or service split | PASS |
| III. Reverse Proxy and Network Isolation | No new ingress surface beyond one route on the existing app entrypoint | PASS |
| IV. VPS Migration as Design Constraint | No new host coupling; migration checklist unchanged | PASS |
| V. Secrets Never Committed | Reuses `AUTH_SECRET`/`NEXTAUTH_SECRET`; no new secret, none committed | PASS |
| VI. Data Persistence, Backups, Restore | Additive nullable columns only; backup/restore procedure unchanged; corrective forward migration defined | PASS |
| VII. Minimal, Boring, Maintainable Stack | Zero new dependencies; reuses `VerificationToken`, `RateLimitBucket`, the hardened adapter, the AsyncLocalStorage authorization pattern and the email presentation layer | PASS |
| VIII. Health, Logs, Resource Awareness | Structured Pino events for outcome classes with the code and address redacted; no new healthcheck needed | PASS |
| IX. CI/CD Reproducible | Adds tests to the existing lint/typecheck/test/build/E2E gate; no pipeline change | PASS |
| X. Security by Default | Server-side validation with Zod, existing CSRF check, canonical-origin check, shared rate limiting, atomic single-use consumption, non-reversible keyed code storage, uniform generic errors; no client-provided identity is trusted | PASS |
| XI. Specs Before Implementation | spec.md complete and clarified; this plan precedes implementation; Non-Goals recorded | PASS |
| XII. Tests and Verification Required | Authentication is a critical flow: integration and E2E coverage are mandatory and planned, not unit-only | PASS |
| XIII. Public Discoverability and Indexing | `/login` stays non-indexable in all locales (unchanged, no new page or route family); the new API route inherits `X-Robots-Tag: noindex, nofollow` from the existing `/api/:path*` header rule | PASS |

**Result**: All gates pass. Complexity Tracking is intentionally empty.

Post-Phase-1 re-check: unchanged. The design added no entity, table, container, dependency or
abstraction beyond two columns on an existing model and one route that follows an existing precedent.

## Project Structure

### Documentation (this feature)

```text
specs/20260831-login-access-code/
|-- plan.md              # This file (/speckit-plan command output)
|-- research.md          # Phase 0 output (/speckit-plan command)
|-- data-model.md        # Phase 1 output (/speckit-plan command)
|-- quickstart.md        # Phase 1 output (/speckit-plan command)
|-- contracts/           # Phase 1 output (/speckit-plan command)
|   |-- login-code-endpoint.md
|   |-- login-ui-states.md
|   `-- email-presentation.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Files this feature adds or changes:

```text
prisma/
|-- schema.prisma                                   # CHANGED: VerificationToken += loginCodeHash, loginCodeAttempts
`-- migrations/<timestamp>_add_login_access_code/   # NEW: forward-only additive migration

src/
|-- app/
|   |-- api/
|   |   |-- auth/[...nextauth]/route.ts             # UNCHANGED behavior; exported handlers reused by the new route
|   |   `-- auth/login/code/route.ts                # NEW: POST code validation + delegated session creation
|   `-- [locale]/login/page.tsx                     # CHANGED: pass the new step messages to the login client
|-- lib/
|   |-- auth.ts                                     # CHANGED: per-provider maxAge (login 5 min), pass code to the email
|   |-- auth-adapter.ts                             # CHANGED: generate+store code hash on issuance; consume by code hash
|   |-- auth-login-code-rate-limit.ts               # NEW: shared rate-limit keys for code validation
|   `-- email/presentation/
|       |-- constants.ts                            # CHANGED: loginMagicLink valueKeys += verificationCode
|       |-- types.ts                                # CHANGED: EmailVariantValues.loginMagicLink += verificationCode
|       |-- render.tsx                              # CHANGED: validate verificationCode; pass code block to the document
|       `-- components/email-document.tsx           # CHANGED: optional high-legibility code block
|-- messages/{en,es,ca}.json                        # CHANGED: Login.checkEmail.*, Login.code.*, Email.loginMagicLink.*
`-- modules/login/
    |-- code.ts                                     # NEW: alphabet, generation, normalization, keyed hashing
    |-- schema.ts                                   # CHANGED: Zod schema for the submitted code
    |-- service.ts                                  # CHANGED: challenge lookup, attempt budget, consumption helpers
    |-- types.ts                                    # CHANGED: login step + code result types
    |-- verification-context.ts                     # CHANGED: publish the plaintext code; code authorization context
    `-- components/
        |-- login-form.tsx                          # CHANGED: three-step orchestrator with focus management
        |-- login-check-email.tsx                   # NEW: confirmation step
        `-- login-code-form.tsx                     # NEW: manual code entry step

tests/
|-- unit/                                           # code alphabet/normalization/hashing, steps, a11y, route units
|-- integration/                                    # issuance, single use, expiry, replacement, concurrency, throttling
`-- e2e/                                            # three login screens + one complete code sign-in
```

**Structure Decision**: Production runs a single Next.js full-stack `app` container (UI + SSR + API
routes + Server Actions + auth), a one-shot `migrate` service that applies Prisma migrations before
`app` starts, and a `db` (PostgreSQL) service - wired through Docker Compose on `traefik_network`
(ingress) + `internal` (private) networks (`worker` optional). In development, `docker-compose.yml`
runs only the `db`; the app runs on the host via `pnpm dev`. Frontend and backend are intentionally
NOT split (constitution Principle II). Login behavior stays inside the existing `src/modules/login`
domain module; the Auth.js wiring, adapter hardening, rate limiting and email presentation remain
shared infrastructure under `src/lib` and are extended in place rather than duplicated into the
module.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The design introduces no new table, service, container, dependency or abstraction.
