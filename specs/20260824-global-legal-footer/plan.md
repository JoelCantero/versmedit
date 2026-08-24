# Implementation Plan: Global Legal Footer

**Branch**: `20260824-global-legal-footer` | **Date**: 2026-08-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20260824-global-legal-footer/spec.md`

## Summary

Add one localized, accessible legal footer to the existing `[locale]` application layout so every
normal user-facing page inherits it exactly once. Implement the footer as a server-rendered shared
component that reuses the established locale-aware navigation and canonical policy destinations,
uses existing theme tokens, and remains in normal document flow after the flex-growing content
region. Verify the component contract with Vitest and prove route-wide behavior, locale retention,
authentication independence, accessibility, and responsive geometry against the production
artifact with Playwright.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 24 LTS

**Package Manager**: pnpm 11.22.0

**Primary Dependencies**: Next.js 16.3.1 App Router, React 19.2.8, next-intl 4.13.6,
Tailwind CSS 4, next-themes 0.4.6; reuse the existing locale-aware `Link`, message catalogs,
semantic theme tokens, and policy path constants. No new runtime dependency or shadcn component.

**Storage**: N/A. The footer is static presentation and navigation; it reads or writes no database
or browser-persisted state.

**Testing**: Vitest 4.1 with server-rendered markup assertions and catalog parity checks;
Playwright 1.62 against the production standalone artifact for route navigation, authentication
state, responsive geometry, keyboard focus, and browser axe-core WCAG A/AA checks. Manual
VoiceOver and contrast verification supplement automation.

**Target Platform**: Existing Dockerized web application on Raspberry Pi ARM64, portable to VPS;
all supported modern browser viewport sizes already covered by the Playwright configuration.

**Project Type**: Single Next.js full-stack web application. This feature changes only shared UI,
catalogs, and tests.

**Deployment**: Existing Docker Compose application deployment; no service, image, network, port,
volume, environment variable, or secret change.

**CI/CD**: Existing GitHub Actions gates remain authoritative: lint, typecheck, Vitest, production
build, dependency audit, Spec Kit validation, and production-artifact E2E.

**Secrets**: N/A. The footer receives no secret or user-specific value and introduces no runtime
configuration.

**Observability**: No new health signal, metric, event, or log. Footer navigation must not log
authentication state, locale history, or browsing behavior.

**Migration Strategy**: N/A. No schema, persistent data, policy version, or stored preference
changes.

**Recovery Strategy**: A compatible application-code rollback removes the footer and catalog key;
there is no data operation to reverse and no restore procedure specific to this feature.

**Performance Goals**: Render the footer in the initial server response with no new database/API
request, no custom client boundary, and no state/effect code. Reuse the navigation runtime already
present in the shell and add only two links plus localized text to each page.

**Constraints**: Render exactly once inside `src/app/[locale]/layout.tsx`; preserve the current
`body` column and flex-growing content geometry; remain non-fixed and non-sticky; expose exactly two
links in Terms-then-Privacy order; retain English unprefixed routing and `/es`/`/ca` prefixes; use
semantic light/dark tokens; meet WCAG 2.2 AA contrast, focus, landmark, and keyboard requirements;
do not change policy content, acceptance behavior, auth behavior, or error documents outside the
localized layout.

**Scale/Scope**: All normal user-facing routes under `src/app/[locale]/` inherit the footer
structurally. Production E2E samples the five required categories in each locale: public, login,
authenticated account, Terms, and Privacy. The scope includes three supported locales, two legal
destinations, valid public and authenticated states, and representative 320 x 568, 768 x 1024, and
1440 x 900 viewports. Future routes under the same layout inherit the footer.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

**Status: PASS**

- **I-IV - Deployment and portability**: The change stays in the existing app container and adds
  no host coupling, service, network, image, or platform-specific behavior.
- **V - Secrets**: No configuration or secret is added or exposed.
- **VI - Persistence and recovery**: No data model or migration changes; code rollback is sufficient.
- **VII - Minimal stack**: Existing Next.js, next-intl, Tailwind, Vitest, Playwright, and axe-core
  cover the feature; no dependency or infrastructure is added.
- **VIII - Production readiness**: Existing health and logging behavior is unchanged; the footer
  performs no I/O and emits no PII-bearing telemetry.
- **IX - Reproducibility**: The normal CI quality gates and production-artifact E2E remain applicable.
- **X - Security by default**: The footer exposes only existing public legal routes, accepts no
  input, creates no endpoint, and does not vary authorization behavior.
- **XI - Specs before implementation**: The dated branch and feature directory align and the spec
  defines scope, non-goals, accessibility, privacy, edge cases, and measurable outcomes.
- **XII - Verification**: The design requires automated component/catalog and production E2E
  coverage plus repeatable manual accessibility and extension checks.
- **Internationalization**: All new user-facing copy comes from the English, Spanish, and Catalan
  catalogs, and navigation uses the locale-aware project helper.

### Post-Design Gate

**Status: PASS**

- `research.md` resolves every technical choice with existing framework and project patterns; no
  unknown, new dependency, or infrastructure exception remains.
- `data-model.md` confirms the feature owns no persistent entity, migration, mutable lifecycle, or
  recovery burden; its small presentation model has explicit locale and ordering invariants.
- `contracts/global-footer-ui.md` exposes only a semantic UI contract over existing public routes;
  it adds no API, input, privileged action, trust boundary, or user-data flow.
- `quickstart.md` defines reproducible focused tests, the isolated production-artifact E2E workflow,
  and manual WCAG/usability validation for outcomes automation cannot establish reliably.
- The design preserves the single app container, locale-aware routing, semantic theme system,
  existing CI/deployment posture, secret handling, logs, healthchecks, backups, and VPS portability.
- No constitution violation or Complexity Tracking exception is required after design.

## Project Structure

### Documentation (this feature)

```text
specs/20260824-global-legal-footer/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   `-- global-footer-ui.md
`-- tasks.md                     # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
src/
|-- app/
|   `-- [locale]/
|       `-- layout.tsx           # Compose AppFooter once after page content
|-- components/
|   `-- app-footer.tsx           # New server-rendered shared footer
|-- messages/
|   |-- en.json                  # Add localized footer navigation name
|   |-- es.json
|   `-- ca.json
`-- modules/
    `-- signup/
        `-- policy.ts            # Reuse canonical POLICY_PATHS without changes

tests/
|-- unit/
|   `-- app-footer.test.tsx      # Markup, destination order, and catalog parity
`-- e2e/
    `-- global-footer.spec.ts    # Route/auth/locale/a11y/responsive matrix
```

**Structure Decision**: `AppFooter` is cross-cutting application chrome, so it belongs beside
`AppHeader` under `src/components` and is composed only by the localized root layout. It remains a
Server Component because it needs translations but no browser state or event handler. The footer
reuses the existing locale-aware `Link`, canonical `POLICY_PATHS`, and policy title messages rather
than duplicating route or legal-label sources. The existing flex column owns short-page placement;
the component adds no fixed positioning or layout wrapper. Tests follow current repository patterns
and use semantic roles instead of test IDs.

## Complexity Tracking

No constitution violations require justification.