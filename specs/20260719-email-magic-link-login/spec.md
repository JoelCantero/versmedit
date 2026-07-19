# Feature Specification: Email Magic Link Login

**Feature Branch**: `20260719-email-magic-link-login`

**Created**: 2026-07-19

**Status**: Draft

**Input**: Existing registered users need a localized, email-only sign-in page that sends a short-lived magic link without revealing whether an account exists.

## Clarifications

### Session 2026-07-19

- Q: When is mail-service unavailability publicly observable without revealing account existence? → A: Only from a shared global provider-availability state; isolated delivery failures retain the generic accepted response.
- Q: When does a newly requested link supersede earlier pending links for the same account? → A: Immediately when the new link is issued; only the newest pending link remains valid.
- Q: Which requests consume the per-client and per-address limits? → A: Every server-received request consumes the client limit; every valid normalized address also consumes its address limit regardless of account existence.
- Q: What happens to a newly created token when its isolated delivery attempt fails? → A: It is immediately invalidated; the failure leaves no valid pending token and retains the generic public response.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Request a Magic Link Privately (Priority: P1)

As a registered user, I can submit my email address and receive a magic sign-in link while the public response protects account existence.

**Why this priority**: Requesting the link is the entry point to the complete authentication flow and must not introduce account enumeration or implicit registration.

**Independent Test**: Submit one known and one unknown valid email address, verify that both receive the same public response, and verify that only the known address receives a usable one-time link.

**Acceptance Scenarios**:

1. **Given** a valid normalized email belonging to an existing account, **When** the user requests a link, **Then** the request is accepted, one 15-minute single-use link is issued, and the generic confirmation is shown.
2. **Given** a valid normalized email that does not belong to an account, **When** the user requests a link, **Then** the request is accepted with the same status, response structure, content, and generic confirmation as for an existing account, while no user, profile, account, or verification token is created.
3. **Given** an email containing harmless case or surrounding-space differences, **When** it is submitted, **Then** the normalized address is used to identify the existing account and apply address limits.
4. **Given** an invalid email format, **When** the user submits the form, **Then** no request is accepted and an accessible validation error identifies the email field.

---

### User Story 2 - Complete Login in the Current Language (Priority: P1)

As a registered user, I can use the emailed link once and return authenticated to the home page in the language where I started.

**Why this priority**: A sent link has no user value unless it completes authentication securely and preserves the user's locale.

**Independent Test**: Request and consume a valid link from each supported localized route, then verify authentication and redirection to that locale's home page.

**Acceptance Scenarios**:

1. **Given** a user requests a link from the English login page, **When** the valid link is used, **Then** the user is authenticated and redirected to the English home page.
2. **Given** a user requests a link from the Spanish or Catalan login page, **When** the valid link is used, **Then** the callback retains that locale and redirects to the corresponding localized home page.
3. **Given** a link is malformed, expired, superseded by a newer issued link, delivery-failed, or already used, **When** it is opened, **Then** authentication is denied and the user sees one accessible localized generic invalid-link state without an unverified reason or account information.
4. **Given** a valid link has been consumed successfully, **When** it is opened again, **Then** it cannot authenticate another session.
5. **Given** an account has a pending link, **When** a newer link is issued for that account, **Then** the earlier link becomes invalid immediately and only the newest pending link can authenticate.

---

### User Story 3 - Understand Request Failures (Priority: P2)

As a user, I receive clear, localized, accessible feedback when I must wait or when the mail service is temporarily unavailable.

**Why this priority**: Actionable failure states prevent repeated submissions and make the public authentication flow usable under expected operational limits.

**Independent Test**: Trigger each request state and verify its localized announcement, keyboard behavior, stable layout, and recovery guidance.

**Acceptance Scenarios**:

1. **Given** a link request is in progress, **When** the form is awaiting a result, **Then** the submit button is disabled, duplicate submission is prevented, and assistive technology is informed of the pending state.
2. **Given** a client reaches five requests within 15 minutes, **When** another request is made, **Then** the user receives the localized rate-limit state and the response communicates the remaining wait using `Retry-After`.
3. **Given** an address reaches three requests within 15 minutes, **When** another request is made for that address, **Then** the same rate-limit behavior applies regardless of whether the address belongs to an account.
4. **Given** the shared global provider-availability state reports that mail service is temporarily unavailable, **When** a valid known or unknown address is submitted, **Then** both receive the same localized temporary-service status and content so the user can retry later without exposing account details.
5. **Given** an isolated delivery attempt fails while the shared global provider-availability state remains available, **When** the request completes, **Then** the newly created token is invalidated immediately, no pending token remains valid for that failed request, and the public outcome retains the same generic accepted response and content used for other accepted requests.
6. **Given** a request reaches the server with an invalid email, **When** validation fails, **Then** it consumes one client attempt but no per-address attempt.
7. **Given** a request has a missing, expired, or invalid CSRF token, **When** it reaches the server, **Then** it consumes one client attempt before returning the localized invalid-request state and performs no account lookup.

---

### User Story 4 - Use Login Accessibly on Any Supported Route (Priority: P2)

As a keyboard, mobile, or assistive-technology user, I can understand and operate the login page in English, Spanish, or Catalan.

**Why this priority**: Login is a critical public flow and must be available without relying on a specific device or interaction method.

**Independent Test**: Exercise the complete critical flow at `/login`, `/es/login`, and `/ca/login` using keyboard-only navigation, automated accessibility checks, and mobile and desktop viewports.

**Acceptance Scenarios**:

1. **Given** any supported login route, **When** the page loads, **Then** every visible text and status is presented in the route's language.
2. **Given** a keyboard-only user, **When** they navigate and submit the form, **Then** every control is reachable in a logical order and has a visible focus indicator.
3. **Given** a validation, pending, accepted, limited, unavailable, or invalid-link state, **When** that state appears, **Then** it is announced appropriately without an unexpected layout shift.
4. **Given** a 375×667 mobile viewport or a 1440×900 desktop viewport, **When** the page and each required state are displayed, **Then** the form remains readable and operable without clipped content or horizontal scrolling.

### Edge Cases

