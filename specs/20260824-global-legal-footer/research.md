# Phase 0 Research: Global Legal Footer

## Research Inputs

- Feature requirements in `spec.md` and Constitution 1.7.0.
- Existing shell in `src/app/[locale]/layout.tsx`, shared header components, locale-aware
  navigation, policy route constants, message catalogs, and current Vitest/Playwright suites.
- Installed Next.js 16.3.1 guidance for layouts, links, Server Components, and internationalization.
- Project accessibility, shadcn, Playwright, and Vitest guidance.

All technical context and research questions are resolved.

## Decision 1: Own Global Presence in the Localized Root Layout

**Decision**: Render one `AppFooter` from `src/app/[locale]/layout.tsx`, after the existing
flex-growing page-content container and inside the current translation/theme providers.

**Rationale**: This is the repository's only layout for normal localized pages. Next.js layouts are
the supported mechanism for UI shared across child routes, so a single composition point covers
current and future public, authentication, account, and legal pages without page-level edits. The
existing `body` column plus `flex-1` content region already provides the required short-page and
long-page geometry when a normal-flow footer follows it.

**Alternatives considered**:

- Add footer markup to every page: rejected because it permits omissions and duplicates and makes
  future changes route-specific.
- Introduce nested layouts for route groups: rejected because all in-scope routes need identical
  content and no route-specific state.
- Use fixed or sticky positioning: rejected because it can obscure long or dynamically expanding
  content and conflicts with the specification.

## Decision 2: Keep the Footer Server-Rendered and Stateless

**Decision**: Implement `src/components/app-footer.tsx` as an async Server Component with no
`"use client"` directive, state, effect, event handler, authentication lookup, or browser API.

**Rationale**: The component only needs locale-resolved messages and links. Next.js defaults shared
components to the server, and its installed guidance recommends Server Components when no browser
interactivity is required to minimize client JavaScript. The layout has already validated and set
the locale, so the footer can receive that locale directly for server translation lookup.

**Alternatives considered**:

- Client Component using translation hooks: rejected because it adds an unnecessary client boundary
  and hydration work for static navigation.
- Read session/authentication state: rejected because footer behavior must be identical for signed-in
  and signed-out users.
- Hardcode translated strings in JSX: rejected by the constitution's i18n rules and catalog parity
  requirements.

## Decision 3: Reuse Canonical Policy Routes and Titles

**Decision**: Build the two ordered destinations from the existing `POLICY_PATHS` constants and
render them with `Link` from `src/i18n/navigation.ts`. Reuse `Policies.terms.title` and
`Policies.privacy.title` as the canonical visible link labels. Add only a dedicated localized footer
navigation name under a `Footer` catalog namespace.

**Rationale**: `POLICY_PATHS` already defines `/terms` and `/privacy`, while the locale-aware Link
already implements the configured `as-needed` prefix behavior: English remains unprefixed and
Spanish/Catalan retain `/es` and `/ca`. The policy title messages are already translated and match
the legal page headings, so reusing them avoids route and copy drift. A footer-owned navigation name
is new information and therefore belongs in a new catalog key.

**Alternatives considered**:

- Duplicate all hrefs and link labels in the footer: rejected because two sources of truth could
  diverge from the legal pages.
- Construct locale prefixes manually: rejected because the project navigation helper already owns
  locale-prefix policy and future routing changes.
- Move the existing policy module during this feature: rejected as unrelated refactoring; the
  existing shared header already follows repository precedent for consuming domain helpers.

## Decision 4: Use Native Landmarks and Existing Semantic Theme Tokens

**Decision**: Render a native `<footer>` containing one named `<nav>`, an ordered semantic list, and
two text links in Terms-then-Privacy order. Style the component with existing semantic background,
foreground, border, muted-text, ring, and spacing utilities. Let labels wrap, provide at least a
24-pixel link target height, and rely on the existing global `:focus-visible` outline while verifying
its contrast in both themes.

