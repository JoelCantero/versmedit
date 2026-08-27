# Research: Standardize UI Primitives

**Feature**: [Standardize UI Primitives](./spec.md)

**Date**: 2026-08-27

## Project Baseline

The project resolves to Next.js 16.3.2, React 19.2.8, Tailwind CSS v4, shadcn 4.19.0 with the
`base-nova` preset, Base UI 1.7.x, Lucide icons, RSC support, and the `@/components/ui` alias.
Installed shared primitives are `Avatar`, `Button`, `Card`, `Dialog`, `Field`, `Input`, `Label`,
`NavigationMenu`, and `Separator`.

A project-aware CLI dry run for `checkbox alert badge` reports exactly three new source files and no
new dependency or global-style change:

- `src/components/ui/checkbox.tsx`
- `src/components/ui/alert.tsx`
- `src/components/ui/badge.tsx`

## Decision 1: Add Only Three Shared Primitives

**Decision**: Add `Checkbox`, `Alert`, and `Badge` through
`pnpm exec shadcn add checkbox alert badge`, resolving the CLI from the committed lockfile; inspect
the generated sources; and leave the resolved preset, aliases, Base UI foundation, and global theme
unchanged.

**Rationale**: Each primitive has a confirmed, recurring application use. The project-aware dry run
adds only source files and reuses existing runtime dependencies and semantic color tokens.

**Alternatives considered**:

- Add every candidate from the issue: rejected because `Item`, `Spinner`, `Tooltip`, `Empty`, `Tabs`,
  and `Sidebar` do not improve the audited surfaces enough to justify new abstractions or client
  behavior.
- Hand-write equivalent wrappers: rejected because the configured registry is the authoritative
  source and the project already follows generated shadcn conventions.
- Modify `globals.css`: rejected because the existing neutral semantic tokens, focus ring, and dark
  appearance support all three generated primitives.

## Decision 2: Compose Checkbox With Existing Field Semantics

**Decision**: Replace the sign-up policy input with the generated `Checkbox`, keep it inside the
horizontal `Field`, keep the sibling `FieldLabel` and policy links, pass the form `name`, `required`,
`disabled`, `aria-invalid`, and `aria-describedby` properties through, and use the primitive's input
reference mechanism so invalid submissions can focus the underlying form control.

**Rationale**: Base UI's checkbox preserves native form submission through its hidden input and
supports checked, required, disabled, valid, invalid, dirty, touched, and focused state. The existing
form reads `FormData`, focuses the first invalid field, and depends on stable description/error IDs;
those behaviors are part of the contract rather than incidental markup.

**Alternatives considered**:

- Keep the native checkbox: viable semantically, but rejected because this is a confirmed shared
  control migration and the generated primitive can preserve the same form behavior.
- Convert the policy text to a wrapping label: rejected because the label contains independent Terms
  and Privacy links; the existing sibling-label relationship avoids ambiguous activation behavior.
- Introduce a new form library: rejected as unrelated scope and unnecessary complexity.

## Decision 3: Reuse FieldError Without Changing Announcement Timing

**Decision**: Replace custom error paragraphs in login, sign-up, and profile fields with the existing
`FieldError`. Because the local component returns `null` without content, place each conditional
`FieldError` inside a stable minimum-height layout container; give the rendered error its existing
stable ID; include that ID in `aria-describedby` only while the error exists; and preserve
first-invalid-field focus behavior.

**Rationale**: `FieldError` is already the project's shared error presentation. The local component
accepts normal element properties and renders `role="alert"` only when it has content. A separate
non-live spacer preserves layout without mounting an empty alert, while the conditional description
token keeps the control-to-error relationship valid.

**Alternatives considered**:

- Let `FieldError` alone control layout: rejected because it unmounts when empty and would remove the
  reserved space.
- Keep an empty `FieldError` mounted: rejected because the component intentionally returns `null`
  and an empty alert would create noisy semantics even if forced.