- An address differs only by case or surrounding whitespace from the stored address.
- An existing stored address contains uppercase characters; a case-insensitive normalized lookup still finds the account without changing the stored record.
- Repeated invalid-email submissions consume the client allowance but cannot be assigned to an address allowance.
- The same address is submitted from multiple clients, or one client submits multiple addresses, within the shared 15-minute window.
- An unknown address reaches its per-address limit even though no verification token is stored for it.
- A newer link is issued while a previous link for the same account remains unused; the previous link becomes invalid immediately.
- A link is opened exactly at or after its 15-minute expiry boundary.
- A valid link is opened concurrently in two sessions; at most one use succeeds.
- A callback contains a foreign or malformed destination and must not redirect outside the configured canonical origin.
- The shared global provider-availability state changes during a request; the state applied at response time produces the same public outcome for known and unknown addresses.
- An isolated delivery attempt fails after the new token superseded an earlier token; both tokens remain invalid, the public response remains generic, and no token or URL appears in diagnostics or logs.
- The response for a known address may require mail processing while an unknown address does not; obvious response differences are minimized without claiming resistance to statistical timing analysis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The login page MUST be available at `/login`, `/es/login`, and `/ca/login`.
- **FR-002**: The page MUST present all labels, instructions, buttons, validation feedback, request states, and invalid-link states in English, Spanish, and Catalan according to the active route locale.
- **FR-003**: The page MUST adapt the approved `login-03` visual reference to the established visual language and reusable controls of the application while remaining responsive across supported mobile and desktop viewports.
- **FR-004**: The form MUST request only an email address and MUST NOT offer password, name, social-provider, registration, or account-creation controls.
- **FR-005**: The primary action MUST clearly state in each locale that it sends a magic sign-in link.
- **FR-006**: The email address MUST be validated before submission and independently validated by the trusted server-side process before any account lookup or link issuance.
- **FR-007**: The email address MUST be normalized before account lookup and before application of per-address request limits.
- **FR-007a**: Existing-account lookup MUST compare the normalized request case-insensitively so legacy mixed-case stored addresses remain eligible without a data migration.
- **FR-008**: Account lookup MUST occur only within the trusted server-side process.
- **FR-009**: A magic link MUST be issued only when the normalized email belongs to an existing account.
- **FR-010**: A login request MUST NOT create a user, profile, account, or other registration record under any outcome.
- **FR-011**: An unknown email MUST NOT cause a verification token to be generated or stored.
- **FR-012**: Each issued link MUST be single-use, expire after 15 minutes, and cease to be valid when expired, consumed, or immediately superseded by a newer issued link for the same account; at most one pending link per account may remain valid.
- **FR-013**: A successful callback MUST preserve the locale from the request and redirect the authenticated user to the corresponding localized home page.
- **FR-014**: Callback destinations MUST be restricted to the configured canonical application origin.
- **FR-015**: For known and unknown valid emails, the public request outcome MUST use the same HTTP status, response structure, response content, and redirect behavior.
- **FR-016**: Every accepted request MUST show exactly the generic message for the active locale: English, "If an account exists for this address, you will receive a link to sign in."; Spanish, "Si existe una cuenta asociada a esta dirección, recibirás un enlace para iniciar sesión."; Catalan, "Si existeix un compte associat a aquesta adreça, rebràs un enllaç per iniciar sessió."
- **FR-017**: The interface and public response MUST NOT use "user not found", "email not registered", or any equivalent wording or signal.
- **FR-018**: The request flow MUST retain the existing shared limits of five attempts per client and three attempts per normalized address in any 15-minute window; every request received by the server MUST consume a client attempt before CSRF or email validation, while every valid normalized address consumes an address attempt regardless of account existence.
- **FR-019**: Client identity for request limiting MUST be derived using the application's established trusted-proxy policy and MUST NOT trust arbitrary caller-supplied identity headers.
- **FR-020**: A rate-limited response MUST include `Retry-After`, and the interface MUST communicate the wait state without exposing account existence.
- **FR-021**: During submission, the primary action MUST be disabled to prevent duplicate requests and the pending state MUST be announced to assistive technologies.
- **FR-022**: The interface MUST support initial, pending, accepted, invalid-email, invalid-request, rate-limited, mail-service-unavailable, and generic invalid-link states. The generic invalid-link state MUST cover malformed, expired, superseded, delivery-failed, and already-used links without claiming a specific cause the server cannot verify.
- **FR-023**: The email field MUST have a programmatically associated label; errors and status changes MUST be announced; all actions MUST be keyboard operable; focus MUST remain visible; and state changes MUST not cause unexpected layout movement.
- **FR-024**: Email addresses, verification tokens, verification URLs, and mail credentials MUST NOT appear in application logs.
- **FR-025**: Every accepted valid-email outcome MUST use a shared response floor of 500 ms plus server-selected bounded jitter of 0–100 ms before returning the canonical response, regardless of account existence or isolated delivery result. This control minimizes obvious immediate-response differences but does not claim statistical timing indistinguishability.
- **FR-026**: A localized mail-service-unavailable outcome MUST be returned only when a shared global provider-availability state reports unavailability, and MUST use the same status and content for known and unknown valid addresses.
- **FR-027**: An isolated delivery failure while the shared global provider-availability state remains available MUST immediately invalidate the newly created token, leave no valid pending token for the failed request, retain the generic accepted public status and content, and MUST NOT leak the address, token, verification URL, credentials, delivery result, or account-existence information.

### Verification Requirements