**Rationale**: Native landmarks and links expose the required `contentinfo`, navigation, and link
semantics without custom ARIA roles or JavaScript. Existing theme variables adapt automatically to
light and dark modes and avoid raw color overrides. Flex wrapping and gaps support narrow translated
labels without horizontal overflow. No decorative asset or icon improves these two clear legal
commands, so text links are the most direct design.

**Alternatives considered**:

- Navigation-menu or card primitives: rejected because the footer is simple document navigation,
  not a menu widget or framed content surface.
- Icon-only links: rejected because the destinations have no universally understood symbols and
  would reduce clarity.
- New theme variables or raw colors: rejected because existing semantic tokens cover the states and
  reduce light/dark contrast risk.

## Decision 5: Layer Contract Tests with Production-Artifact E2E

**Decision**: Add one Vitest file for static component markup and catalog parity, plus one
data-driven Playwright suite for route-wide behavior. The browser suite uses semantic role locators,
the existing authenticated-user fixture, current axe-core injection pattern, and explicit viewport,
theme, keyboard, overflow, and geometry assertions.

**Rationale**: Vitest is the cheapest place to lock the component's one named navigation, ordered
two-link contract, canonical href inputs, and catalog key parity. Playwright is required to prove
App Router layout composition, actual locale-prefixed hrefs and navigation, authenticated routes,
browser landmark/focus behavior, CSS geometry, and light/dark rendering against the production
standalone build. Role-based locators test the same semantics exposed to assistive technology.

The E2E route matrix samples each required category in every locale:

- Public: `/`, `/es`, `/ca`
- Authentication: `/login`, `/es/login`, `/ca/login`
- Authenticated account: `/account`, `/es/account`, `/ca/account`
- Terms: `/terms`, `/es/terms`, `/ca/terms`
- Privacy: `/privacy`, `/es/privacy`, `/ca/privacy`

Signed-out coverage applies to public, authentication, and legal routes. Account routes use the
existing seeded session helper. Layout checks cover the specified 320 x 568, 768 x 1024, and
1440 x 900 viewports with short and long pages; dynamically changing content is checked by comparing
footer position before and after adding/removing a tall test-only element inside `main` in the
browser. Automated axe checks cover WCAG A/AA rules; keyboard focus order, 200% zoom/reflow,
VoiceOver naming, and exact contrast measurements remain explicit manual checks where automation is
insufficient.

**Alternatives considered**:

- Unit tests only: rejected because they cannot prove layout inheritance, localized routing, CSS
  geometry, or production browser behavior.
- E2E tests only: rejected because catalog parity and small markup regressions are cheaper and more
  diagnostic in Vitest.
- Screenshot snapshots as the primary assertion: rejected because role, href, count, focus, and
  bounding-box assertions are more stable; screenshots may be retained as diagnostic artifacts.

## Decision 6: Make Extensibility Data-Driven but Local

**Decision**: Define the initial destinations as one ordered immutable component-level collection
whose entries reference canonical path and message keys, then render the list by mapping it once.

**Rationale**: Adding a destination then requires one collection entry and its catalog content,
while layout and pages remain untouched. Keeping this two-item presentation model local avoids a
premature registry abstraction or persistence layer.

**Alternatives considered**:

- Write two unrelated link blocks: rejected because extension would duplicate markup and ordering
  behavior.
- Add a general navigation registry or database configuration: rejected because two static legal
  links do not justify new shared infrastructure, storage, validation, or failure modes.

## Decision 7: Preserve Operations and Security Posture

**Decision**: Make no database, API, deployment, healthcheck, logging, analytics, or policy-version
change.

**Rationale**: The feature only exposes existing public destinations in shared markup. It accepts no
input and handles no user data. Existing CI, container health, structured logs, backups, and rollback
procedures remain sufficient. A normal compatible code rollback fully removes the feature.

**Alternatives considered**:

- Log footer impressions or clicks: rejected because analytics are a non-goal and would introduce
  unnecessary browsing data.
- Add a health or readiness assertion specific to the footer: rejected because production E2E is
  the correct validation surface for rendered application chrome.