- Use `Alert` for field errors: rejected because boxed callouts would overstate transient field-level
  feedback and disconnect it from its owning field.

## Decision 4: Preserve Anchor Semantics With Shared Variants

**Decision**: Use `buttonVariants()` on plain locale-aware `Link` or `a` elements for navigational
actions. Replace the account-deleted page's duplicated action classes with `buttonVariants()` and
retain that pattern in sign-up recovery states.

**Rationale**: Current Base UI/shadcn documentation explicitly warns that `Button` applies button
semantics to a rendered anchor. Navigation must remain exposed as a link, and the feature
specification makes correct semantics higher priority than using a particular wrapper. Reusing
`buttonVariants()` still centralizes the visual contract.

**Alternatives considered**:

- Use `<Button render={<Link />}>`: rejected because the current Base UI wrapper can impose
  `role="button"` on the anchor, contradicting the semantic-link acceptance criterion.
- Keep manual action classes: rejected because it duplicates the existing shared variant contract.
- Change the action to a button that performs navigation: rejected because it would alter native link
  behavior, destination discovery, and interaction semantics.

**Documented source-issue exception**: The requested composed `Button` replacement is intentionally
not used for anchors because the installed Base UI API cannot satisfy the same semantic contract.

## Decision 5: Use Alert Only for Persistent Callouts

**Decision**: Use the generated `Alert` and `AlertDescription` for the legal draft notices, the
personal-data sensitivity warning, and standalone account data/security callback notices. Preserve
`role="note"`, `role="status"`, or `role="alert"`, `aria-live`, `aria-atomic`, and any focus target on
the composed root as required by each existing message.

Keep field errors, pending labels, and dynamic success/error lines inside forms and dialogs as inline
`FieldError` or semantic paragraphs.

**Rationale**: Persistent notices benefit from one callout treatment. Dynamic form/dialog messages
already have deliberate mount timing, focus references, and live-region priorities; visually boxing
them would not improve comprehension and could change announcements.

**Alternatives considered**:

- Convert every alert/status role to `Alert`: rejected because ARIA role and visual treatment solve
  different problems and the issue explicitly excludes indiscriminate boxed feedback.
- Keep all custom callouts: rejected because legal and sensitive-data notices duplicate a stable,
  persistent presentation that `Alert` is designed to provide.
- Add custom warning colors globally: rejected because existing semantic tokens and the generated
  variants are sufficient; meaning must not depend on color.

## Decision 6: Add Badge for Current Session

**Decision**: Replace the custom current-session span with the generated `Badge`, retaining the
visible translated text, shield icon, stable description ID, and `aria-current` on the owning list
item.

**Rationale**: The current-session marker is a compact status label, exactly matching `Badge`, and
text plus icon keeps the distinction independent of color.

**Alternatives considered**:

- Keep the custom span: semantically valid, but rejected because it duplicates status-label styling
  and is a confirmed migration.
- Put the badge on the list item as its accessible name: rejected because the session heading and
  metadata already define the row's name and description relationships.

## Decision 7: Use Separator Between Sections, Not Within Session Lists

**Decision**: Insert existing `Separator` nodes between the account header, data-export section, and
delete-account section, and remove the corresponding section-owned top-border styling. Retain CSS
`divide-y` and outer borders for the ordered security-session list.

**Rationale**: Sibling separators make the account page's explicit content boundaries reusable
without changing section headings or relationships. Inserting separator nodes between ordered-list
items risks extra or confusing list semantics and provides no behavior improvement.

**Alternatives considered**:

- Replace every border with `Separator`: rejected because borders remain the correct presentational
  mechanism inside semantic lists and framed components.
- Add separators as list items: rejected because they are not sessions and would corrupt list count
  and reading order.

## Decision 8: Reuse NavigationMenuLink for Navigation Controls

**Decision**: Compose raw logout and theme buttons with the existing `NavigationMenuLink` render API
inside `AppNavigation` and `HomeNavigation`, preserving native button elements, disabled/pending
state, labels, titles, and theme/logout behavior. Keep `AccountNavigation` as a semantic `nav` with a
list of locale-aware links and `aria-current="page"`.

