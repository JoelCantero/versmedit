# Quickstart Validation: Global Legal Footer

## Purpose

Use this guide after implementation to prove the global footer against the feature specification,
the [UI contract](contracts/global-footer-ui.md), and the static presentation rules in
[data-model.md](data-model.md).

## Prerequisites

- Node.js 24 LTS and pnpm 11.x
- Docker with Docker Compose available for database-backed E2E setup
- Repository checked out on `20260824-global-legal-footer`
- Dependencies installed from the lockfile

```bash
pnpm install --frozen-lockfile
```

No new environment variable, secret, external service, or manual database migration is required by
this feature.

## 1. Focused Static and Component Validation

Run the checks closest to the changed surface:

```bash
pnpm exec vitest run tests/unit/app-footer.test.tsx
pnpm typecheck
pnpm lint
```

Expected outcomes:

- The footer renders one `contentinfo` landmark containing one named legal navigation.
- Terms and Privacy are the only links and remain in that order.
- Canonical path inputs are `/terms` and `/privacy`.
- English, Spanish, and Catalan catalogs expose the same footer key set, with exact localized
  navigation names and no English fallback in Spanish or Catalan.
- TypeScript and lint checks pass without new suppressions.

## 2. Production-Artifact E2E

Run the repository's isolated E2E workflow:

```bash
pnpm test:e2e
```

The script creates an ephemeral Compose project and database, applies existing migrations, builds a
fresh standalone production artifact, runs both Playwright projects, and removes temporary state.

Expected outcomes for `tests/e2e/global-footer.spec.ts`:

- The route matrix in the [UI contract](contracts/global-footer-ui.md#verification-matrix) passes
  for public, authentication, authenticated account, Terms, and Privacy pages in all three locales.
- Every sampled route exposes exactly one footer and exactly two localized legal links.
- Actual hrefs and clicked destinations retain the active locale.
- Signed-in account pages expose the same footer contract as signed-out routes.
- Keyboard focus reaches Terms then Privacy and Enter activates each link.
- Browser axe-core finds no serious or critical WCAG A/AA violation attributable to the footer.
- Short, long, and dynamically expanded pages keep the footer after content with no overlap.
- The 320-pixel project and 768/1440 viewport checks produce no horizontal overflow or clipping.
- Light and dark checks preserve readable text and visible focus.

If the E2E command fails, use the retained Playwright trace from the first retry or the generated
test artifact before changing waits or selectors. Assertions should continue using roles and
accessible names rather than test IDs.

## 3. Local Manual Review

Start the normal development environment:

```bash
pnpm dev
```

Open `http://localhost:3000` and use the route matrix from the UI contract.

### Layout and Reflow

1. At 320 x 568, 768 x 1024, and 1440 x 900, inspect the short home page and long Terms page.
2. Confirm the short page places the footer at the viewport bottom without covering content.
3. Confirm the long page places the footer after the final policy content.
4. On the signup page, submit the empty form to reveal validation content; confirm the footer moves
   down with the expanded page and never overlays the messages.
5. Zoom to 200% at the 320-pixel width and confirm both labels wrap without horizontal scrolling,
   clipping, collision, or loss of content.

### Themes, Contrast, and Forced Colors

1. Switch the application between light and dark themes and inspect normal, hover, and keyboard-
   focus states.
2. Measure text/link contrast against the footer background: at least 4.5:1 for normal text or 3:1
   for qualifying large text.
3. Measure the focus indicator against adjacent colors: at least 3:1.
4. Enable the browser or operating system forced-colors/high-contrast mode and confirm links and
   focus remain visible.

### Keyboard and VoiceOver

1. Navigate from the page content into the footer using Tab only.
2. Confirm focus order is Terms followed by Privacy and the global focus outline is unobscured.
3. Activate each link with Enter and confirm the expected localized destination.
4. With VoiceOver on macOS, navigate by landmarks. Confirm one content-information landmark and a
   legal navigation named `Legal information`, `Información legal`, or `Informació legal`.
5. Navigate by links and confirm each legal destination is understandable without nearby text.

Record any discrepancy with locale, route, authentication state, viewport, theme, zoom, and input
method so it is reproducible.

## 4. User Outcome Checks

### First-Attempt Legal Navigation

Recruit at least 10 first-time participants. Randomly assign each participant one Terms or Privacy
destination and one starting route category from public, authentication, account, or legal pages.
Without instruction about footer placement, ask the participant to open the assigned destination
and time the journey from page readiness.

Record an anonymous participant number, initial route category, assigned destination, elapsed time,
and first-attempt result. Do not record names, email addresses, account identifiers, or other
personal data.

Pass condition: at least 9 participants succeed on the first attempt within 20 seconds.

### Extension Review

Perform a code-review exercise without merging a third destination:

1. Identify the single ordered footer destination collection and its message source.
2. Describe the minimal changes for one additional destination.
3. Confirm no page file and no route-specific layout would need modification.

Pass condition: the reviewer can account for the additional destination across every in-scope page
by changing only the shared collection/component contract and required catalog content.

## 5. Final Quality Gate

After focused checks pass, run the complete local pre-PR set:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The feature is ready for review only when all commands pass, the manual accessibility checks are
recorded, and no change appears in Prisma migrations, Compose files, environment templates, policy
versions, or generated framework output.

## 6. Implementation Validation Record

### Automated Evidence

| Check | Result | Reproducible outcome |
|-------|--------|----------------------|
| Focused footer contract | PASS | `pnpm exec vitest run tests/unit/app-footer.test.tsx`: 8 tests passed |
| Lint | PASS | `pnpm lint`: no findings |
| TypeScript | PASS | `pnpm typecheck`: no errors |
| Full Vitest suite | PASS | `pnpm test`: 1,242 passed and 149 skipped |
| Production build | PASS | `pnpm build`: 15 application pages generated |
| Production E2E | PASS | `pnpm test:e2e`: 68 tests passed across both Playwright projects |
| Scope audit | PASS | No changes in policy constants, policy versions, Prisma, Compose, environment templates, authentication, or logging |

The E2E evidence covers the 15-route locale/authentication matrix, both clicked legal
destinations, legal-page self-links, locale switching immediately before activation, browser
axe-core, 320/768/1440 viewports, light/dark themes, 24-pixel targets, wrapped labels, short/long/
dynamic content, keyboard order, visible focus, and Enter activation.

### Manual Accessibility Record

Status: **PENDING HUMAN REVIEW**. Do not mark T015 complete until every row has a reproducible
result from the local manual review above.

| Check | Result | Locale / route / viewport / theme / input notes |
|-------|--------|--------------------------------------------------|
| 200% zoom and reflow | Pending | |
| Measured text/link contrast | Pending | |
| Measured focus-indicator contrast | Pending | |
| Forced-colors/high-contrast visibility | Pending | |
| Keyboard visual review | Pending | |
| VoiceOver landmarks and navigation name | Pending | |
| VoiceOver standalone link names | Pending | |

### First-Attempt Usability Record

Status: **PENDING 10 FIRST-TIME PARTICIPANTS**. Keep records anonymous and fill one randomly
assigned journey per participant; do not enter names, email addresses, account identifiers, or
other personal data.

| Participant | Initial route category | Destination | Elapsed seconds | First attempt within 20 seconds |
|-------------|------------------------|-------------|-----------------|---------------------------------|
| 01 | Pending | Pending | Pending | Pending |
| 02 | Pending | Pending | Pending | Pending |
| 03 | Pending | Pending | Pending | Pending |
| 04 | Pending | Pending | Pending | Pending |
| 05 | Pending | Pending | Pending | Pending |
| 06 | Pending | Pending | Pending | Pending |
| 07 | Pending | Pending | Pending | Pending |
| 08 | Pending | Pending | Pending | Pending |
| 09 | Pending | Pending | Pending | Pending |
| 10 | Pending | Pending | Pending | Pending |

SC-005 remains pending until at least 9 of 10 recorded participants succeed on their first attempt
within 20 seconds.

### Extension Review Record

**PASS** for SC-006. The single ordered collection is `footerDestinations` in
`src/components/app-footer.tsx`; visible labels come from the shared policy-title messages. A
third destination would require updating the canonical destination/message sources, adding one
collection entry, and updating the explicit cardinality/order contract tests. No page file or
route-specific layout would change, so every in-scope page would inherit the addition.