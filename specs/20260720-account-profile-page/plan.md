# Implementation Plan: Account Profile Page

**Branch**: `20260720-account-profile-page` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/20260720-account-profile-page/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Implementation summary

Add a protected, localized account Profile page that displays the current session user's image or
initials, permits only a validated name update, and preserves locale through account navigation and
authentication. Implement the page under the existing localized App Router, place profile behavior
in a cohesive `account` domain module, use a React Server Action as the mutation boundary, derive
identity with Auth.js on the server, and issue one Prisma update containing only `name`. Define one
strict Zod name schema for profile updates and any future registration boundary, extend login
callback handling to accept only validated localized account return paths without changing the
existing-user sign-in flow, and verify the feature with unit/component, PostgreSQL
integration, accessibility, responsive, and standalone-production Playwright tests.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS (Docker build/runtime)

**Package Manager**: pnpm

**Primary Dependencies**: Next.js 16 App Router, React 19, Tailwind CSS 4, shadcn/Base UI components, Prisma 7, Zod 4, Auth.js/NextAuth 4, next-intl 4, Pino 10

**Storage**: PostgreSQL (via Prisma)

**Testing**: Vitest + jsdom + Testing Library (unit/component); Playwright for production-artifact smoke tests and feature-specific E2E. Authentication features MUST test the selected real provider boundary; the template does not emulate SMTP.

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel → Traefik

**Project Type**: Web application: single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Docker Compose; networks `traefik_network` (external ingress) + `internal` (private); services use `restart: unless-stopped`

**CI/CD**: GitHub Actions on a self-hosted runner

**Secrets**: dev uses a local `.env`; prod uses **no** `.env` file: non-sensitive config in GitHub **Variables**, secrets in GitHub **Secrets**, injected into the containers at deploy time. Never committed.

**Observability**: Healthcheck endpoint + structured logging (Pino → stdout JSON) + Docker logs + log rotation

**Migration Strategy**: N/A. Reuse nullable `User.name`, `User.email`, and `User.image`; do not change the Prisma schema or create a migration. Application rollout remains compatible with legacy users whose name is null.

**Recovery Strategy**: No destructive or incompatible data operation. A failed update writes nothing; a release defect can be corrected or the compatible application code reverted without reversing data. Existing backup/restore procedures remain unchanged.

**Performance Goals**: No feature-specific latency release gate is introduced. Keep the account page and mutation bounded to the existing indexed session lookup plus one user read or update path, with no unbounded query, worker, queue, polling loop, or additional network service. Production latency may be observed after release before a hardware-specific SLO is adopted.

**Constraints**: Raspberry Pi memory/CPU limits; no host-specific paths/IPs; portable to VPS; no schema migration, new environment variable, external service, container, or authentication-provider change; only `User.name` may be mutated; no PII in logs; full English/Spanish/Catalan and light/dark support.

**Scale/Scope**: One protected page, one profile section, one editable field, three locales, existing single-user account records, desktop plus 320 px mobile verification, and low-volume authenticated mutations. No worker, cache, queue, upload, or additional account sections.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

- **I / IV: Docker portability**: PASS. Uses the existing app and database containers with no host-specific configuration or new runtime dependency.
- **II / Standard architecture: operational and domain boundaries**: PASS. UI, Server Action, service, schema, and types live in `src/modules/account`; localized route composition remains in `src/app/[locale]`; shared navigation, auth, and i18n stay shared.
- **V: secrets**: PASS. No new secrets or environment variables; Auth.js session handling remains server-side.
- **VI / Database rules: persistence and recovery**: PASS. Existing columns only, no migration, no destructive operation, and atomic single-field updates.
- **VII: minimal stack**: PASS. Uses installed Next.js, React, shadcn/Base UI, Zod, Auth.js, Prisma, next-intl, and Pino; no new package or service is required.
- **VIII: production readiness and logging**: PASS. Existing healthcheck remains sufficient; sanitized failure categories may be logged without names, emails, form values, or session data.
- **IX: reproducible CI/CD**: PASS. Existing lint, typecheck, coverage, production build, audit, and E2E commands cover the change.
- **X: security by default**: PASS. The server derives identity from the session, strictly rejects extra fields, updates only `name`, validates return paths, relies on Server Action origin protections, and reveals no account-existence information.
- **XI: specification first**: PASS. The clarified spec defines behavior, non-goals, security, abuse cases, and operational impact.
- **XII: tests and verification**: PASS. Planned unit/component, PostgreSQL integration, accessibility, keyboard, responsive, and production-artifact E2E checks cover the critical authenticated flow.
- **Internationalization**: PASS. Routes use locale-aware navigation and all account, validation, pending, and feedback strings come from all three message catalogs.

