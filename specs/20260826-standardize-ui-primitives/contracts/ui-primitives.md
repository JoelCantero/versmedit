# UI Contract: Standardize UI Primitives

**Feature**: [Standardize UI Primitives](../spec.md)

**Model**: [Conceptual data model](../data-model.md)

**Date**: 2026-08-27

## Contract Boundary

This is a rendered user-interface contract for the main Next.js application. It does not add or
change an HTTP endpoint, Server Action signature, database model, event, email contract, route,
translation key, authorization rule, or deployment interface. Existing server behavior is the
authoritative baseline.

The terms **must**, **must not**, and **retain** are acceptance requirements. Shared appearance never
permits changing an element's native meaning, accessible relationships, focus behavior, live-region
timing, localization, or domain ownership.

## Audit Contract

Every source-issue surface has one implementation decision. This table is the feature audit record
required by FR-001, FR-019, and SC-006; verification evidence is added in tests and the acceptance
record during implementation.

| Surface | Classification | Decision and treatment | Rationale | Implementation and automated evidence |
|---------|----------------|------------------------|-----------|---------------------------------------|
| Sign-up policy consent | Confirmed replacement | **Standardize** with generated `Checkbox` inside existing `Field` composition. | Reuses the configured form control while preserving native form participation and consent semantics. | `src/modules/signup/components/signup-form.tsx`; `tests/unit/signup-form.test.tsx`, `tests/unit/signup-accessibility.test.tsx` |
| Login, sign-up, and profile field errors | Confirmed replacement | **Standardize** with existing `FieldError` inside stable layout containers. | Centralizes field feedback without empty alerts or layout movement. | Three domain forms; their form and accessibility unit suites |
| Account-deleted navigation action | Confirmed replacement | **Standardize** its presentation with `buttonVariants()` on the locale-aware `Link`. | A `Button`-rendered anchor receives button semantics in the installed Base UI stack; the anchor must remain a link. | `src/app/[locale]/account-deleted/page.tsx`; `tests/unit/account-routes.test.tsx` |
| Sign-up recovery navigation actions | Confirmed replacement | **Standardize** with `buttonVariants()` on locale-aware `Link` or plain `a`, as already appropriate to the destination. | Preserves client navigation and the Auth sign-out URL behavior while sharing action styling. | `src/modules/signup/components/signup-form.tsx`; `tests/unit/signup-form.test.tsx` |
| Logout controls in app and home navigation | Confirmed review | **Standardize** presentation through `NavigationMenuLink` rendering a native button. | Removes raw trigger duplication while retaining command and pending semantics. | Both navigation components and their unit suites |
| Theme controls in app and home navigation | Confirmed review | **Standardize** presentation through `NavigationMenuLink` rendering a native button. | Shares navigation-control styling without losing its independent accessible name or native hint. | Both navigation components and their unit suites |
| Terms and privacy draft notices | Confirmed replacement | **Standardize** with `Alert` and `AlertDescription`, retaining `role="note"`. | Persistent notices share a callout without becoming live alerts. | Both policy pages; `tests/unit/signup-routes.test.tsx` |
| Personal-data sensitivity warning | Confirmed replacement | **Standardize** with a non-live `Alert` composition and the existing icon and text. | The warning is persistent and benefits from a callout, but must not be announced as a new urgent event on page load. | `src/modules/account/data-export/components/data-export-panel.tsx`; its unit suite |
| Account data and security URL callback notices | Confirmed review | **Standardize** with `Alert` only when the notice originates as persistent page state. | Page callbacks are standalone outcomes; their existing status/alert urgency, atomicity, and focus behavior remain authoritative. | Account data/security pages and export panel; their page/panel unit suites |
| Dynamic form, panel, and dialog statuses | Confirmed review | **Retain** inline `FieldError` or semantic text instead of boxed `Alert`. | Pending and in-place results depend on local context, reserved space, focus, and precise announcement timing. | Form, export, deletion, and session-dialog unit suites |
| Current security-session marker | Confirmed replacement | **Standardize** with generated `Badge`. | It is a compact status label; visible text and shield icon preserve a non-color cue. | `src/modules/account/security/components/security-session-list.tsx`; security page/dialog unit suites |
| Account data/deletion section boundaries | Confirmed replacement | **Standardize** explicit sibling boundaries with existing `Separator`. | Separates sections without transferring layout ownership into domain content. | `src/app/[locale]/account/data/page.tsx`; `tests/unit/personal-data-export-page.test.tsx` |
| Security-session row grouping | Review candidate: `Item` | **Retain** semantic ordered-list rows and existing metadata structure. | `Item` adds wrappers without improving scanning or list meaning. | Security page/dialog unit suites assert direct `ol > li` children and no `item` slot |
| Security-session row dividers | Confirmed review | **Retain** CSS outer and `divide-y` borders. | Separator nodes must not become extra ordered-list entries or disturb reading order. | Security page/dialog unit suites assert no separator within the list |
| Pending action indicators | Review candidate: `Spinner` | **Retain** descriptive pending labels and existing disabled/in-flight guards. | Text names the operation; another indicator adds no required information and risks duplicate announcements. | Six pending-action unit suites assert labels, guards, and no spinner slot |
| Icon-only theme help | Review candidate: `Tooltip` | **Retain** independent `aria-label` and native `title`; do not add a root provider. | The accessible name works without hover, touch, or tooltip availability. | Navigation unit suites assert names, titles, and no tooltip role |
| Account-deleted, invalid-link, and recovery layouts | Review candidate: `Empty` | **Retain** focused domain layouts. | These are specific terminal or recovery outcomes, not empty collections. | Account/login/signup route and form unit suites |
| Account route navigation | Review candidate: `Tabs` | **Retain** `nav` with a list of locale-aware links. | Destinations change URL and document; they are not in-place tab panels. | `tests/unit/account-routes.test.tsx` asserts links, one current page, and no tabs |
| Account route navigation | Review candidate: `Sidebar` | **Retain** the responsive semantic navigation. | Provider state, shortcut, and mobile overlay behavior would redesign the workflow without user value. | `tests/unit/account-routes.test.tsx` asserts no complementary landmark |
| Email preview inspection-mode controls | Deferred control group | **Defer** all shared-control adoption to a separate feature. | The preview application has a separate runtime and configuration boundary. | `tests/unit/email-preview-catalog.test.ts` reads `emails/components/preview-inspector.tsx` |
| Email preview viewport controls | Deferred control group | **Defer** all shared-control adoption to the same follow-up feature. | The follow-up must configure its UI system and review both control groups together. | `tests/unit/email-preview-catalog.test.ts` reads `emails/components/viewport-control.tsx` |
| Transactional email markup | Prohibited scope | **Exclude** application primitives. | Interactive web primitives are not portable email markup and must never affect message output. | `tests/unit/email-architecture.test.ts` scans all presentation sources |

