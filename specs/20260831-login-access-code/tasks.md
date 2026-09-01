---

description: "Task list template for feature implementation"
---

# Tasks: Login Access Code

**Input**: Design documents from `/specs/20260831-login-access-code/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Required. Authentication is a critical flow (constitution Principle XII) and plan.md fixes the verification split: integration tests prove challenge semantics, end-to-end tests prove the three screens and one complete code sign-in.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Application**: `src/app/` for routes and layouts; `src/modules/login/` for business behavior
- **Shared infrastructure**: `src/components/`, `src/lib/`, `src/server/`
- **Tests**: `tests/unit/`, `tests/integration/`, and `tests/e2e/`
- Message catalogs move together: any key added to `src/messages/en.json` must be added to `es.json` and `ca.json` in the same task

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm a clean baseline. No dependency, container, network or environment variable is added by this feature.

- [X] T001 Verify the baseline is green before changing anything: run `pnpm install`, `docker compose up -d --wait db`, `pnpm db:deploy`, then `pnpm lint`, `pnpm typecheck` and `pnpm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The challenge storage, the code primitive, the 5-minute validity, and the email copy that must change with it

**CRITICAL**: No user story work can begin until this phase is complete. The validity change is not shippable on its own — the email copy states the validity, so FR-006 requires both to land together.

- [X] T002 Add `loginCodeHash String?` and `loginCodeAttempts Int @default(0)` to the `VerificationToken` model in prisma/schema.prisma per data-model.md, leaving existing fields, constraints and indexes untouched
- [X] T003 Create the forward-only migration with `pnpm db:migrate --name add_login_access_code` and confirm the generated SQL in prisma/migrations/ contains only the two additive `ALTER TABLE ... ADD COLUMN` statements (no table rewrite, no backfill)
- [X] T004 Run `pnpm db:generate` so src/generated/prisma reflects the new columns
- [X] T005 [P] Create src/modules/login/code.ts exporting `LOGIN_CODE_ALPHABET` (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), `LOGIN_CODE_LENGTH` (10), `generateLoginCode()` using `crypto.randomInt` per position, `normalizeLoginCode()` (trim, upper-case, strip internal whitespace and hyphens), `hashLoginCode({ identifier, code, secret })` producing `sha256("login-code:" + identifier + ":" + code + secret)`, and a constant-time `loginCodeHashesMatch()`
- [X] T006 [P] Write unit tests in tests/unit/login-code.test.ts covering alphabet membership, absence of `I`/`L`/`O`/`U`, uniform distribution sanity over many draws, normalization of pasted/lower-case/hyphenated/line-broken input, rejection of out-of-alphabet characters and wrong lengths, and identifier binding (the same code hashes differently for two addresses)
- [X] T007 [P] Add `LoginStep` (`"email" | "checkEmail" | "code"`) and `LoginCodeResult` union types to src/modules/login/types.ts per contracts/login-code-endpoint.md
- [X] T008 [P] Add `loginCodeSchema` and `parseLoginCode()` to src/modules/login/schema.ts, normalizing before validating and throwing on any non-conforming value
- [X] T009 Parameterize `maxAge` in `createInternalEmailProvider` in src/lib/auth.ts and pass `5 * 60` for the `email` provider only, leaving `signup` and `account-deletion` at `15 * 60`
- [X] T010 [P] Update tests/unit/auth.test.ts:118-136 so the login provider asserts 5 minutes while the signup and account-deletion providers still assert 15
- [X] T011 [P] Update the existing login suites for the shorter validity: `maxAge: 15 * 60` at tests/integration/magic-link-login.test.ts:260, the issued expiry at :171 and the expiry-boundary assertions at :543-546; review the LOGIN token seeding at tests/e2e/helpers/authenticated-user.ts:178 and :203 and adjust only if an assertion depends on the provider's configured validity
- [X] T012 Update `Email.loginMagicLink` in src/messages/en.json, src/messages/es.json and src/messages/ca.json to the 5-minute validity and the reference subject, heading, action label and fallback instruction in contracts/email-presentation.md, so the stated validity never contradicts T009

**Checkpoint**: Storage, code primitive, validity window and matching email copy ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Sign in with the access code from the email (Priority: P1) MVP

**Goal**: A person with an active account can complete sign-in by typing or pasting the code from the login email, creating the same session the magic link would have created.