- **VR-001**: Automated component-level verification MUST cover email validation, submission, pending behavior, duplicate prevention, generic confirmation, required error states, and accessibility semantics.
- **VR-002**: Automated integration verification MUST demonstrate that an existing account receives a verification token, can complete login with the newest single-use link, and cannot use an earlier link after a newer one is issued.
- **VR-003**: Automated integration verification MUST demonstrate that an unknown email creates neither a user nor a verification token and receives the same public response as an existing email.
- **VR-004**: Automated comparison MUST assert equal observable HTTP status and response content for known and unknown valid emails and verify that both honor the shared 500–600 ms accepted-response envelope under a controlled clock.
- **VR-005**: Automated verification MUST cover both the five-per-client and three-per-address limits, including `Retry-After`, client consumption before invalid-CSRF and invalid-email rejection, no address consumption for invalid emails, and equal address consumption for known and unknown valid emails.
- **VR-006**: Automated route verification MUST cover English, Spanish, and Catalan login and post-login destinations.
- **VR-007**: The critical request flow MUST pass an automated accessibility check and keyboard interaction verification.
- **VR-008**: Feature-specific end-to-end browser tests MUST NOT be added; the required behavior MUST be verified at component and integration boundaries.
- **VR-009**: Automated integration verification MUST demonstrate that an isolated delivery failure invalidates the newly created token, does not restore a superseded token, and retains the generic public response.

### Key Entities

- **Existing User**: A previously registered person eligible to authenticate; identified for this flow by a normalized email address and never created by login.
- **Magic Link Request**: A public request containing an email and locale, with an observable result deliberately independent of account existence.
- **Verification Token**: A secret, single-use, 15-minute credential associated only with an existing user; issuing a newer token immediately invalidates every earlier pending token, and a failed delivery immediately invalidates the new token rather than restoring an older one.
- **Request Limit Window**: Shared 15-minute counters with a maximum of five server-received requests per trusted client identity and three valid requests per normalized email address, independent of account existence.
- **Locale Context**: The English, Spanish, or Catalan route context retained from request through callback and final home-page redirection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In automated verification, 100% of known-email and unknown-email request pairs return identical observable HTTP status and response content.
- **SC-002**: In automated integration verification, 100% of newest valid links issued to existing test accounts authenticate once within 15 minutes, and 0% of links authenticate after use, expiry, or issuance of a newer link for the same account.
- **SC-003**: In automated integration verification, 0 unknown-email requests create a user, profile, account, or verification token.
- **SC-004**: All three supported login routes complete the request flow in their own language and return successful users to the corresponding localized home page.
- **SC-005**: The critical flow has no automated accessibility violations, is fully operable by keyboard, and announces validation, pending, accepted, limited, unavailable, and invalid-link states.
- **SC-006**: The sixth server-received request from one client and the fourth valid request for one normalized address within 15 minutes are limited in 100% of boundary tests and communicate a valid remaining wait; invalid emails consume only the client counter.
- **SC-007**: At 375×667 and 1440×900 verification viewports, all required interface states remain readable and operable with no horizontal overflow or unexpected layout shift.
- **SC-008**: In automated keyboard interaction tests, a user can submit a valid address using one field and one primary-action activation without encountering an accessibility violation.
- **SC-009**: In automated integration verification, 0 isolated delivery failures leave the newly created token or any superseded token valid.

## Assumptions

- Existing authentication, mail delivery, verification-token storage, shared request limiting, trusted-proxy policy, canonical-origin configuration, and locale routing remain available and retain their current contracts.
- Existing registered accounts already have an email suitable for authentication; account registration and email ownership enrollment occur outside this feature.
- The approved `login-03` reference establishes visual composition only; existing application components and design conventions remain authoritative.
- Issuing a new link for an account immediately supersedes every older outstanding link for that account, leaving only the newest pending link valid.
- A shared global provider-availability state is available to determine whether the public unavailable outcome applies uniformly to all valid addresses; isolated delivery outcomes do not alter the public response.
- No data model or migration is required for this feature.

## Registration Boundary

Registration is a separate account-lifecycle flow and is never initiated or completed by login.

