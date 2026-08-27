---

description: "Implementation tasks for standardizing shared UI primitives"
---

# Tasks: Standardize UI Primitives

**Input**: Design documents from `/specs/20260826-standardize-ui-primitives/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/ui-primitives.md](./contracts/ui-primitives.md), and
[quickstart.md](./quickstart.md)

**Tests**: Automated tests are required by the specification and plan. In each user-story phase,
write or strengthen the listed tests first, confirm the new assertions fail for the expected reason,
then implement the corresponding behavior.

**Organization**: Tasks are grouped by user story so each story can be implemented and verified as
an independent increment. No task changes persistence, routes, server contracts, translations,
deployment, the email preview application, or transactional email markup.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its phase prerequisites because it touches different files and
  does not depend on another incomplete task in the same parallel group.
- **[Story]**: Maps the task to User Story 1, 2, or 3 from the feature specification.
- Every task includes exact repository-relative file paths.

## Phase 1: Setup (Shared Sources)

**Purpose**: Add only the registry sources approved by research, using the configured shadcn preset.

- [X] T001 Run `pnpm exec shadcn add checkbox alert badge --dry-run`, confirm its manifest contains only `src/components/ui/checkbox.tsx`, `src/components/ui/alert.tsx`, and `src/components/ui/badge.tsx`, then run the same command without `--dry-run` and verify `package.json`, `pnpm-lock.yaml`, `components.json`, and `src/app/globals.css` remain unchanged

---

## Phase 2: Foundational (Blocking Primitive Contracts)

**Purpose**: Prove and, where necessary, normalize the generated APIs that all user stories rely on.

**CRITICAL**: Complete this phase before any user-story migration.

- [X] T002 Add focused generated-primitive contract tests for checkbox form participation and native-input focus, alert role override, badge text, and separator semantics in `tests/unit/ui-primitives.test.tsx`
- [X] T003 Align the generated implementations with the failing contract tests while preserving registry structure, RSC compatibility, semantic theme tokens, and public APIs in `src/components/ui/checkbox.tsx`, `src/components/ui/alert.tsx`, and `src/components/ui/badge.tsx`

**Checkpoint**: The three approved primitives have stable local contracts and require no dependency,
global-style, runtime, or infrastructure change.

---

## Phase 3: User Story 1 - Complete Forms and Actions Accessibly (Priority: P1) MVP

**Goal**: Standardize consent, field errors, navigation actions, logout, and theme controls without
changing form submission, native roles, destinations, focus, announcements, or activation guards.

**Independent Test**: Complete sign-up, sign-in, profile validation, recovery navigation, logout, and
theme selection with keyboard and pointer; verify native roles and values, first-invalid focus,
conditional error relationships, stable layout, locale-aware destinations, and one activation.

### Tests for User Story 1

- [X] T004 [P] [US1] Extend consent and field-feedback tests to assert checkbox FormData value, label/Space/pointer activation, native-input focus, checked/required/invalid/disabled state, conditional `aria-describedby`, no empty alert, stable error layout, and unchanged inline form-level status with reserved space and polite/assertive priority in `tests/unit/signup-form.test.tsx` and `tests/unit/signup-accessibility.test.tsx`
- [X] T005 [P] [US1] Extend login feedback tests to assert conditional error association, a single rendered alert, preserved minimum-height layout, pending label, and assertive versus polite form status in `tests/unit/login-form.test.tsx` and `tests/unit/login-accessibility.test.tsx`
- [X] T006 [P] [US1] Extend profile tests to assert first-invalid native-input focus, conditional `FieldError` association, reserved layout, pending focus behavior, and unchanged inline form status in `tests/unit/account-profile-form.test.tsx` and `tests/unit/account-accessibility.test.tsx`
- [X] T007 [US1] Extend action and navigation tests to assert account-deleted and recovery actions remain links and logout/theme controls remain single-activation native buttons with accessible names, pending state, title help, and locale behavior in `tests/unit/signup-form.test.tsx`, `tests/unit/account-routes.test.tsx`, `tests/unit/app-navigation.test.tsx`, and `tests/unit/home-navigation.test.tsx` after T004 completes
- [X] T008 [US1] Extend production-flow coverage for keyboard consent, validation focus and announcements, recovery link semantics and destinations, responsive navigation, logout guarding, and theme activation in `tests/e2e/signup-onboarding.spec.ts`, `tests/e2e/signup-navigation.spec.ts`, `tests/e2e/account-profile.spec.ts`, and `tests/e2e/smoke.spec.ts`

### Implementation for User Story 1

- [X] T009 [US1] Replace the native policy input with generated `Checkbox` and replace sign-up error paragraphs with conditionally rendered `FieldError` nodes inside stable layout containers while preserving field names, IDs, policy links, descriptions, validation, first-invalid focus, and the inline form-level status role, live priority, and reserved space in `src/modules/signup/components/signup-form.tsx`
- [X] T010 [P] [US1] Replace the login email error paragraph with a conditional `FieldError` inside a stable layout container and update `aria-describedby` without changing form-level status semantics in `src/modules/login/components/login-form.tsx`
- [X] T011 [P] [US1] Replace the profile name error paragraph with a conditional `FieldError` inside a stable layout container and preserve description IDs, first-invalid focus, submit focus, and inline form status in `src/modules/account/components/profile-form.tsx`
- [X] T012 [US1] Apply `buttonVariants()` to the account-deleted locale-aware anchor and confirm sign-up recovery anchors use the same shared presentation without `Button` composition or destination changes in `src/app/[locale]/account-deleted/page.tsx` and `src/modules/signup/components/signup-form.tsx`
- [X] T013 [P] [US1] Render logout and theme native buttons through `NavigationMenuLink` while preserving disabled state, callback URL, accessible names, title help, icons, and responsive menu behavior in `src/components/app-navigation.tsx`
- [X] T014 [P] [US1] Render logout and theme native buttons through `NavigationMenuLink` while preserving disabled state, callback URL, accessible names, title help, icons, and responsive menu behavior in `src/components/home-navigation.tsx`

**Checkpoint**: User Story 1 passes its focused unit, accessibility, and production E2E tests and can
ship as the MVP without User Stories 2 or 3.

---

## Phase 4: User Story 2 - Understand Warnings and Account Status (Priority: P2)

**Goal**: Standardize persistent notices, callback outcomes, current-session status, and account
section boundaries while preserving urgency, live timing, focus, and ordered-list meaning.

**Independent Test**: Visit legal and account data/security surfaces, exercise persistent callbacks
and dynamic operations, and verify note/status/alert behavior, atomic announcements, focus targets,
current-session identification, section order, and one ordered-list item per session.

### Tests for User Story 2

- [X] T015 [P] [US2] Extend legal route tests to assert Terms and Privacy use the shared callout while retaining `role="note"`, translated content, version text, and document reading order in `tests/unit/signup-routes.test.tsx`
- [X] T016 [P] [US2] Extend personal-data page and panel tests to distinguish persistent callback callouts from inline operation feedback and assert warning semantics, status/error roles, countdown `aria-live="off"`, focus targets, and explicit section separators in `tests/unit/personal-data-export-page.test.tsx` and `tests/unit/personal-data-export-panel.test.tsx`
- [X] T017 [P] [US2] Extend security page tests to assert positive and negative callback callouts retain polite/assertive priority, atomicity, localized text, and current-session badge relationships without changing ordered-list count or order in `tests/unit/account-security-page.test.tsx`
- [X] T018 [P] [US2] Strengthen deletion and session-dialog tests to prove pending, success, and error feedback stays inline with existing live priority, atomicity, focus placement/restoration, reserved space, and duplicate-activation guards in `tests/unit/account-deletion-dialog.test.tsx` and `tests/unit/account-security-dialog.test.tsx`
- [X] T019 [US2] Extend production E2E assertions for legal notes, data warning and callbacks, account separators, security callbacks, current-session badge, dialog announcements, focus restoration, and session list semantics in `tests/e2e/global-footer.spec.ts`, `tests/e2e/personal-data-export.spec.ts`, `tests/e2e/account-deletion.spec.ts`, and `tests/e2e/account-security.spec.ts`

### Implementation for User Story 2

- [X] T020 [P] [US2] Replace each legal draft notice with `Alert` and `AlertDescription` while retaining non-live `role="note"`, translated text, version placement, and article reading order in `src/app/[locale]/terms/page.tsx` and `src/app/[locale]/privacy/page.tsx`
- [X] T021 [US2] Use explicit sibling `Separator` nodes between account data sections, remove only the redundant destructive top border, and render invalid URL state as a persistent destructive `Alert` without changing section headings or order in `src/app/[locale]/account/data/page.tsx`
- [X] T022 [P] [US2] Render the sensitivity warning and persistent export callback outcomes with `Alert` composition while retaining dynamic request/download status and errors as inline focusable live feedback in `src/modules/account/data-export/components/data-export-panel.tsx`
- [X] T023 [P] [US2] Render account security page callback outcomes with `Alert` composition while preserving positive status versus negative alert role, live priority, atomicity, and recovered-heading focus in `src/app/[locale]/account/security/page.tsx`
- [X] T024 [P] [US2] Replace the current-session status span with `Badge` while retaining shield icon, translated text, stable description ID, `aria-current` on the owning item, metadata relationships, and CSS list borders in `src/modules/account/security/components/security-session-list.tsx`

**Checkpoint**: User Story 2 passes independently with persistent callouts and status labels
standardized, while dynamic feedback and semantic lists retain their established behavior.

---

## Phase 5: User Story 3 - Useful Enhancements Without Semantic Regressions (Priority: P3)

**Goal**: Prove that reviewed candidates intentionally remain custom or deferred where adopting them
would add noise, providers, interaction models, or weaker semantics.

**Independent Test**: Review pending actions, theme help, terminal states, account navigation,
security-session grouping, email preview boundaries, and transactional email boundaries; verify each
retained/deferred decision has passing regression evidence and no unapproved primitive is added.

### Tests and Audit Evidence for User Story 3

- [X] T025 [US3] Strengthen pending-action tests to assert descriptive labels and existing repeated-activation guards without `Spinner` across `tests/unit/login-form.test.tsx`, `tests/unit/signup-form.test.tsx`, `tests/unit/account-profile-form.test.tsx`, `tests/unit/personal-data-export-panel.test.tsx`, `tests/unit/account-deletion-dialog.test.tsx`, and `tests/unit/account-security-dialog.test.tsx`
- [X] T026 [US3] Strengthen navigation and terminal-state tests to assert independent theme accessible names/title help without `Tooltip`, link-based account navigation with exactly one `aria-current="page"` without `Tabs`/`Sidebar`, and concise recovery layouts without `Empty` in `tests/unit/app-navigation.test.tsx`, `tests/unit/home-navigation.test.tsx`, `tests/unit/account-routes.test.tsx`, and `tests/unit/login-routes.test.tsx` after T025 completes
- [X] T027 [US3] Strengthen session-list tests to assert semantic `ol`/`li` grouping, unchanged item count and reading order, and CSS-only row boundaries without `Item` or inserted `Separator` entries in `tests/unit/account-security-page.test.tsx` and `tests/unit/account-security-dialog.test.tsx` after T025 completes
- [X] T028 [P] [US3] Add scope regression assertions that the main-app primitives are absent from transactional email renderers and that both email-preview control groups remain untouched and deferred in `tests/unit/email-architecture.test.ts` and `tests/unit/email-preview-catalog.test.ts`
**Checkpoint**: Every retained candidate and scope boundary has independent regression evidence;
both preview control groups remain explicitly deferred and transactional email remains excluded.

---

## Phase 6: Polish and Cross-Cutting Validation

**Purpose**: Validate the integrated feature against all behavioral, security, accessibility,
internationalization, visual, scope, and recovery contracts.

- [X] T029 After T004-T028 complete, update every audit row with its implementation and automated-evidence references, retaining concrete rationale for `Item`, `Spinner`, `Tooltip`, `Empty`, `Tabs`, `Sidebar`, both email-preview control groups, and transactional email exclusion in `specs/20260826-standardize-ui-primitives/contracts/ui-primitives.md`
- [X] T030 Run the exact focused Vitest command in section 2 of `specs/20260826-standardize-ui-primitives/quickstart.md` as a validation-only gate; if it fails, reopen the owning T004-T029 task rather than broadening this task
- [X] T031 Create `specs/20260826-standardize-ui-primitives/validation.md`, run `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm build`, and `pnpm audit:prod`, and record command outcomes plus the configured 80/75/80/80 coverage thresholds
- [X] T032 After T031 completes, run `pnpm test:e2e` against the isolated production standalone artifact and record Chromium desktop and tagged 320px results, including unchanged privileged-action request counts and focus behavior, in `specs/20260826-standardize-ui-primitives/validation.md`
- [X] T033 After T032 completes, execute the English/Spanish/Catalan, 320x900/1440x900, light/dark, keyboard/pointer, VoiceOver, and 100%/200% zoom matrix from `specs/20260826-standardize-ui-primitives/quickstart.md` and record roles, announcements, focus, target size, overflow, clipping, and color-independent meaning in `specs/20260826-standardize-ui-primitives/validation.md`
- [X] T034 After T033 completes, verify with `git diff --check` and `git diff --name-only` that no email preview, transactional email, Prisma, route/API contract, message catalog, dependency, global theme, Docker, or deployment file changed, then document source-level rollback and the absence of data migration in `specs/20260826-standardize-ui-primitives/validation.md`

---

## Dependencies and Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependency; starts immediately.
- **Foundational (Phase 2)**: Depends on T001 and blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Phase 2; recommended first because it is the MVP and covers
  critical authentication and account actions.
- **User Story 2 (Phase 4)**: Depends on Phase 2, not on User Story 1.
- **User Story 3 (Phase 5)**: Depends on Phase 2, not on User Story 1 or 2. T025 and T028 can start
  independently; T026 and T027 follow T025 because they share sign-up and session-dialog test files.
- **Polish (Phase 6)**: Depends on T004-T028. T029 consolidates completed audit evidence, T030 runs
  focused tests, and T031-T034 execute serially because they append to the same validation record;
  T034 is the final scope and recovery check.

### User Story Dependency Graph

```text
T001 Setup
  -> T002-T003 Foundation
       |-> US1 (T004-T014) -> MVP
       |-> US2 (T015-T024)
       `-> US3 (T025-T029)
              \     |     /
               T030-T034 Validation
```

