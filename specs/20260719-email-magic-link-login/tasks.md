# Tasks: Email Magic Link Login

**Input**: Design documents from `specs/20260719-email-magic-link-login/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/magic-link-login.md`, `quickstart.md`

**Tests**: Mandatory. Write each story's tests first and confirm they fail for the intended missing behavior before implementation. Do not add a feature-specific E2E test.

**Organization**: Tasks are grouped by user story so request privacy, callback completion, failure handling, localized accessibility, and the authentication shell can be implemented and verified as explicit increments. Cross-cutting verification remains in the final phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and does not depend on another incomplete task in the same phase
- **[Story]**: Maps the task to `US1`, `US2`, `US3`, `US4`, or `US5` from `spec.md`
- Every task names the exact repository path it changes or validates

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the required visual/test baseline and establish the login module contract without changing the database or deployment topology.

- [X] T001 Run `pnpm dlx shadcn@4.13.1 add login-03`, create the generator configuration in components.json, and retain the generated primitives under src/components/ui/ for later email-only adaptation
- [X] T002 Add `axe-core` as a pinned development dependency for Vitest DOM accessibility checks in package.json and pnpm-lock.yaml
- [X] T003 [P] Define canonical login request/result, locale, and UI-state types including separate invalid-request and generic invalid-link states matching contracts/magic-link-login.md in src/modules/login/types.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Provide shared validation, CSRF parity, and localized vocabulary required by every story.

**CRITICAL**: No user story implementation starts until this phase passes its focused tests.

- [X] T004 [P] Write failing normalization, 254-character email bound, locale, and invalid-input tests in tests/unit/login-schema.test.ts
- [X] T005 [P] Write failing valid, missing, malformed, mismatched, and constant-time-compatible double-submit CSRF tests in tests/unit/auth-csrf.test.ts
- [X] T006 Implement shared Zod email/locale validation and normalization in src/modules/login/schema.ts
- [X] T007 Implement NextAuth-compatible signed-cookie CSRF prevalidation without private NextAuth imports in src/lib/auth-csrf.ts
- [X] T008 [P] Add complete `Login` namespaces, including exact generic confirmation, separate invalid-request copy, one generic invalid-link recovery message, and every other required state/recovery string, in src/messages/en.json, src/messages/es.json, and src/messages/ca.json

**Checkpoint**: Shared schemas, CSRF validation, contracts, and all locale vocabulary are ready.

---

## Phase 3: User Story 1 - Request a Magic Link Privately (Priority: P1) MVP

**Goal**: A user submits one email field; known and unknown valid addresses receive the identical accepted response, while only an existing account gets a token and no login request can create an account.

**Independent Test**: Submit normalized variants of one known and one unknown address, assert byte-equivalent accepted status/body/headers and exact generic UI text, then assert only the known address caused token/delivery work and neither request created a user.

### Tests for User Story 1

- [X] T009 [P] [US1] Write failing server-policy tests for normalization, case-insensitive lookup of mixed-case stored email, server-only lookup, unknown-address short-circuiting, the controlled-clock request-start-relative floor of 500 ms plus selected 0–100 ms jitter without imposing a 600 ms upper bound, canonical responses, and PII-free outcomes in tests/unit/login-service.test.ts
- [X] T010 [P] [US1] Extend failing route tests for client-limit-before-CSRF ordering, invalid-request and invalid-email responses, no lookup after invalid CSRF, trusted client identity, canonical known/unknown responses, and absence of PII in logs in tests/unit/auth-route.test.ts
- [X] T011 [P] [US1] Write failing component tests for one-field rendering, client validation, pending duplicate prevention, and exact accepted messages in tests/unit/login-form.test.tsx
- [X] T012 [P] [US1] Write failing PostgreSQL integration cases proving an existing user with mixed-case stored email is found case-insensitively and gets a token while an unknown address creates no User or VerificationToken and receives identical observable HTTP output in tests/integration/magic-link-login.test.ts

### Implementation for User Story 1