**Independent Test**: Request access for a seeded active account, read the code from the delivered email, submit it through the manual code form, and confirm a session is created and the browser lands on the validated destination. At this stage the accepted request may go straight to the code step; the dedicated confirmation screen arrives in User Story 2.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T013 [P] [US1] Unit test the code route in tests/unit/login-code-route.test.ts: disabled mail (503), non-canonical origin (421), client and address throttling (429 with `Retry-After`), CSRF failure (403), malformed email or code mapped to the generic 400, the step order in contracts/login-code-endpoint.md, the `X-Robots-Tag: noindex, nofollow` response header, and that `/api/auth/login/code` resolves to this handler rather than being swallowed by the `[...nextauth]` catch-all
- [X] T014 [P] [US1] Integration test the challenge semantics against a real database in tests/integration/login-access-code.test.ts: issuance writes `loginCodeHash` on the same row as the link token; a valid code creates a session and returns the validated `redirectTo`; using the link then the code is refused and vice versa; a newer request invalidates the previous code; an expired challenge is refused; two concurrent valid submissions create at most one session; the fifth failed attempt deletes the challenge; every failure returns the identical body; a delivery failure leaves no usable code; an address with no active account never yields a usable code
- [X] T015 [P] [US1] Integration test the response-time envelope of the code endpoint in tests/integration/login-code-response-time.test.ts, modelled on tests/integration/email-response-time.test.ts: sample accepted responses, rejected responses for an address with a pending challenge, and rejected responses for an address with none, and assert all three fall in the same floor-plus-jitter window (SC-003)
- [X] T016 [P] [US1] Component test the code entry form in tests/unit/login-code-form.test.tsx: pasting a lower-case hyphenated code submits the normalized value, the generic error renders on rejection, the field exposes label, description and `aria-invalid`, and the submit control is disabled while pending

### Implementation for User Story 1

- [X] T017 [US1] Extend src/modules/login/verification-context.ts to publish `{ identifier, token, code }` and to add `runWithLoginCodeAuthorization()` / `getLoginCodeAuthorization()` mirroring the existing signup authorization scope
- [X] T018 [US1] In `createVerificationToken` in src/lib/auth-adapter.ts, generate the code inside the existing advisory-locked transaction, store its keyed hash in `loginCodeHash` on the inserted row, and publish the plaintext code through the verification context (depends on T005, T017)
- [X] T019 [US1] In `useVerificationToken` in src/lib/auth-adapter.ts, add a branch that recognizes the login-code authorization and consumes the row atomically with a `DELETE ... RETURNING` on `(identifier, loginCodeHash, purpose = LOGIN)` guarded by `expires > now()` (depends on T017)
- [X] T020 [US1] In `sendVerificationRequest` in src/lib/auth.ts, await the published code and pass it as `verificationCode` to `renderEmailPresentation`, keeping the existing delivery-failure compensation intact (depends on T017)
- [X] T021 [P] [US1] Add `verificationCode` to `EMAIL_VARIANT_DEFINITIONS.loginMagicLink.valueKeys` in src/lib/email/presentation/constants.ts and to `EmailVariantValues.loginMagicLink` in src/lib/email/presentation/types.ts per contracts/email-presentation.md
- [X] T022 [US1] Validate `verificationCode` in `validateEmailPresentationRequest` in src/lib/email/presentation/render.tsx (exact length and alphabet) and pass it to `EmailDocument` (depends on T021)
- [X] T023 [US1] Add an optional high-legibility code block to src/lib/email/presentation/components/email-document.tsx, rendered beneath the fallback instruction in monospace with `user-select: all`, so it appears in both the HTML and plain-text bodies (depends on T022)
- [X] T024 [P] [US1] Create src/lib/auth-login-code-rate-limit.ts exposing the client and address key builders for `auth:login-code:*`, reusing the hashing shape of src/lib/auth-email-rate-limit.ts
- [X] T025 [US1] Add challenge helpers to src/modules/login/service.ts: look up the unexpired `LOGIN` challenge for a normalized identifier, register a failed attempt transactionally and delete the row once `loginCodeAttempts` reaches 5, and expose the accepted-response timing envelope for reuse on this endpoint (depends on T002, T005)
- [X] T026 [US1] Implement src/app/api/auth/login/code/route.ts following the exact step order in contracts/login-code-endpoint.md, delegating to the Auth.js email callback inside `runWithLoginCodeAuthorization` and copying the delegated `Set-Cookie` headers onto the `{ status: "accepted", redirectTo }` response (depends on T017, T019, T024, T025)
- [X] T027 [US1] Add structured Pino logging to the code route recording only route, outcome class (`accepted` | `rejected` | `throttled`) and correlation id, with the code, the code hash, the placeholder token and the raw address excluded (depends on T026)
- [X] T028 [P] [US1] Create src/modules/login/components/login-code-form.tsx as a single semantic input with `autoComplete="one-time-code"`, accessible label and description, generic error state and pending state per contracts/login-ui-states.md
- [X] T029 [US1] Wire src/modules/login/components/login-form.tsx so an accepted request moves to the code step and submits `email`, `code`, `csrfToken`, `callbackUrl` and `locale` to `/api/auth/login/code`, navigating to the returned `redirectTo` on success (depends on T026, T028)
- [X] T030 [P] [US1] Add the `Login.code.*` keys from contracts/login-ui-states.md to src/messages/en.json, src/messages/es.json and src/messages/ca.json
- [X] T031 [US1] Verify the threat controls end to end: limits charged before any lookup, one generic body for every rejection, the timing envelope applied to accepted and rejected responses alike, and the code absent from every URL, header and log line (depends on T026, T027)