### Within Each User Story

1. Add or strengthen the story's automated assertions and observe the expected failure.
2. Implement only that story's standardized surfaces or documented retention evidence.
3. Run the story's focused unit and accessibility tests.
4. Run the story's production E2E slice before declaring its checkpoint complete.

## Parallel Opportunities

### User Story 1

After Phase 2, the first three test groups can be written in parallel; T007 follows T004 because both
edit the sign-up form suite:

```text
Task T004: Sign-up consent and field-feedback tests
Task T005: Login field-feedback tests
Task T006: Profile field-feedback tests
```

After T004-T008 establish the failing contract, these distinct implementations can proceed in
parallel, with T012 waiting for T009 because both edit the sign-up form:

```text
Task T009: Sign-up checkbox and FieldError migration
Task T010: Login FieldError migration
Task T011: Profile FieldError migration
Task T013: App navigation control composition
Task T014: Home navigation control composition
```

### User Story 2

Tests T015-T018 can run in parallel. After their assertions fail as expected, the legal, export,
security callback, and session badge implementations can be split by file:

```text
Task T020: Legal callouts
Task T022: Export warning and callback callouts
Task T023: Security callback callouts
Task T024: Current-session badge
```

T021 owns the account data page and should not overlap with another edit to that page.

### User Story 3