- [X] T013 [US1] Implement case-insensitive server-only existing-user lookup, normalized address hashing, callback-path construction, canonical public response policy, and shared 500 ms plus 0–100 ms jitter accepted-response floor in src/modules/login/service.ts
- [X] T014 [US1] Wrap `POST /api/auth/signin/email` with client-limit consumption, CSRF validation, email validation, address-limit consumption, known-user delegation, and canonical response replacement in src/app/api/auth/[...nextauth]/route.ts
- [X] T015 [US1] Adapt the generated form to an email-only client state machine with initial, pending, invalid, and accepted states in src/modules/login/components/login-form.tsx
- [X] T016 [US1] Render localized metadata, obtain the CSRF token, and mount the email-only form at the dynamic locale route in src/app/[locale]/login/page.tsx
- [X] T017 [US1] Run and fix the US1 test slice in tests/unit/login-schema.test.ts, tests/unit/auth-csrf.test.ts, tests/unit/login-service.test.ts, tests/unit/auth-route.test.ts, tests/unit/login-form.test.tsx, and tests/integration/magic-link-login.test.ts

**Checkpoint**: Private request behavior is independently usable as the MVP entry flow; known and unknown addresses are publicly indistinguishable.

---

## Phase 4: User Story 2 - Complete Login in the Current Language (Priority: P1)

**Goal**: The newest delivered 15-minute link authenticates once and redirects to the correct locale home; older, expired, malformed, raced, or reused links cannot authenticate.

**Independent Test**: Issue two links for one existing account, prove only the newest link authenticates exactly once, race two callback uses, and verify English, Spanish, and Catalan success/error destinations remain on the canonical origin.

### Tests for User Story 2

- [X] T018 [P] [US2] Extend failing adapter tests for transaction-scoped per-identifier locking, delete-before-create replacement, exact token publication, createUser rejection, and atomic use behavior in tests/unit/auth-adapter.test.ts
- [X] T019 [P] [US2] Extend failing auth-provider tests for 15-minute expiry, localized email copy, locale callback parsing, canonical-origin fallback, and localized `/login/error` redirects in tests/unit/auth.test.ts
- [X] T020 [P] [US2] Extend failing integration cases for newest-only replacement, 15-minute expiry, concurrent single-use callback consumption, database session creation, and `/`, `/es`, `/ca` redirects in tests/integration/magic-link-login.test.ts

### Implementation for User Story 2

- [X] T021 [P] [US2] Implement per-request verification-token publication and cleanup coordination with AsyncLocalStorage in src/modules/login/verification-context.ts
- [X] T022 [US2] Override verification-token creation in the hardened adapter with a PostgreSQL transaction advisory lock, delete-before-create replacement, and exact-token context publication in src/lib/auth-adapter.ts
- [X] T023 [US2] Update the Auth.js email provider for localized 15-minute messages, login error routing, same-origin locale redirects, and exact-token cleanup coordination in src/lib/auth.ts
- [X] T024 [P] [US2] Implement one accessible localized generic invalid-link recovery presentation for malformed, expired, superseded, delivery-failed, and used links in src/app/[locale]/login/error/page.tsx
- [X] T025 [US2] Wire server-constructed locale home/error paths into request and callback handling without accepting foreign absolute destinations in src/modules/login/service.ts
- [X] T026 [US2] Run and fix the US2 test slice in tests/unit/auth-adapter.test.ts, tests/unit/auth.test.ts, tests/unit/login-service.test.ts, and tests/integration/magic-link-login.test.ts

**Checkpoint**: Existing users can independently complete one secure locale-preserving login with the newest link.

---

## Phase 5: User Story 3 - Understand Request Failures (Priority: P2)

**Goal**: Users receive actionable pending, rate-limit, and global-unavailable states while isolated delivery failures remain generic and leave no valid token.

**Independent Test**: Trigger client/address limits, an active shared provider cooldown, and isolated recipient/transport failures; verify `Retry-After`, identical known/unknown behavior, exact-token cleanup, stable localized UI states, and no sensitive logs.

### Tests for User Story 3

- [X] T027 [P] [US3] Write failing shared provider-state tests for fixed-key activation, 60-second expiry, cross-replica reads, positive retry duration, and recipient-rejection exclusion in tests/unit/provider-availability.test.ts
- [X] T028 [P] [US3] Extend failing route tests for every-request client charging including invalid CSRF, valid-only address charging, client-first short-circuiting, `Retry-After`, global `503`, and known/unknown limit parity in tests/unit/auth-route.test.ts
- [X] T029 [P] [US3] Extend failing component tests for pending announcements, invalid-request recovery distinct from `503`, `429` countdown guidance, unavailable feedback, isolated-failure generic acceptance, and retry transitions in tests/unit/login-form.test.tsx
- [X] T030 [P] [US3] Extend failing PostgreSQL integration cases for five-per-client, three-per-address, invalid-email charging, shared provider cooldown, isolated delivery cleanup, and non-restoration of superseded tokens in tests/integration/magic-link-login.test.ts

