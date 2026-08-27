# Implementation Plan: Standardize UI Primitives

**Branch**: `20260826-standardize-ui-primitives` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/20260826-standardize-ui-primitives/spec.md`

**Note**: This template is filled in by the `/speckit-plan` skill; its definition describes the execution workflow.

## Implementation summary

Standardize repeated form controls, field errors, action styling, persistent callouts, current-session
status, and explicit content separators without changing routes, business behavior, semantic HTML,
focus, or live-region timing. Add the Base UI `Checkbox`, `Alert`, and `Badge` sources through the
project's shadcn CLI; reuse `FieldError`, `Separator`, `NavigationMenuLink`, and shared button styles;
retain plain anchors for navigation because the current Base UI `Button` assigns button semantics to
rendered links; and document why the remaining candidates stay custom or are deferred.

## Technical Context

**Language/Version**: TypeScript 6.0.x (`~6.0.2`) on Node.js 24 LTS (`>=24.15.0 <25.0.0`)

**Package Manager**: pnpm

**Primary Dependencies**: Next.js 16.3.2 (App Router), React 19.2.8, shadcn 4.19.0 with the
`base-nova` preset, `@base-ui/react` 1.7.x, Tailwind CSS 4, Lucide, next-intl, Auth.js; no new
third-party runtime dependency is required

**Storage**: N/A for this feature; existing PostgreSQL data and Prisma schema remain unchanged

**Testing**: Vitest 4 + jsdom + Testing Library and the existing axe helper for component semantics;
Playwright 1.62 against the production artifact for keyboard, focus, live-region, localization,
responsive, and critical account-flow regressions; manual VoiceOver, 200% zoom, light/dark, and
cross-locale review

**Target Platform**: Docker (Linux containers) on Raspberry Pi (ARM64), portable to VPS; ingress via Cloudflare Tunnel -> Traefik

**Project Type**: Web application - single Next.js full-stack `app` container (+ `db`, optional `worker`)

**Deployment**: Existing Docker Compose deployment is unchanged; networks `traefik_network`
(external ingress) and `internal` (private) and current restart policy remain unchanged

**CI/CD**: GitHub Actions on a self-hosted runner

**Secrets**: No new configuration or secrets; existing development and production injection rules
remain unchanged

**Observability**: No new logs, metrics, or health signals; existing healthcheck, Pino stdout logs,
Docker logs, and log rotation remain unchanged

**Migration Strategy**: N/A; no schema, stored data, API contract, or deployment migration

**Recovery Strategy**: Revert the compatible UI source changes if necessary; no data restore or
corrective migration is involved

**Performance Goals**: Add no network requests, background work, or interaction steps; preserve the
existing perceived response of synchronous controls and pending-state feedback on the Raspberry Pi
target

**Constraints**: Preserve native link/button/list/landmark meaning, WCAG 2.2 AA behavior, focus and
live announcements, 24x24 CSS-pixel minimum targets, supported translations, and existing visual
hierarchy; do not modify the email preview application or transactional email markup; no global
theme rewrite

**Scale/Scope**: Main web application only; English, Spanish, and Catalan; light and dark appearance;
mobile and desktop widths; three new shared primitive source files plus focused migrations across
authentication, account, navigation, legal, export, deletion, and session surfaces

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Pre-design gate: PASS**

| Principle | Assessment |
|-----------|------------|
| I, III, IV - Portable Docker deployment and isolated ingress | Pass. The feature changes client-facing source only and does not alter images, Compose, networks, host assumptions, or ingress. |
| II - Operational and code responsibility boundaries | Pass. Shared primitives remain in `src/components/ui`; domain call sites remain in their existing modules; no service split is introduced. |
| V - Secrets | Pass. No environment variables, credentials, or secret-bearing files are added. |
| VI - Persistence, backup, and restore | Pass. No schema, records, migrations, backup procedures, or restore procedures change. |
| VII - Minimal maintainable stack | Pass. The plan reuses the configured shadcn/Base UI/Tailwind stack and adds generated source only for three demonstrated needs. |
| VIII - Production readiness and observability | Pass. Runtime topology, health, structured logging, and resource behavior remain unchanged; no new client request or service is introduced. |
| IX - Reproducible CI/CD | Pass. Existing lint, typecheck, unit, production build, dependency audit, and production-artifact E2E gates remain authoritative. |
| X - Security by default | Pass. Server-side authorization and validation remain authoritative; tests guard privileged-action semantics, duplicate activation, and sensitive status feedback. |
| XI - Specs before implementation | Pass. The clarified specification defines scope, non-goals, security implications, and measurable outcomes before planning. |
| XII - Tests and verification | Pass. Existing component and E2E suites will be extended, with axe plus repeatable manual VoiceOver, zoom, viewport, locale, and theme checks. |
| Internationalization | Pass. Existing catalog text and locale-aware links remain unchanged across `en`, `es`, and `ca`. |

**Post-design re-check: PASS**

| Principle | Phase 1 evidence |
|-----------|------------------|
| I-IV - Portable deployment and operational boundaries | Pass. The data model and UI contract add no runtime, service, network, route, or host dependency; the source boundary remains the existing single application. |
| V-VI - Secrets and persistence | Pass. `data-model.md` explicitly introduces no secret, persistent entity, migration, stored value, or recovery operation beyond source rollback. |
| VII-VIII - Maintainable stack and production readiness | Pass. `research.md` limits additions to three generated source primitives with no dependency, request, log, health, or resource change. |
| IX - Reproducible CI/CD | Pass. `quickstart.md` uses repository scripts for lint, typecheck, threshold-enforced coverage, production build, dependency audit, and isolated production-artifact E2E. |
| X - Security by default | Pass. The UI contract keeps server authorization, validation, CSRF, rate limiting, session checks, confirmation, reauthentication, and duplicate-action controls authoritative. |
| XI - Specs before implementation | Pass. Research decisions, conceptual states, exhaustive audit outcomes, rendered-interface contracts, boundaries, and recovery are documented before tasks or source edits. |
| XII - Tests and verification | Pass. The design requires focused component tests, axe, critical production E2E, and a repeatable locale/theme/viewport/keyboard/VoiceOver/zoom matrix. |
| Internationalization | Pass. The contract preserves existing catalog text and locale-aware destinations for English, Spanish, and Catalan. |

No constitution violation or complexity exception was introduced during design.

## Project Structure

### Documentation (this feature)

```text
specs/20260826-standardize-ui-primitives/
|-- plan.md              # This file (/speckit-plan command output)
|-- research.md          # Phase 0 output (/speckit-plan command)
|-- data-model.md        # Phase 1 output (/speckit-plan command)
|-- quickstart.md        # Phase 1 output (/speckit-plan command)
|-- validation.md        # Implementation-time automated and manual evidence
|-- contracts/
|   `-- ui-primitives.md # UI, semantics, accessibility, and state contract
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
src/
|-- app/[locale]/
|   |-- account-deleted/page.tsx
|   |-- privacy/page.tsx
|   `-- terms/page.tsx
|-- components/
|   |-- app-navigation.tsx
|   |-- home-navigation.tsx
|   `-- ui/
|       |-- alert.tsx             # New, generated through shadcn CLI
|       |-- badge.tsx             # New, generated through shadcn CLI
|       |-- checkbox.tsx          # New, generated through shadcn CLI
|       |-- button.tsx            # Existing shared styles and action primitive
|       |-- field.tsx             # Existing FieldError and field composition
|       |-- navigation-menu.tsx   # Existing top-level navigation composition
|       `-- separator.tsx         # Existing explicit content separator
`-- modules/
  |-- login/components/login-form.tsx
  |-- signup/components/signup-form.tsx
  `-- account/
    |-- components/{account-navigation,profile-form}.tsx
    |-- data-export/components/data-export-panel.tsx
    |-- deletion/components/delete-account-dialog.tsx
    `-- security/components/{security-session-dialog,security-session-list}.tsx

tests/
|-- unit/                  # Existing form, navigation, dialog, and accessibility suites
`-- e2e/                   # Existing signup, account, legal, export, deletion, and session flows
```

**Structure Decision**: Keep the existing single Next.js application and domain organization.
Generated shadcn sources live in the established shared UI directory; application-specific forms,
pages, dialogs, lists, and navigation remain in their owning modules. No API, server action, Prisma,
email preview, transactional email, deployment, or infrastructure file is part of this feature.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations require justification.