T025 and T028 can start in parallel after Phase 2. T026 and T027 follow T025 because they share
sign-up and session-dialog test files with it. Cross-story audit consolidation occurs later in T029.

## Implementation Strategy

### MVP First

1. Complete T001-T003 to add and validate shared sources.
2. Complete T004-T014 for User Story 1.
3. Stop and run the US1 focused tests and E2E slice.
4. Deliver the MVP only when forms, links, logout, and theme controls retain all native semantics,
   focus, announcements, and activation guards.

### Incremental Delivery

1. **Foundation**: Generated primitives with proven local contracts.
2. **MVP / US1**: Accessible forms and actions.
3. **US2**: Persistent notices, callbacks, separators, and current-session status.
4. **US3**: Evidence-backed retention, deferral, and scope enforcement.
5. **Integrated acceptance**: Full automated gates and manual matrix.

### Multi-Developer Strategy

After Phase 2, one developer may own each user story because their primary source files are
independent. Coordinate shared test files listed in multiple stories, especially
`signup-form.test.tsx`, `account-security-dialog.test.tsx`, and navigation tests, and serialize T029
after all evidence-producing tasks.

## Implementation notes

- `[P]` means parallelizable only after phase prerequisites and listed dependencies are satisfied.
- Preserve existing user-facing text; do not add message keys unless a failing accessibility test
  proves a correction is required by the specification.
- Keep dynamic form, panel, and dialog feedback inline even when it has `status` or `alert` semantics.
- A prominent navigation action remains an anchor styled with `buttonVariants()`; do not render it
  through `Button` if that imposes button semantics.
- Do not create migrations, services, endpoints, environment variables, dependencies, global theme
  changes, or email-preview configuration for this feature.