### Implementation for User Story 3

- [X] T031 [US3] Implement the shared `auth:email:provider:unavailable` marker, 60-second expiry, retry calculation, and provider-wide failure classification over RateLimitBucket in src/lib/provider-availability.ts
- [X] T032 [US3] Add client/address limit ordering, canonical `429`/`503` responses, `Retry-After`, provider-state checks before lookup, and PII-free structured events in src/app/api/auth/[...nextauth]/route.ts
- [X] T033 [US3] Classify SMTP recipient failures as isolated, provider transport/configuration failures as global, invalidate the exact failed token, and keep the discovering response generic in src/lib/auth.ts
- [X] T034 [US3] Add rate-limited, unavailable, retry, and isolated-failure accepted transitions with reserved status space in src/modules/login/components/login-form.tsx
- [X] T035 [US3] Run and fix the US3 test slice in tests/unit/provider-availability.test.ts, tests/unit/auth-route.test.ts, tests/unit/auth.test.ts, tests/unit/login-form.test.tsx, and tests/integration/magic-link-login.test.ts

**Checkpoint**: Operational failures and abuse limits are independently understandable without weakening account privacy.

---

## Phase 6: User Story 4 - Use Login Accessibly on Any Supported Route (Priority: P2)

**Goal**: The full login and recovery experience is localized, responsive, keyboard operable, visibly focused, stably laid out, and free of automated accessibility violations.

**Independent Test**: Render `/login`, `/es/login`, and `/ca/login` at 375×667 and 1440×900, exercise the critical flow by keyboard, run axe against every required state, and verify localized content and stable non-overflowing composition.

### Tests for User Story 4

- [X] T036 [P] [US4] Write failing `axe-core`, label/error association, live-region, focus-order, disabled-state, and one-field/one-action keyboard submission tests for every critical form state in tests/unit/login-accessibility.test.tsx
- [X] T037 [P] [US4] Write failing localized page/metadata/recovery route tests for English, Spanish, and Catalan content and destination paths in tests/unit/login-routes.test.tsx

### Implementation for User Story 4

- [X] T038 [P] [US4] Adapt the official `login-03` composition into a responsive, domain-appropriate email-only card in src/modules/login/components/login-form.tsx and src/app/[locale]/login/page.tsx without password, name, OAuth, social, or registration controls
- [X] T039 [P] [US4] Add project-consistent shadcn theme tokens, visible focus treatment, stable form dimensions, and 375×667/1440×900 overflow safeguards in src/app/globals.css
- [X] T040 [US4] Finalize localized login and recovery composition, metadata, semantic heading order, and locale-aware navigation in src/app/[locale]/login/page.tsx and src/app/[locale]/login/error/page.tsx
- [X] T041 [US4] Finalize associated labels, `aria-invalid`, descriptions, live regions, focus behavior, keyboard submission, and stable status layout in src/modules/login/components/login-form.tsx
- [X] T042 [US4] Run and fix the US4 test slice in tests/unit/login-accessibility.test.tsx, tests/unit/login-routes.test.tsx, and tests/unit/login-form.test.tsx

**Checkpoint**: All four user stories are complete and the critical flow works accessibly in every supported locale.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify privacy, recovery, documentation, and repository-wide quality without widening feature scope.

