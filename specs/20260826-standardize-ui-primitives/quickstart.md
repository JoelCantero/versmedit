# Quickstart: Validate Standardized UI Primitives

**Feature**: [Standardize UI Primitives](./spec.md)

**Contract**: [UI primitives contract](./contracts/ui-primitives.md)

**Model**: [Conceptual data model](./data-model.md)

## Prerequisites

- Node.js 24 LTS in the range declared by `package.json`
- pnpm 11.22.0 through Corepack
- Docker Desktop or another running Docker Engine with Compose v2
- Playwright Chromium installed for production E2E
- macOS VoiceOver for the manual announcement review

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
docker info
```

Expected: dependency installation succeeds without changing the lockfile, Chromium is available,
and Docker reports a running engine.

## 1. Verify Scope

Inspect the implementation diff before running behavior checks:

```bash
git diff --check
git diff --name-only
```

Expected implementation changes are limited to:

- Three generated sources under `src/components/ui`: `checkbox.tsx`, `alert.tsx`, and `badge.tsx`.
- Focused main-application call sites under `src/app`, `src/components`, and `src/modules`.
- Existing unit and E2E suites under `tests`.
- This feature's files under `specs/20260826-standardize-ui-primitives`.

The feature must not change `emails/`, transactional email renderers, Prisma schema or migrations,
API contracts, deployment files, message catalogs, global theme configuration, `package.json`, or
`pnpm-lock.yaml`. The shadcn generation step must not add a runtime dependency.

## 2. Run Focused Component Tests

Run the affected component, semantics, navigation, and accessibility suites:

```bash
pnpm exec vitest run \
  tests/unit/login-accessibility.test.tsx \
  tests/unit/login-form.test.tsx \
  tests/unit/signup-accessibility.test.tsx \
  tests/unit/signup-form.test.tsx \
  tests/unit/account-profile-form.test.tsx \
  tests/unit/account-accessibility.test.tsx \
  tests/unit/account-security-page.test.tsx \
  tests/unit/account-security-dialog.test.tsx \
  tests/unit/personal-data-export-page.test.tsx \
  tests/unit/personal-data-export-panel.test.tsx \
  tests/unit/account-deletion-dialog.test.tsx \
  tests/unit/app-navigation.test.tsx \
  tests/unit/home-navigation.test.tsx
```

Expected:

- Consent submits the existing value, toggles once by label/pointer/Space, exposes checked,
  required, invalid, and disabled state, and focuses its native input when first invalid.
- Each field error is associated only while rendered, is announced once, and keeps stable reserved
  layout space without an empty alert.
- Navigation actions remain links; logout and theme remain buttons with unchanged behavior.
- Callback, operation, and dialog feedback preserve role, priority, atomicity, focus, and restoration.
- Current-session status retains ordered-list semantics and a visible non-color cue.
- Existing axe assertions report no violations.

## 3. Run the Quality Gate

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm audit:prod
```

Expected: every command exits successfully. Coverage remains at or above 80% statements, 75%
branches, 80% functions, and 80% lines. The production build adds no new configuration warning or
route, and the production dependency audit reports no high or critical vulnerability.

## 4. Run Production E2E

```bash
pnpm test:e2e
```

The repository runner creates an isolated PostgreSQL container, applies migrations, builds a fresh
Next.js standalone artifact, starts it on an available loopback port, runs Playwright, and removes
the temporary database and build directory afterward.

Expected: all non-performance tests pass in the `chromium` and tagged `chromium-320` projects. Pay
particular attention to `signup-navigation`, `signup-onboarding`, `account-profile`,
`personal-data-export`, `account-deletion`, `account-security`, `global-footer`, and `smoke` results.
Existing request counts, confirmation steps, callback outcomes, focus checks, and locale-aware
destinations remain unchanged.

## 5. Start the Manual Review Build

For interactive review, start the existing development stack:

```bash
pnpm dev
```

The `predev` script starts the development database, applies migrations, and seeds it. Open the URL
reported by Next.js. Use existing development fixtures only; this feature adds no account or data
setup.

## 6. Exercise Critical Interactions

### Forms and Actions

1. Open sign-up in English, submit every field empty, and confirm focus moves to the name input.
2. Correct fields in order. Toggle consent with its label, Space, and pointer in separate attempts;
   verify one state change per activation and independently operable Terms and Privacy links.
3. Trigger login, sign-up, and profile errors. Confirm errors appear without avoidable layout shift,
   remain tied to their field, and disappear without moving focus.
4. Inspect account-deleted and each sign-up recovery action with browser accessibility tools. Confirm
   native link role, correct localized destination, visible focus, and normal open-in-new-tab behavior
   where the browser offers it.
5. Operate logout and theme controls by keyboard and pointer. Confirm native button role, unchanged
   pending guard for logout, one theme toggle per activation, and no responsive-menu regression.

### Notices, Operations, and Sessions

1. Open Terms and Privacy. Confirm the draft callout is a non-live note and legal reading order is
   unchanged.
2. Open account data. Confirm the sensitivity callout is visible in both themes, its meaning does not
   depend on color, and it is not announced as an urgent page-load event.
3. Exercise personal-data export callbacks and request/download states. Confirm persistent callbacks
   use callouts, dynamic statuses remain inline, countdown text stays non-live, and programmatic focus
   follows the existing outcome.
4. Exercise account security positive and negative callbacks. Confirm polite status versus assertive
   alert behavior and one atomic announcement.
5. Open deletion and session-revocation dialogs. Trigger pending, success, validation, rate-limit, and
   failure states available in the fixtures. Confirm one announcement, unchanged focus placement and
   restoration, descriptive pending labels, and blocked repeated activation.
6. Inspect the active-session collection. Confirm one ordered list, one list item per session,
   unchanged order, CSS row dividers, and current-session text plus icon in a badge. No separator may
   appear as a list item.

## 7. Run the Acceptance Matrix

Repeat the affected pages and states across this matrix:

| Dimension | Required values |
|-----------|-----------------|
| Locale | English at unprefixed routes, Spanish under `/es`, Catalan under `/ca` |
| Viewport | 320 by 900 CSS pixels and 1440 by 900 CSS pixels |
| Appearance | Light and dark |
| Input | Keyboard only and pointer |
| Zoom | 100% and 200% browser zoom |
| Assistive technology | VoiceOver on and off |

For keyboard review, use Tab and Shift+Tab through every changed interactive surface, Space for the
checkbox, Enter for links and buttons, and Escape for dialogs or menus. Focus must remain visible and
must follow the existing order; no control may require a pointer.

For VoiceOver review, verify role, accessible name, checked/current/disabled/invalid state,
descriptions, list count, note/status/alert urgency, and dialog focus restoration. Dynamic text is
announced once with the priority in the UI contract; persistent content is not re-announced as a
duplicate live region.

At every matrix point, verify no clipping, overlap, horizontal page overflow, truncated translated
text, obscured action, unexpected layout movement, color-only meaning, or target smaller than 24 by
24 CSS pixels.

## 8. Final Acceptance

The feature is ready only when all audit rows in the UI contract have verification evidence, every
automated command above passes, the manual matrix has no unresolved regression, and the diff confirms
that email preview, transactional email, persistence, routes, security controls, dependencies, and
deployment behavior remain unchanged.