**Rationale**: Top-level controls already live inside `NavigationMenu`; using its link/control
presentation removes duplicated trigger classes without changing the underlying element. Account
navigation changes the URL and exposes all destinations simultaneously, so it is neither a tablist
nor a collapsible application sidebar.

**Alternatives considered**:

- Use `Tabs` for account routes: rejected because tabs represent in-place panel selection, not page
  navigation.
- Add `Sidebar`: rejected because its provider, state, shortcut, and mobile overlay behavior would be
  a navigation redesign rather than a primitive cleanup.
- Use `Button` for top-navigation links: rejected for the anchor-semantics reason in Decision 4.

## Decision 9: Retain Focused Candidate Implementations

**Decision**:

- Retain semantic `<ol>`/`<li>` session rows instead of `Item`/`ItemGroup`.
- Retain descriptive pending button labels and disabled/in-flight safeguards without `Spinner`.
- Retain independent `aria-label` plus native `title` help for icon-only theme controls without a
  root `TooltipProvider`.
- Retain existing terminal/recovery layouts instead of wrapping them in `Empty`.
- Retain account route navigation instead of `Tabs` or `Sidebar`.

Record each decision in the implementation audit so candidates are visibly intentional exceptions.

**Rationale**: These candidates add wrappers, providers, motion, portals, or visual structure without
reducing meaningful duplication. Existing semantics are direct, accessible, and covered by tests.

**Alternatives considered**:

- Add visual spinners alongside pending labels: deferred because text already communicates the exact
  operation and adding an independently announced status icon risks duplicate speech.
- Add rich tooltips: deferred because accessible names must remain independent and the current native
  hint avoids a new app-wide provider.
- Standardize terminal cards as empty states: rejected because these are error/recovery outcomes with
  specific actions, not empty collections.

## Decision 10: Preserve Boundaries and Translations

**Decision**: Keep generated shared primitives in `src/components/ui`, keep domain components in
`src/modules`, and do not touch `emails/`, transactional email renderers, API routes, server actions,
Prisma, deployment files, message catalogs, or global theme configuration unless a test exposes an
existing text defect required for accessibility.

**Rationale**: The feature changes presentation and composition only. Existing server-side
validation, authorization, anti-forgery, idempotency safeguards, routes, and translated messages are
the behavioral baseline.

**Alternatives considered**:

- Initialize shadcn in the email preview application: deferred by the clarification dated 2026-08-27.
- Refactor domain components into generic primitives: rejected because ownership and domain behavior
would become less clear.

## Decision 11: Verify at Component, Production E2E, and Manual Levels

**Decision**: Extend existing Vitest/Testing Library suites for exact role, name, state,
description, focus, live-region, and duplicate-activation behavior; extend existing Playwright flows
against the production artifact for critical signup and account paths; retain axe checks; and run a
manual matrix covering English, Spanish, Catalan, 320px mobile, desktop, light/dark appearance,
keyboard, VoiceOver, and 200% zoom.

**Rationale**: jsdom can prove component state and relationships but not visual contrast, layout,
browser focus behavior, or screen-reader announcement quality. Existing project policy requires
production-artifact E2E for deployable HTTP applications and integration/E2E coverage for critical
authentication flows.

**Alternatives considered**:

- Unit tests only: rejected because they cannot verify production rendering, responsive layout,
  browser focus, or real account-flow integration.
- Screenshot-only regression tests: rejected because they cannot prove roles, accessible names,
  live-region timing, or keyboard operation.
- A new parallel accessibility harness: rejected because the repository already has axe helpers,
  authenticated-user fixtures, locale loops, and production E2E startup orchestration.

## Research Outcome

All technical-context questions are resolved. The pre-design constitution gate remains passing, no
dependency or infrastructure exception is required, and the design can proceed with no
unresolved markers.