- [X] T043 [P] Add regression assertions in tests/unit/auth-route.test.ts and tests/unit/auth.test.ts that structured auth logs contain only coarse account-independent categories and approved operational fields, and never contain email, account/user identifiers, recipient-level delivery success/failure, raw/hashed token, verification URL, cookies, or SMTP credentials
- T044 retired when the optional real-provider inbox E2E scope was removed; deterministic SMTP transport coverage remains under T053
- [X] T045 [P] Reconcile implemented commands, provider-state lifetime, cleanup fixtures, controlled-clock timing checks, and exact 375×667/1440×900 manual checks with specs/20260719-email-magic-link-login/quickstart.md
- [X] T046 Run the complete feature-focused unit and PostgreSQL integration suites listed in specs/20260719-email-magic-link-login/quickstart.md and fix only failures attributable to this feature
- [X] T047 Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:coverage`, and `pnpm build`, recording any unrelated pre-existing failure in specs/20260719-email-magic-link-login/quickstart.md
- [X] T048 Confirm the final diff adds no feature browser E2E, Prisma schema/migration, Compose service, committed provider-test secret, SMTP-provider replacement, worker, cache, or account-registration implementation against prisma/schema.prisma, prisma/migrations/, tests/e2e/, docker-compose.yml, docker-compose.prod.yml, and .env.example
- [X] T049 [US5] Add the official shadcn navigation menu to the localized home with anonymous Login and disabled Sign up items, authenticated Log out behavior, and focused component coverage in src/components/home-navigation.tsx, src/app/[locale]/page.tsx, src/messages/en.json, src/messages/es.json, src/messages/ca.json, and tests/unit/home-navigation.test.tsx
- [X] T050 [US5] Add system-aware light/dark mode with `next-themes`, a localized navigation-menu toggle, and focused component coverage in src/components/theme-provider.tsx, src/app/[locale]/layout.tsx, src/components/home-navigation.tsx, src/messages/en.json, src/messages/es.json, src/messages/ca.json, and tests/unit/home-navigation.test.tsx
- [X] T051 [US5] Move the development seed user's name and email from hardcoded values to required `SEED_USER_NAME` and `SEED_USER_EMAIL` environment variables in prisma/seed.mjs, .env.example, and the ignored local .env
- [X] T052 [US5] Rename all application-facing Versmedit branding to Nextself in src/app/[locale]/page.tsx, src/app/[locale]/login/page.tsx, src/app/[locale]/login/error/page.tsx, src/lib/auth.ts, src/messages/en.json, src/messages/es.json, src/messages/ca.json, tests/unit/auth.test.ts, and tests/unit/login-routes.test.tsx
- [X] T053 Remove the optional real-provider inbox E2E test and contract from tests/integration/magic-link-provider.test.ts, .env.example, package.json, README.md, specs/20260719-email-magic-link-login/spec.md, specs/20260719-email-magic-link-login/plan.md, specs/20260719-email-magic-link-login/research.md, specs/20260719-email-magic-link-login/quickstart.md, and specs/20260719-email-magic-link-login/tasks.md while retaining deterministic SMTP transport coverage
- [X] T054 [US5] Add a shadcn navigation-menu language selector with CA, ENG, and ES options in src/components/home-navigation.tsx that preserves the active pathname, marks the current locale, performs canonical full-document locale transitions, and is covered in tests/unit/home-navigation.test.tsx
- [X] T055 [US5] Add a responsive shadcn vertical separator between account actions and language/theme preferences in src/components/home-navigation.tsx and assert its rendered primitive in tests/unit/home-navigation.test.tsx
- [X] T056 [US5] Center the vertical separator and absolutely positioned dark-mode icon in src/components/home-navigation.tsx so their computed vertical centers equal the 36px navigation-control center
- [X] T057 [US5] Replace the language selector translation glyph with a 16×16px Lucide globe icon in src/components/home-navigation.tsx
- [X] T058 [US5] Add a 4px computed gap between the globe icon and active locale label in src/components/home-navigation.tsx without horizontal overflow

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies; T001 precedes T002 if the generator changes package metadata, while T003 can run independently.
- **Phase 2 (Foundational)**: Depends on Setup; blocks every user story.
- **Phase 3 (US1)**: Depends on Foundational and delivers the request MVP.
- **Phase 4 (US2)**: Depends on US1's delegated known-user request path and canonical response wrapper.
- **Phase 5 (US3)**: Depends on US1's endpoint/form and US2's exact-token coordination so failures can be compensated safely.
- **Phase 6 (US4)**: Depends on the complete UI state machine from US1/US3 and recovery route from US2.
- **Phase 7 (Polish and US5)**: Depends on every selected authentication story; T049–T052 and T054–T058 complete US5 while the remaining tasks verify cross-cutting quality.

### User Story Dependency Graph

```text
Setup -> Foundational -> US1 (private request MVP)
                              |
                              +-> US2 (consume newest link)
                                      |
                                      +-> US3 (limits/provider failures)
                                              |
                                              +-> US4 (localized accessible completion)
                                                      |
                                                      +-> Polish