## Form Contract

### Consent Checkbox

- The composed root must expose checkbox role, checked/unchecked state, required state, invalid state,
  disabled state, keyboard operation, and a visible focus indicator.
- The generated primitive must submit the existing `policyAccepted=on` form value when checked and no
  consent value when unchecked, so the existing `FormData` parser and server contract remain intact.
- The underlying native input reference must remain the first-invalid focus target. Focusing after
  validation must not land on a decorative wrapper.
- The existing `signup-policy` identity, field name, policy description, error relationship, and
  sibling label must be retained. Terms and Privacy remain independently operable links.
- Pointer activation, Space activation, and label activation must each toggle the control once.
- The effective target remains at least 24 by 24 CSS pixels and is not clipped at 320px width or 200%
  text zoom.

### Field Errors

- Login email, sign-up name/email/consent, and profile name use `FieldError` for rendered field-level
  validation feedback.
- Each field keeps a stable, non-live minimum-height container. `FieldError` is mounted inside it only
  when a message exists; an empty `role="alert"` must not be mounted.
- `aria-invalid` is true only while the field is invalid. The error ID appears in
  `aria-describedby` only while that error node exists; persistent description IDs remain present.
- Every error ID is unique to its field. Multiple simultaneous errors must not cross-reference one
  another.
- A newly rendered error is announced once. Changing or clearing it while focus remains in the field
  must not force focus movement. Existing submit behavior may focus only the first invalid native
  control.
- Form-level status remains inline with its current reserved space, status/alert role, polite/assertive
  priority, and pending label.

## Action and Navigation Contract

- Navigation-only actions are anchors with unchanged locale-aware destinations, native link role,
  normal destination discovery, visible focus, and one activation per pointer or keyboard action.
- `buttonVariants()` supplies prominent action appearance without wrapping an anchor in `Button`.
- Logout and theme remain `type="button"` controls when rendered by `NavigationMenuLink`. Logout keeps
  its pending disabled state and callback URL; theme keeps its independent `aria-label`, native
  `title`, icon state, and current toggle behavior.