No gate violations require justification.

### Post-Design Gate

Phase 1 design preserves every pre-design result. The contracts expose no public mutation API,
accept no client identity, define strict input and localized authentication outcomes, and require
idempotent replay plus last-accepted-write behavior. The data model reuses existing fields with no
migration. The quickstart includes the constitution-mandated automated and production-artifact
verification. **Result: PASS; no Complexity Tracking entry required.**

## Project Structure

### Documentation (this feature)

```text
specs/20260720-account-profile-page/
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
  Do NOT split frontend/backend: Next.js combines them in the `app` container
  (constitution Principle II). Organize business code by domain under
  src/modules/<domain>/; shared code stays in app/, components/, lib/, and server/.
-->

```text
src/
├── app/[locale]/
│   ├── account/page.tsx              # Protected localized page composition + metadata
│   ├── login/page.tsx                # Validates and forwards safe callback destination
│   └── page.tsx                      # Existing authenticated navigation host
├── components/
│   ├── app-navigation.tsx            # Add localized Account link
│   └── ui/avatar.tsx                 # shadcn avatar primitive if not already present
├── lib/
│   ├── auth.ts                       # Existing Auth.js options
│   └── validation/profile-name.ts    # Shared required name schema
├── messages/{en,es,ca}.json          # Complete Account copy
└── modules/
  ├── account/
  │   ├── actions/update-profile.ts # Authenticated Server Action
  │   ├── components/profile-form.tsx
  │   ├── initials.ts
  │   ├── service.ts                # Strict one-field Prisma read/update
  │   └── types.ts                  # Serializable action/form states
  └── login/
    ├── components/login-form.tsx # Receives validated callback path
    └── schema.ts                 # Email/locale plus safe callback-path validation

tests/
├── unit/
│   ├── account-*.test.{ts,tsx}       # Schema, initials, action, form, a11y, navigation
│   └── login-*.test.{ts,tsx}         # Safe callback validation and unchanged sign-in behavior
├── integration/
│   └── account-profile.test.ts       # Real PostgreSQL auth/update/forgery/replay/concurrency
└── e2e/
  ├── helpers/authenticated-user.ts # Seed user/session and browser cookie
  └── account-profile.spec.ts       # Standalone build, locales, keyboard, responsive, reload

prisma/schema.prisma                  # Reused unchanged
playwright.config.ts                  # Existing desktop + 320 px production projects
scripts/test-e2e.sh                   # Existing isolated DB + standalone build harness
```

**Structure Decision**: Keep the existing single Next.js full-stack application. Add one cohesive
`account` domain module containing the form, client form adapter, action, service, initials helper,
and serializable state. The client adapter sends all form-control entries as a serializable list so
the Server Action can reject duplicate or unknown fields without interpreting Next.js transport
metadata as domain input. Route files perform locale/session composition only. The name rule is shared under
`src/lib/validation` so the profile boundary and any future registration boundary cannot diverge;
the current application exposes no registration route, and this feature does not add one.
Navigation and UI primitives remain shared. Prisma schema, Docker, deployment, health, and worker
topology are unchanged.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations or exceptions.