**Checkpoint**: A code from the login email signs a person in, and every challenge invariant in the spec holds

---

## Phase 4: User Story 2 - Dedicated "Check your email" confirmation (Priority: P2)

**Goal**: An accepted access request replaces the email form with a confirmation screen that shows the brand, the entered address and the two actions, identically whether or not an account exists.

**Independent Test**: Submit any syntactically valid address at `/login` and verify the form is replaced by the confirmation screen containing the brand, heading, entered address, "Enter code manually" and "Back to login", with the URL unchanged and no new history entry.

### Tests for User Story 2

- [X] T032 [P] [US2] Component test the confirmation step in tests/unit/login-check-email.test.tsx: heading, temporary-link description, emphasized address, both actions, and identical output for an address with and without an account
- [X] T033 [P] [US2] Extend tests/unit/login-accessibility.test.tsx to assert focus moves to each step's heading on entry, errors are announced assertively, progress politely, and the whole flow is keyboard operable
- [X] T034 [P] [US2] Update tests/unit/login-form.test.tsx for the new accepted behavior — the inline accepted message at :16 is replaced by the confirmation step — and re-assert that the invalid-email, invalid-request, rate-limited and provider-unavailable states still render after the orchestrator rewrite (FR-018)
- [X] T035 [P] [US2] Add tests/e2e/login-access-code.spec.ts covering the three screens, the URL staying at `/login` with no query string across step changes, a reload returning to the email step, "Back to login" returning to a usable email form without a page load (FR-019), and one complete code sign-in reading the code from the mail transport used in end-to-end runs

### Implementation for User Story 2

- [X] T036 [US2] Create src/modules/login/components/login-check-email.tsx rendering the heading, description, emphasized address and the primary and secondary actions per contracts/login-ui-states.md, without claiming the provider delivered anything
- [X] T037 [US2] Convert src/modules/login/components/login-form.tsx into the three-step orchestrator (`email` → `checkEmail` → `code`) holding address, locale and callback path in client state, moving focus to each step heading, adding no history entry and writing nothing to the URL (depends on T029, T036)
- [X] T038 [P] [US2] Add the `Login.checkEmail.*` keys from contracts/login-ui-states.md to src/messages/en.json, src/messages/es.json and src/messages/ca.json
- [X] T039 [US2] Pass the new step messages from src/app/[locale]/login/page.tsx to the login client, keeping the existing brand lock-up above the card as the confirmation screen's logo and brand (depends on T037, T038)
- [X] T040 [US2] Confirm the unknown-address path renders the confirmation screen identically and still sends no email and creates no challenge (depends on T037)

**Checkpoint**: The confirmation screen is the discoverable entry point to manual code entry, and User Stories 1 and 2 both work

---

## Phase 5: User Story 3 - Localized access email with brand, expiry and code (Priority: P3)

**Goal**: Prove the login email carries the brand, the sign-in button, the accurate validity statement and the code, correct in English, Spanish and Catalan, in both HTML and plain text. The localized copy itself lands in Phase 2 (T012) because it must not lag the validity change; this phase verifies and completes the deliverable.