- Account navigation remains a named `nav` containing a list of links. Exactly the current route uses
  `aria-current="page"`; no tab, menu, disclosure, or sidebar interaction model is introduced.
- Existing responsive visibility and navigation-menu keyboard behavior remain unchanged.

## Feedback Contract

`Alert` is a visual composition, not permission to change announcement semantics.

| Feedback source | Presentation | Required semantics |
|-----------------|--------------|--------------------|
| Terms/privacy draft notice | Persistent `Alert` | Retain `role="note"`; no live region. |
| Personal-data sensitivity warning | Persistent `Alert` | Retain non-live page content; icon is hidden from assistive technology and text conveys the warning. |
| Account data invalid URL state | Persistent destructive `Alert` | Retain `role="alert"` and existing page-render timing. |
| Account security positive callback | Persistent default `Alert` | Retain `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`. |
| Account security negative callback | Persistent destructive `Alert` | Retain `role="alert"`, `aria-live="assertive"`, and `aria-atomic="true"`. |
| Personal-data export callback | Persistent `Alert` variant matching outcome | Retain the callback's existing status/alert role, focus target, and one-time page-state announcement. |
| Form submission status | Inline | Retain reserved space and current status/alert urgency. |
| Export action status/error | Inline | Retain `role="status"` or `role="alert"`, current focus target, and countdown `aria-live="off"`. |
| Deletion/session dialog status/error | Inline | Retain current role, live priority, atomicity, reserved space, focus placement, and dialog focus restoration. |

If the generated `Alert` supplies a default alert role, a call site with non-alert semantics must
override or remove that default explicitly. A message must not be duplicated in both an `Alert` and
an inline live region.

## Badge and List Contract

- The current-session `Badge` retains the translated visible label, shield icon, and stable current
  description ID.
- The owning session `li`, not the badge, retains `aria-current="true"`; its accessible name and
  description continue to include title, current-session text, and metadata without duplication.
- Session order, ordinal labels, metadata, sign-out/revocation actions, and list length do not change.
- The session collection remains one `ol` whose direct semantic items are sessions only. Borders are
  presentational; `Separator`, `Item`, or decorative nodes must not add list items.

## Separator Contract

- Account content separators are sibling presentation nodes between the heading/profile, export, and
  deletion sections; they are not headings, landmarks, or list items.
- Redundant section-owned top borders are removed only where an explicit separator replaces the same
  visual boundary.
- Existing vertical navigation separators and security-session borders remain valid and unchanged.
- Section order, heading associations, reading order, and responsive spacing are preserved.

## Localization and Visual Contract

- Existing message catalog text and locale-aware routing remain unchanged for English, Spanish, and
  Catalan.
- Every affected state must fit at 320px by 900px and representative desktop width, in light and dark
  appearances and at 200% zoom, without overlap, clipping, missing text, or horizontal page overflow.
- Meaning must not depend on color. Focus remains visible, controls meet the 24 by 24 CSS-pixel WCAG
  2.2 target minimum, and motion respects the existing reduced-motion behavior.
- Shared primitives use existing semantic tokens and variants; no global theme or one-off parallel
  design system is introduced.

## Security and Behavioral Contract

- Client disabled, checked, invalid, pending, or visible states are feedback only; existing
  server-side authorization, validation, CSRF, rate limiting, session checks, and idempotency remain
  authoritative.
- The number and order of user steps, requests, operation outcomes, stored data, sensitive values,
  public routes, and logs do not change.
- Privileged actions must not become easier to activate accidentally, submit twice while pending, or
  bypass confirmation and reauthentication states.
- No shared application primitive or style is imported into `emails/` or transactional email
  renderers. The separate preview application remains byte-for-byte outside this feature's edits.

## Verification Contract

Implementation is conformant only when:

1. Focused Vitest/Testing Library tests prove native roles, names, values, checked/invalid/disabled
   states, description IDs, one-time activation, first-invalid focus, live-region priority, callback
   atomicity, current-session semantics, and axe results.
2. Production-artifact Playwright flows prove sign-up consent and validation, locale-aware recovery
   links, account navigation, profile feedback, export callbacks/actions, deletion, session status and
   revocation, keyboard operation, focus, and 320px behavior.
3. Manual review covers VoiceOver announcement quality, visible focus, English/Spanish/Catalan long
   content, light/dark appearance, mobile/desktop layout, and 200% zoom.
4. Lint, typecheck, coverage thresholds, production build, and existing critical suites pass without
   weakening or deleting prior assertions.