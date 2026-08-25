# Tasks: Unified Branded Transactional Emails

**Input**: Design documents from `/specs/20260824-branded-transactional-emails/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Automated tests are required by the feature verification strategy and the project constitution. Write each story's tests first and confirm that they fail for the missing behavior before implementation.

**Organization**: Tasks are grouped by user story and ordered by their real prerequisites. US2 and US1 are both P1, with trusted brand configuration completed before operational wrappers consume it. US4 and US3 are both P2, with the six future presentation assets completed before the isolated catalogue verifies all 36 combinations.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel after its stated prerequisites because it changes different files
- **[Story]**: Maps work to US1, US2, US3, or US4
- Every task names the exact file or files it changes or validates

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the selected rendering libraries and expose the isolated local preview command.

- [x] T001 Add `@react-email/components@1.0.12` and `@react-email/render@2.1.0` as runtime dependencies plus `email:dev` as `NEXT_TELEMETRY_DISABLED=1 next dev emails --hostname 127.0.0.1 --port 3001` in package.json and pnpm-lock.yaml

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the pure, typed presentation boundary used by operational messages, future presentation assets, and local previews.

**CRITICAL**: Complete this phase before implementing any user story.

- [x] T002 Create failing shared-contract coverage for exact `subject`/`html`/`text` output, strict structured inputs, URL validation, escaping, HTML/text parity, and side-effect freedom in tests/unit/email-presentation.test.tsx
- [x] T003 Define `EmailLocale`, the closed 12-member `EmailVariant` union, discriminated variant value types, `EmailBrand`, `LocalizedEmailCopy`, `EmailPresentationRequest`, and `RenderedEmailContent` in src/lib/email/presentation/types.ts and src/lib/email/presentation/constants.ts
- [x] T004 [P] Implement trusted brand validation for product identity, canonical origin, contrast-safe primary color, support address, legal identity/address, and one optional deployment-wide absolute HTTPS logo URL that cannot vary by recipient in src/lib/email/presentation/brand.ts
- [x] T005 [P] Build the table-based shared React Email document, primary action, explicit copy/paste fallback, support block, and legal footer with Terms and Privacy links in src/lib/email/presentation/components/email-document.tsx and src/lib/email/presentation/components/email-action.tsx
- [x] T006 Implement the pure React Email render pipeline, deterministic plain-text generation, allowlisted presentation errors, and presentation-only exports in src/lib/email/presentation/render.tsx and src/lib/email/presentation/index.ts

**Checkpoint**: A caller can supply validated brand, locale, copy, and structured values to a pure renderer without importing delivery, environment, recipient, persistence, or business-flow code.

---

## Phase 3: User Story 2 - Configure One Trusted Email Brand (Priority: P1)

**Goal**: Validate one deployment-wide brand before an enabled-mail process becomes ready and propagate only its five non-secret variables to the application service.

**Independent Test**: Validate disabled and enabled configurations directly, launch startup registration with complete and malformed fictional brands, and inspect static deployment configuration to prove the values are required only when mail is enabled, safely redacted, and forwarded only to `app`.

### Tests for User Story 2

- [x] T007 [P] [US2] Add failing conditional configuration cases for `MAIL_BRAND_COLOR`, `MAIL_SUPPORT_EMAIL`, `MAIL_LEGAL_NAME`, `MAIL_LEGAL_ADDRESS`, optional HTTPS-only `MAIL_LOGO_URL`, disabled-mail tolerance, normalization, URL/color constraints, and redacted errors in tests/unit/env.test.ts
- [x] T008 [P] [US2] Add failing startup-registration tests proving `register()` calls `getEnv()` and rejects malformed enabled-mail branding before readiness without exposing values in tests/unit/instrumentation.test.ts
- [x] T009 [P] [US2] Add failing static checks for five GitHub Variables, required-value preflight, app-only Compose forwarding, and absence from secrets, build arguments, `migrate`, and `db` in tests/unit/email-runtime-configuration.test.ts

### Implementation for User Story 2

- [x] T010 [US2] Extend conditional Zod environment validation and normalized enabled-mail configuration with one validated `EmailBrand` assembled from `PROJECT_NAME`, `NEXTAUTH_URL`, and the five brand variables in src/lib/env.ts
- [x] T011 [US2] Add Next.js startup validation whose `register()` awaits no side effects and invokes `getEnv()` before readiness in src/instrumentation.ts
- [x] T012 [P] [US2] Document safe fictional brand placeholders, conditional requirements, GitHub Variable classification, and startup failure behavior in .env.example and README.md
- [x] T013 [P] [US2] Forward the five brand variables only into the existing `app` service, without adding services, ports, volumes, networks, or build arguments, in ./docker-compose.prod.yml
- [x] T014 [P] [US2] Read the five values from GitHub `vars`, fail before deployment when enabled mail lacks a required value, and pass them only to the app runtime in .github/workflows/deploy.yml
- [x] T015 [US2] Supply complete fictional enabled-mail branding to standalone E2E startup while keeping values out of command output and provider payload assertions in scripts/test-e2e.sh and playwright.config.ts

**Checkpoint**: Disabled mail accepts absent or malformed brand variables; enabled mail cannot become ready without the four required values, and no brand value is treated as a secret or propagated outside `app`.

---

## Phase 4: User Story 1 - Receive Consistent Transactional Messages (Priority: P1) MVP

**Goal**: Render and deliver the six existing transactional events through one branded, localized presentation system without changing recipients, destinations, credential lifecycles, provider requests, compensation, public outcomes, or logging policy.

**Independent Test**: With the validated fictional brand from US2, render all six operational variants in `en`, `es`, and `ca`; verify complete branded HTML/plain text, semantic parity, the exact existing destinations and credential rules, then exercise each current business event against the unchanged fake-provider boundary.

### Tests for User Story 1

- [x] T016 [P] [US1] Extend tests/unit/email-presentation.test.tsx with a failing 18-case operational matrix covering complete localized content, one matching destination, optional-logo behavior, long escaped values, locale purity, and the existing-account notice's sole locale-aware credential-free login URL
- [x] T017 [P] [US1] Add failing login-magic-link assertions for its existing event, destination, token scope, expiry, provider payload, acceptance result, and public outcome in tests/integration/magic-link-login.test.ts
- [x] T018 [P] [US1] Update tests/unit/signup-email.test.ts with failing branded-render assertions for signup activation and the existing-account notice while preserving recipient exclusion and credential boundaries
- [x] T019 [P] [US1] Add failing branded-render and single-deletion-credential coverage in tests/unit/account-deletion-email.test.ts
- [x] T020 [P] [US1] Update tests/unit/account-security-email.test.ts with failing branded-render, single-action, escaping, and unchanged provider-boundary assertions
- [x] T021 [P] [US1] Update tests/unit/personal-data-export-email.test.ts with failing branded-render, locale query, single-action, escaping, and unchanged logging-boundary assertions
- [x] T022 [P] [US1] Add failing render-before-send, one-attempt, acceptance, rejection-compensation, superseded-credential, and allowlisted-log checks that exclude recipient, subject, body, URL, credential, template, and brand values in tests/unit/email-logging.test.ts, tests/integration/signup-onboarding.test.ts, tests/integration/account-deletion-reauth.test.ts, tests/integration/account-security-reauth.test.ts, tests/integration/personal-data-export-migration.test.ts, and tests/integration/personal-data-export-observability.test.ts

### Implementation for User Story 1

- [x] T023 [US1] Add the `Email` catalogue namespace and complete operational subject, preview, heading, body, action, fallback, support, and legal copy to src/messages/en.json, src/messages/es.json, and src/messages/ca.json
- [x] T024 [P] [US1] Compose the login magic-link body from its caller-owned absolute credential URL in src/lib/email/presentation/templates/login-magic-link.tsx
- [x] T025 [P] [US1] Compose the signup-activation body from its caller-owned absolute activation URL and expiry context in src/lib/email/presentation/templates/signup-activation.tsx
- [x] T026 [P] [US1] Compose the existing-account signup notice with only the canonical locale-aware credential-free login destination in src/lib/email/presentation/templates/existing-account-signup-notice.tsx
- [x] T027 [P] [US1] Compose the account-deletion reauthentication body from its caller-owned single-use verification URL in src/lib/email/presentation/templates/account-deletion-reauthentication.tsx
- [x] T028 [P] [US1] Compose the account-security reauthentication body from its caller-owned single-use verification URL in src/lib/email/presentation/templates/account-security-reauthentication.tsx
- [x] T029 [P] [US1] Compose the personal-data-export confirmation body from its caller-owned session-bound verification URL in src/lib/email/presentation/templates/personal-data-export-confirmation.tsx
- [x] T030 [US1] Register the six operational `(locale, variant)` catalogue entries and expose exhaustive operational rendering through src/lib/email/presentation/catalog.ts and src/lib/email/presentation/render.tsx
- [x] T031 [P] [US1] Replace Auth.js inline magic-link HTML/text construction with the presentation renderer and normalized `MAIL.brand` while retaining recipient ownership and the existing `sendTransactionalEmail` request in src/lib/auth.ts
- [x] T032 [P] [US1] Migrate signup activation and existing-account builders to the presentation renderer and normalized `MAIL.brand` while retaining URL construction and delivery wrappers in src/modules/signup/email.ts
- [x] T033 [P] [US1] Migrate account-deletion reauthentication to the presentation renderer and normalized `MAIL.brand` while retaining token URL construction and compensation ownership in src/modules/account/deletion/email.ts
- [x] T034 [P] [US1] Migrate account-security reauthentication to the presentation renderer and normalized `MAIL.brand` while retaining token URL construction and compensation ownership in src/modules/account/security/email.ts
- [x] T035 [P] [US1] Migrate personal-data-export confirmation to the presentation renderer and normalized `MAIL.brand` while retaining locale-aware URL construction, one delivery attempt, and `logAttempt: false` in src/modules/account/data-export/email.ts

**Checkpoint**: All six current events render consistently from explicit structured values and still cross the unchanged delivery boundary exactly once with the startup-validated deployment brand.

---

## Phase 5: User Story 4 - Prepare Future Messages Without Enabling Them (Priority: P2)

**Goal**: Complete six localized presentation-only variants while making it impossible for production behavior to trigger, send, or mint credentials for them.

**Independent Test**: Render all six future variants in all three locales with fictional structured values, verify the four action-bearing and two informational contracts, then scan and exercise production routes, services, jobs, delivery exports, and credential paths to find zero entry points.

### Tests for User Story 4

- [x] T036 [P] [US4] Extend tests/unit/email-presentation.test.tsx with a failing 18-case future matrix covering complete localized content, four single matching fictional actions, two informational messages with no action destination, escaping, locale purity, optional-logo behavior, and generic-confirmation rejection of caller-provided subject, preview, heading, body, action label, HTML, or plain text
- [x] T037 [P] [US4] Add failing production-unreachability checks for future variants across routes, services, jobs, credential creation, delivery imports, and sending exports in tests/unit/email-architecture.test.ts

### Implementation for User Story 4

- [x] T038 [US4] Add complete catalogue-owned localized copy for personal-data-export ready, account deleted, email change requested, email changed, security alert, and generic confirmation to src/messages/en.json, src/messages/es.json, and src/messages/ca.json
- [x] T039 [P] [US4] Compose personal-data-export ready with one fictional download action and reference display value in src/lib/email/presentation/templates/personal-data-export-ready.tsx
- [x] T040 [P] [US4] Compose informational account-deleted content with no destination or credential value in src/lib/email/presentation/templates/account-deleted.tsx
- [x] T041 [P] [US4] Compose email-change-requested content with one fictional confirmation action and escaped requested-address display value in src/lib/email/presentation/templates/email-change-requested.tsx
- [x] T042 [P] [US4] Compose informational email-changed content with escaped previous/new address display values and no destination in src/lib/email/presentation/templates/email-changed.tsx
- [x] T043 [P] [US4] Compose security-alert content with one fictional review action plus structured event/time display values in src/lib/email/presentation/templates/security-alert.tsx
- [x] T044 [P] [US4] Compose generic confirmation from fixed catalogue copy with only approved reference/display values and one fictional action destination in src/lib/email/presentation/templates/generic-confirmation.tsx
- [x] T045 [US4] Register all six preview-only variants in the exhaustive catalogue without adding a wrapper or export from the delivery boundary in src/lib/email/presentation/catalog.ts and src/lib/email/presentation/index.ts

**Checkpoint**: The pure renderer supports all 12 variants and all 36 locale combinations, while production has sending wrappers only for the original six operational variants.

---

## Phase 6: User Story 3 - Review Every Message Locally (Priority: P2)

**Goal**: Provide an isolated, loopback-only Next.js catalogue with exactly 36 fictional previews and display, HTML-source, and plain-text inspection modes, without any sending or business capability.

**Independent Test**: Start only `pnpm email:dev` with no application configuration or external service, navigate every one of the 36 locale/variant routes, inspect all three views and representative widths, and prove every network request remains within the loopback preview while no application, database, provider, credential, recipient input, form, action endpoint, log event, or send control is reached.

### Tests for User Story 3

- [x] T046 [P] [US3] Create failing manifest tests for the exact 12-by-3 Cartesian product, normative paths, stable ordering, unique keys, fictional reserved-host values, and zero real recipient/credential data in tests/unit/email-preview-catalog.test.ts
- [x] T047 [P] [US3] Extend tests/unit/email-architecture.test.ts with failing isolation checks that preview code imports presentation only and defines no provider, environment, database, auth, recipient, form, upload, server action, API route, application logger, or send surface
- [x] T048 [P] [US3] Add failing Playwright coverage that starts only the loopback preview, opens all 36 detail routes, exercises display/source/text views and representative widths, fails on any non-loopback document or asset request, captures zero application operational events, and finds no recipient, form, send, provider, credential, or mutation control in tests/e2e/email-preview-catalog.spec.ts

### Implementation for User Story 3

- [x] T049 [P] [US3] Configure the separate local Next.js project and preview-only Playwright web server without a production package or runtime dependency in emails/next.config.ts, emails/tsconfig.json, emails/next-env.d.ts, and emails/playwright.config.ts
- [x] T050 [P] [US3] Generate the typed 36-entry manifest and obviously fictional per-variant values from closed locale/variant constants in emails/lib/preview-manifest.ts and emails/lib/preview-fixtures.ts
- [x] T051 [P] [US3] Build display, escaped HTML-source, plain-text, and desktop/mobile segmented inspection controls with no form or network action in emails/components/preview-inspector.tsx and emails/components/viewport-control.tsx
- [x] T052 [US3] Create the isolated catalogue layout and responsive visual system in emails/app/layout.tsx and emails/app/globals.css
- [x] T053 [US3] Implement the catalogue index grouped by locale with exactly 36 localized variant links in emails/app/page.tsx
- [x] T054 [US3] Implement the display-only `/{locale}/{variant}` page from `previewManifest`, static parameters, validated fixture brand, and not-found handling in emails/app/[locale]/[variant]/page.tsx

**Checkpoint**: The isolated project exposes only the 36 display routes on `127.0.0.1:3001`; automated navigation of every route reaches only loopback preview resources and cannot submit a provider request or invoke application behavior.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Prove release-package completeness, bounded rendering, unchanged provider behavior, deployment isolation, and automated layout compatibility.

- [x] T055 Combine every fixture and representative long values with a fictional recipient/locale, serialize both existing provider request shapes below the 1 MiB UTF-8 boundary, prove an oversize operational body fails before network submission without content logging, and enforce warm-render p95 below 100 ms plus all 36 renders below 5 seconds in tests/unit/email-presentation.test.tsx, tests/unit/email-brevo.test.ts, tests/unit/email-mailjet.test.ts, and tests/integration/email-response-time.test.ts
- [x] T056 [P] Exercise all six operational events from the standalone artifact against the fake provider and assert exact Brevo/Mailjet request shapes and counts in tests/e2e/transactional-email-release.spec.ts and tests/e2e/helpers/provider-http-fixture.ts
- [x] T057 [P] Add standalone startup cases for malformed required branding, redacted diagnostics, pre-health exit, and absent preview/future production routes in tests/e2e/transactional-email-startup.spec.ts
- [x] T058 [P] Extend release-package architecture checks for locked runtime dependencies, standalone tracing completeness, no React Email CLI/UI package, no preview artifact in the runner, and no Prisma migration in tests/unit/email-architecture.test.ts and tests/unit/email-migration.test.ts
- [x] T059 Execute both-provider standalone E2E, the production runner build, and non-secret Compose service inspection exactly as documented in specs/20260824-branded-transactional-emails/quickstart.md using scripts/test-e2e.sh, docker/Dockerfile, and docker-compose.prod.yml
- [x] T060 Run lint, typecheck, coverage, production build, production dependency audit, full Spec Kit validation, `git diff --check`, and final no-migration/no-preview/no-send-surface review from specs/20260824-branded-transactional-emails/quickstart.md and .github/workflows/ci.yml

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; complete T001 first so renderer imports and preview startup resolve from the locked runtime graph.
- **Foundational (Phase 2)**: Depends on Setup and blocks all story implementation.
- **US2 (Phase 3)**: Depends only on Foundational and supplies normalized startup-validated branding to operational wrappers.
- **US1 (Phase 4)**: Depends on US2 so T031-T035 consume the completed `MAIL.brand` contract without a backward task dependency.
- **US4 (Phase 5)**: Depends on US1's operational catalogue shape and completes the remaining six presentation-only variants without production behavior.
- **US3 (Phase 6)**: Depends on US4's T045 registration so its first implementation increment can list, render, and navigate all 36 previews.
- **Polish (Phase 7)**: Depends on all story phases and completes the automated release gates.

### User Story Dependencies

- **US2 (P1)**: Independently testable after Foundational; it changes configuration/startup/deployment only and does not depend on message templates.
- **US1 (P1)**: Independently testable after US2; it consumes validated branding but preserves all existing business and delivery behavior.
- **US4 (P2)**: Independently renderable and testable after US1; it adds presentation assets only and introduces no preview or delivery behavior.
- **US3 (P2)**: Independently testable after US4; all 12 variants exist before the isolated 36-route catalogue is implemented.

### Within Each User Story

- Write the listed tests first and confirm failure for the missing behavior.
- Add localized catalogue copy before variant template composition.
- Complete all variant templates before registering them in the exhaustive catalogue.
- Keep URL and credential creation in existing business owners; pass only finished absolute destinations into presentation.
- Complete core implementation before running integration and release-package gates.

### Parallel Opportunities

- T004 and T005 can proceed in parallel after T003.
- US2 test tasks T007-T009 can proceed in parallel; T012-T014 can proceed in parallel after T010 fixes the configuration contract.
- US1 test tasks T016-T022 touch separate test surfaces and can proceed in parallel; template tasks T024-T029 and wrapper tasks T031-T035 form two later parallel batches.
- US4 tests T036-T037 can proceed in parallel; templates T039-T044 can proceed in parallel after T038.
- US3 test tasks T046-T048 and initial implementation tasks T049-T051 can proceed in parallel within their respective batches.

---

## Parallel Example: User Story 1

```text
Task T017: Login magic-link integration assertions in tests/integration/magic-link-login.test.ts
Task T018: Signup presentation assertions in tests/unit/signup-email.test.ts
Task T019: Account-deletion presentation assertions in tests/unit/account-deletion-email.test.ts
Task T020: Account-security presentation assertions in tests/unit/account-security-email.test.ts
Task T021: Data-export presentation assertions in tests/unit/personal-data-export-email.test.ts