```

The stories are independently testable at their checkpoints, but they are delivered in this order
because later stories intentionally extend the same authentication endpoint and form rather than
duplicating them.

### Within Each User Story

- Write all story tests first and confirm they fail for the expected missing behavior.
- Implement shared models/context before services, services before route/provider integration, and
  route/provider behavior before UI completion.
- Re-run the story slice before proceeding to the next phase.
- Never log fixture emails/tokens/URLs while diagnosing failures.

## Parallel Opportunities

- T003 can run while T001/T002 prepare generated UI and test dependencies.
- T004, T005, and T008 touch separate files and can run in parallel.
- US1 test tasks T009–T012 can be authored in parallel before T013–T016.
- US2 test tasks T018–T020 can run in parallel; all must fail for their intended missing behavior before T021/T024 implementation starts.
- US3 test tasks T027–T030 can run in parallel before T031–T034.
- US4 test tasks T036/T037 can run in parallel; both must fail for their intended missing behavior before T038/T039 implementation starts.
- T043 and T045 can run in parallel before final executable validation; T044 is intentionally retired.

## Parallel Example: User Story 1

```text
Task T009: Write server-policy tests in tests/unit/login-service.test.ts
Task T010: Extend route privacy tests in tests/unit/auth-route.test.ts
Task T011: Write form behavior tests in tests/unit/login-form.test.tsx
Task T012: Write PostgreSQL request integration tests in tests/integration/magic-link-login.test.ts
```

## Parallel Example: User Story 2

```text
Task T018: Extend adapter lifecycle tests in tests/unit/auth-adapter.test.ts
Task T019: Extend provider/redirect tests in tests/unit/auth.test.ts
Task T020: Extend callback integration tests in tests/integration/magic-link-login.test.ts
```

## Parallel Example: User Story 3

```text
Task T027: Write provider-state tests in tests/unit/provider-availability.test.ts
Task T028: Extend rate-limit route tests in tests/unit/auth-route.test.ts
Task T029: Extend failure-state UI tests in tests/unit/login-form.test.tsx
Task T030: Extend PostgreSQL failure integration tests in tests/integration/magic-link-login.test.ts
```

## Parallel Example: User Story 4

```text
Task T036: Write axe/keyboard tests in tests/unit/login-accessibility.test.tsx
Task T037: Write localized route tests in tests/unit/login-routes.test.tsx
Task T038: Adapt login-03 card in src/modules/login/components/login-form.tsx and src/app/[locale]/login/page.tsx
Task T039: Add stable responsive styles in src/app/globals.css
```

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational phases.
2. Complete US1 tests and implementation.
3. Stop at T017 and verify the private request contract independently.
4. Treat this as the MVP entry flow; do not deploy authentication to production until US2 callback
   completion and the remaining security/accessibility phases pass.

### Incremental Delivery

1. **US1**: Private existing-user request with uniform public output.
2. **US2**: Newest-only, single-use, locale-preserving callback completion.
3. **US3**: Shared limits, provider cooldown, and failed-delivery compensation.
4. **US4**: Full localized responsive/accessibility acceptance.
5. **Polish**: Privacy regressions and complete repository gates.

### Multiple-Developer Strategy

After Setup/Foundational, one developer owns the endpoint/service sequence (US1→US3), one owns the
token/provider sequence (US2→US3), and one can prepare US4 tests/shell after the UI contract exists.
Changes to src/app/api/auth/[...nextauth]/route.ts, src/lib/auth.ts,
src/modules/login/components/login-form.tsx, and tests/integration/magic-link-login.test.ts must be
serialized according to task IDs to avoid conflicting edits.

## Notes

- `[P]` marks only tasks with independent files and no incomplete prerequisite in the same phase.
- No task adds a feature-specific E2E test.
- No task changes Prisma schema, migrations, request-limit thresholds, SMTP transport implementation, or deployment
  topology.
- Existing Auth.js, Prisma, Nodemailer, token storage, trusted-proxy policy, and shared PostgreSQL
  limits remain the implementation foundation.
- The mandatory post-implementation compliance hook requires every task to be checked before it can
  pass; partial-phase implementation must stop before invoking that hook.