- Registration requires a valid, trimmed, lowercase, unique email address with a maximum length of 254 characters.
- Registration may accept an optional display name; when provided it is trimmed and limited to 80 characters.
- Registration must persist the account through its own server-validated workflow before magic-link login is available.
- Login accepts only previously persisted accounts and never creates, completes, or mutates a registration.
- Registration consent, duplicate-account handling, verification UI, endpoint, and implementation remain outside this feature.

## Non-Goals *(mandatory)*

- Registering accounts or implicitly creating users, profiles, or accounts during login.
- Implementing the separate registration interface, endpoint, consent, or duplicate-account workflow.
- Password authentication, password recovery, or password changes.
- OAuth, social, or other external identity-provider sign-in.
- Profile viewing or modification.
- Changing the mail delivery provider or mail configuration.
- Changing the existing request-limit thresholds, windows, or shared-storage behavior.
- Adding feature-specific end-to-end browser tests.
- Guaranteeing absolute resistance to statistical timing analysis.
- Changing the data schema or introducing migrations.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: The login page and link-request endpoint are intentionally public. Only possession and successful one-time consumption of a valid, unexpired token for an existing account may establish an authenticated session.
- **Account lifecycle**: Registration is a separate server-validated flow requiring a unique normalized email and optionally an 80-character display name. Only previously persisted users may sign in. Unknown addresses receive the same public acceptance response but trigger no account creation and no verification-token generation or storage.
- **Authentication provider verification**: Controlled transport integration covers deterministic SMTP success/failure behavior without depending on a real provider inbox. Feature-specific browser E2E coverage remains intentionally excluded.
- **Data sensitivity**: Email is personal information. Verification tokens, verification URLs, session material, canonical-origin configuration, and mail credentials are confidential and must remain within trusted boundaries.
- **Input validation**: Email format, normalized value, locale, request-limit identity, token validity, token state, and callback destination require trusted server-side validation regardless of client checks.
- **Log hygiene**: Logs must exclude email addresses, tokens, verification URLs, session secrets, and mail credentials in success, rejection, limit, provider-error, and callback paths.
- **Public exposure**: Public access is required so signed-out users can request and consume links. Uniform public outcomes and request limits reduce enumeration and automated abuse risk.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: Attackers may enumerate accounts through content, status, redirects, or obvious timing differences; automate mail flooding; rotate emails behind one client; distribute requests for one address across clients; replay or race tokens; inject untrusted forwarding identity; or manipulate callback destinations for open redirection.
- **Controls**: Normalize and validate input server-side; perform server-only account lookup; return uniform known/unknown public outcomes; expose provider unavailability only through a shared global state; invalidate newly created tokens after isolated delivery failures while retaining the generic accepted response; issue tokens only for existing accounts; charge every server-received request to the shared five-per-client limit and every valid normalized address to the shared three-per-address limit regardless of account existence; derive client identity through the trusted-proxy policy; use 15-minute single-use supersedable tokens; restrict callbacks to the canonical origin; disable duplicate form submission; and exclude sensitive values from logs.
- **Residual risk**: Sophisticated statistical timing analysis may still infer differences, distributed attackers may evade a single-client threshold, and an attacker can intentionally consume request allowance for a known address. These risks are accepted for this scope because public content, status, redirects, obvious timing behavior, and shared limits are controlled while absolute timing indistinguishability and limit redesign are explicitly out of scope.

## Operational Impact

- **Deployment changes**: No new services, runtime configuration, secrets, networks, or volumes are expected.
- **Data & migrations**: No schema change or migration is expected; the existing account, token, and shared request-limit data stores are reused.
- **Recovery**: Deployment can be rolled back without data conversion. Outstanding links continue to follow the existing token lifecycle and may be allowed to expire if rollback invalidates the new localized flow.
- **Observability**: Existing structured operational events may record outcome categories, request-limit decisions, provider availability, and correlation identifiers, but must never include email, token, verification URL, session material, or mail credentials. Account existence must not be inferable from public responses.