Then, after T023:
Task T024: Login magic-link template
Task T025: Signup-activation template
Task T026: Existing-account notice template
Task T027: Account-deletion reauthentication template
Task T028: Account-security reauthentication template
Task T029: Personal-data-export confirmation template
```

## Parallel Example: User Story 2

```text
Task T007: Conditional environment tests in tests/unit/env.test.ts
Task T008: Startup-registration tests in tests/unit/instrumentation.test.ts
Task T009: Deployment-contract tests in tests/unit/email-runtime-configuration.test.ts

Then, after T010:
Task T012: Local/runtime configuration documentation
Task T013: Production Compose forwarding
Task T014: GitHub Variables and deploy preflight
```

## Parallel Example: User Story 3

```text
Task T046: Exact manifest and fixture tests
Task T047: Preview isolation architecture tests
Task T048: All-36-route Playwright isolation tests

Then:
Task T049: Isolated Next.js project configuration
Task T050: Typed manifest and fictional fixtures
Task T051: Inspection and viewport controls
```

## Parallel Example: User Story 4

```text
Task T036: Future-variant rendering matrix
Task T037: Generic-copy ownership and production-unreachability tests

Then, after T038:
Task T039: Personal-data-export ready template
Task T040: Account-deleted template
Task T041: Email-change-requested template
Task T042: Email-changed template
Task T043: Security-alert template
Task T044: Generic-confirmation template
```

---

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational.
2. Complete US2's trusted brand, startup, and deployment configuration.
3. Complete US1's renderer, six operational variants, domain wrappers, and focused tests.
4. Stop and validate the combined US2 + US1 production-ready MVP.
5. Run the focused operational and configuration gates before deployment.

### Incremental Delivery

1. Setup + Foundational establishes the pure presentation contract.
2. US2 supplies the mandatory runtime brand and startup gate; US1 then adds consistent operational messages.
3. US4 completes the six future presentation-only assets without adding a production behavior.
4. US3 builds and verifies the isolated exact-36 preview catalogue over the complete renderer.
5. Complete all automated release gates before release.

### Parallel Team Strategy

1. The team completes Setup and Foundational together.
2. One developer completes US2 configuration/startup, then hands the normalized brand contract to the US1 owner.
3. After US1 fixes the complete operational catalogue shape, another developer completes US4 copy/templates.
4. The US3 owner can prepare isolated project/UI files in parallel but closes the 36-route story only after T045.
5. Run Phase 7 only after all story checkpoints are green.

---

## Notes

- No task adds a Prisma model, migration, queue, worker, service, route, volume, port, or provider redesign.
- Presentation receives no recipient, provider credential, persistence handle, logger, or caller-provided HTML/plain text.
- Preview fixtures use reserved hosts and obviously fictional values only.
- Future variants remain presentation exports only; a later sending workflow requires a separate feature specification.
- `[P]` means files do not overlap within that batch; it does not remove the preceding dependency.