**Independent Test**: Render the `loginMagicLink` variant for each locale and assert the subject, heading, action label, validity statement and code are correct in both bodies, and that the stated validity equals the enforced provider `maxAge`.

### Tests for User Story 3

- [X] T041 [P] [US3] Add tests/unit/email-login-code-presentation.test.ts asserting, for `en`, `es` and `ca`, that the rendered HTML and plain-text bodies both contain the localized subject, heading, action label, validity sentence and the code, and that an out-of-alphabet or wrong-length `verificationCode` raises `INVALID_INPUT`
- [X] T042 [P] [US3] Add a test asserting the validity stated in every locale's `Email.loginMagicLink` copy equals the `email` provider's configured `maxAge`, so the two can never drift

### Implementation for User Story 3

- [X] T043 [P] [US3] Add a `verificationCode` value to the `loginMagicLink` fixture in emails/lib/preview-fixtures.ts so the email preview app still renders and builds
- [ ] T044 [US3] Verify in the preview app (`pnpm email:dev`) that the code block is legible and selectable at desktop and mobile widths in all three locales, that the Spanish and Catalan wording reads naturally rather than literally, and that the plain-text body carries the same essential information (depends on T012, T023)

**Checkpoint**: All three user stories are independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Quality gates and cross-cutting verification

- [X] T045 Run `pnpm test:coverage` and confirm the configured thresholds still pass with the new modules included
- [X] T046 Inspect the structured logs produced by a full login-with-code run and confirm no code, code hash, placeholder token or unredacted address is present
- [X] T047 Validate the migration path: apply the forward migration on a copy of a populated database, confirm in-flight link-only challenges still work, then confirm the corrective `DROP COLUMN` migration leaves the magic-link flow intact
- [ ] T048 [P] Re-check accessibility at 320px width and with keyboard only across the three steps, confirming no layout shift, overflow or overlap
- [ ] T049 Run the full pre-PR gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm audit:prod`, `pnpm build`, `pnpm test:e2e`
- [ ] T050 Walk through the manual scenarios in quickstart.md, including the unknown-address, expiry and attempt-budget cases

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational. Delivers the MVP
- **User Story 2 (Phase 4)**: Depends on Foundational; T037 also depends on T029 from User Story 1 because both edit `login-form.tsx`
- **User Story 3 (Phase 5)**: Depends on Foundational; T044 depends on T012 and on T023 from User Story 1
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent once Phase 2 is done. Self-contained backend plus code entry form
- **User Story 2 (P2)**: Independently testable as a UI slice, but shares `login-form.tsx` with US1, so the two must not be edited concurrently
- **User Story 3 (P3)**: Independently testable through the email renderer; verifies copy delivered in Phase 2 and the code block delivered by US1's T023

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Storage and primitives before services
- Services before the route
- Route before the UI wiring
- Story complete before moving to the next priority

### Parallel Opportunities

- T005, T007, T008, T010 and T011 in Phase 2 touch different files and can run together
- All four User Story 1 test tasks (T013, T014, T015, T016) can run together
- T021, T024, T028 and T030 touch disjoint files and can run together
- T032, T033, T034 and T035 can run together
- T041, T042 and T043 can run together
- Different user stories can be worked on in parallel by different people, except for the `login-form.tsx` and `email-document.tsx` overlaps noted above

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test the code route in tests/unit/login-code-route.test.ts"
Task: "Integration test the challenge semantics in tests/integration/login-access-code.test.ts"
Task: "Integration test the response-time envelope in tests/integration/login-code-response-time.test.ts"
Task: "Component test the code entry form in tests/unit/login-code-form.test.tsx"

# Launch the disjoint implementation files together:
Task: "Add verificationCode to the email variant definition and types"
Task: "Create src/lib/auth-login-code-rate-limit.ts"
Task: "Create src/modules/login/components/login-code-form.tsx"
Task: "Add Login.code.* to en/es/ca"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and validate**: a code from the login email signs a person in, both redemption paths share one challenge, every failure looks the same, and accepted and rejected responses are indistinguishable in timing

At that point the feature already removes the dead end the issue describes. User Story 2 makes it
discoverable, and User Story 3 proves the localized email.

### Incremental Delivery

1. Foundational → User Story 1 → validate → the code path works end to end
2. Add User Story 2 → validate → the confirmation screen makes the code discoverable
3. Add User Story 3 → validate → the email is correct and provably localized in all three languages
4. Polish → run the full CI-equivalent gate before opening the pull request
