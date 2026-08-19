# Feature Specification: Signup Page

**Feature Branch**: `20260818-signup-page`

**Created**: 2026-08-18

**Status**: Draft

**Input**: New users need a public, localized, passwordless signup flow that collects a valid name and email, proves mailbox control through an onboarding link, signs the verified user in without a separate login, and never turns the existing login flow into an implicit account-creation path.

## Clarifications

### Session 2026-08-18

- Q: After valid signup input, how should an isolated post-validation failure appear publicly? → A: Show the generic accepted confirmation; only shared outages show a public error.
- Q: How should a valid onboarding link behave when another user is already authenticated? → A: Preserve the current session, do not consume the link, and prompt the user to sign out.
- Q: What should happen if account activation succeeds but session establishment fails? → A: Keep the account active, consume the link, and direct the user to localized login.
- Q: How should overlapping signup and activation requests for one pending account be resolved? → A: Commit order wins, with each operation atomically rechecking current state.
- Q: What legal acknowledgment should signup capture? → A: Require one combined Terms and Privacy acceptance with policy versions and an acceptance timestamp.

### Session 2026-08-18 (follow-up)

- Q: What policy content and versions should implementation use? → A: Use clearly labeled, user-authorized development dummy Terms and Privacy copy in English, Spanish, and Catalan with stable `2026-08-18-draft` version identifiers; determining legal sufficiency remains outside scope.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start Registration Privately (Priority: P1)

As a new visitor, I can submit my name and email to start registration while the public result does not reveal whether an account already uses the address.

**Why this priority**: Explicitly starting a new account is the feature's entry point, and a uniform public result is essential to prevent account enumeration.

**Independent Test**: Submit equivalent requests with the required policy acceptance for a new address, an active-account address, and a retained pending-account address; verify identical public outcomes while each address receives only the appropriate private email, no duplicate account is created, and no authoritative policy-acceptance record is persisted before activation.

**Acceptance Scenarios**:

1. **Given** a valid name and unused email and the required combined Terms and Privacy acceptance, **When** the visitor submits the signup form, **Then** one pending account is created, a 15-minute onboarding link is associated with the accepted policy versions and server-recorded acceptance time, and the generic confirmation is shown.
2. **Given** a valid submission for an active account, **When** the visitor submits the form, **Then** the public result is identical to a valid new-address result, the only private effect is an email explaining that an account already exists and suggesting login, and no account data, policy acceptance, credential, or session is created or changed.
3. **Given** a valid submission for a retained pending account, **When** the visitor submits the form, **Then** the pending account is reused, a new onboarding link associated with the latest validated name and policy acceptance is sent, all earlier pending onboarding links and candidate acceptances are superseded, and the same generic confirmation is shown.
4. **Given** harmless case or surrounding-space differences in an email, **When** the form is submitted, **Then** one normalized address is used for uniqueness, request limits, and account lifecycle decisions.
5. **Given** valid signup and activation operations overlap for one pending account, **When** they attempt to commit, **Then** each atomically rechecks current state and commit order determines whether the signup supersedes the link or the activation makes the account immutable to signup.
6. **Given** the combined Terms and Privacy acceptance is missing or unchecked, **When** the visitor submits the form, **Then** the request is rejected before account lookup or mutation, an accessible localized acceptance error is shown, and no policy acceptance is recorded.

---

### User Story 2 - Verify and Enter the New Account (Priority: P1)

As a new user, I can open the onboarding link, prove control of my email address, and become signed in immediately without completing a separate login form.

**Why this priority**: A pending registration has no usable product value until the mailbox owner can activate it and enter the application securely.

**Independent Test**: Open the newest valid onboarding link for a pending account and verify that the account becomes active, the submitted name is retained, an authenticated session starts, and replaying the link cannot authenticate again.

**Acceptance Scenarios**:

1. **Given** the newest unexpired onboarding link for a pending account and no existing session, **When** the mailbox owner opens it, **Then** that same successful link use verifies email ownership, activates the account with the associated name, establishes exactly one authenticated session, and redirects the browser to the corresponding localized home page without a second login step.
2. **Given** an earlier link was superseded, or a link is malformed, expired, delivery-failed, already used, or associated with an active account, **When** it is opened, **Then** no account or session state changes and a localized generic invalid-link result is shown.
3. **Given** a valid onboarding link is opened concurrently in two sessions, **When** both uses are evaluated, **Then** at most one activates the account and establishes a session.
4. **Given** only a successful signup form submission and no consumed onboarding link, **When** the visitor continues browsing, **Then** the visitor remains unauthenticated and the pending account remains ineligible for ordinary login.
5. **Given** a valid onboarding link for a pending account is opened while a different user is authenticated, **When** the link is evaluated, **Then** the current session is preserved, the pending account is not activated, the link remains unconsumed, and localized guidance tells the user to sign out before reopening it.
6. **Given** email ownership is verified and account activation succeeds but an authenticated session cannot be established, **When** link processing completes, **Then** the account remains active, the link remains consumed, and a localized recovery state directs the user to login.

---

### User Story 3 - Recover From Rejected or Delayed Requests (Priority: P2)

As a visitor, I receive clear, localized, accessible feedback when my input is invalid, a request is limited, or signup is temporarily unavailable.

**Why this priority**: Public signup must reject unsafe input before account processing and let legitimate visitors recover without encouraging repeated submissions.

**Independent Test**: Exercise invalid name, invalid email, missing policy acceptance, unexpected-field, invalid-request, rate-limited, and mail-unavailable cases and verify the expected feedback, request-limit accounting, focus, and absence of account changes.

**Acceptance Scenarios**:

1. **Given** an invalid name or email or missing policy acceptance, **When** the form is submitted, **Then** no account lookup or mutation occurs, the relevant localized field error is announced, and focus moves to the first invalid field.
2. **Given** a missing, expired, or invalid CSRF value or unexpected submitted field, **When** the request reaches the trusted boundary, **Then** it is rejected before account lookup or mutation and a localized generic invalid-request result is shown.
3. **Given** the client or normalized address has reached its request allowance, **When** another valid request is submitted, **Then** no account processing or email occurs and the same localized wait state is shown regardless of account status.
4. **Given** shared service availability reports an account-independent outage, **When** a valid signup is submitted, **Then** no account lifecycle change occurs and the same localized temporary-unavailability result is returned for new, pending, and active-account addresses.
5. **Given** an isolated delivery attempt fails after a new pending account is created, **When** the request completes, **Then** the new token is invalidated, the pending account is retained for safe retry, and the public result remains the generic confirmation.
6. **Given** any other isolated post-validation processing failure, **When** the request completes, **Then** no unsafe partial account or credential state remains and the public result remains the generic confirmation.

---

### User Story 4 - Use Signup in Any Supported Locale and Viewport (Priority: P2)

As an English, Spanish, or Catalan visitor using a keyboard, assistive technology, mobile device, or desktop, I can understand and complete the full signup flow.

**Why this priority**: Registration is a critical public journey and must remain equivalent across the application's supported languages and access methods.

**Independent Test**: Complete form submission and link consumption at `/signup`, `/es/signup`, and `/ca/signup` using keyboard-only interaction, accessibility checks, and representative mobile and desktop viewports.

**Acceptance Scenarios**:

1. **Given** any supported signup route, **When** the page and its states are displayed, **Then** all visible content, policy labels and links, validation, status messages, and email content use the route's language.
2. **Given** a keyboard-only visitor, **When** the visitor enters data and submits, **Then** all controls are reached in a logical order, focus remains visible, and status changes are announced.
3. **Given** a 375×667 mobile viewport or 1440×900 desktop viewport, **When** every required state is displayed, **Then** content remains readable and operable without overlap, clipping, or horizontal page scrolling.
4. **Given** the application is using either supported appearance, **When** the signup flow is displayed, **Then** all content and interactive states remain legible and distinguishable.

---

### User Story 5 - Find the Correct Account Entry Flow (Priority: P3)

As a signed-out visitor, I can choose signup for a new account or login for an existing account without the two flows being combined.

**Why this priority**: Clear navigation makes registration discoverable while preserving the product boundary that login serves existing users only.

**Independent Test**: Use public navigation in all supported locales and verify that Signup opens the localized registration page, Login remains separate, and authenticated users cannot create another account from signup.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor on a public page, **When** account navigation is displayed, **Then** both localized Login and Signup actions are available and lead to distinct flows.
2. **Given** a visitor on signup, **When** the visitor chooses the existing-account prompt, **Then** the corresponding localized login page opens without carrying submitted personal data.
3. **Given** an authenticated user opens a localized signup route, **When** access is evaluated, **Then** the user is returned to the corresponding localized home page and no registration request is started.

### Edge Cases

- A name becomes empty after surrounding whitespace is removed, is exactly 80 characters, exceeds 80 characters, or contains unsupported characters.
- A valid name contains Unicode letters, internal spaces, straight or typographic apostrophes, or hyphens.
- An email differs from a stored address only by case or surrounding whitespace, or reaches the 254-character boundary.
- The combined Terms and Privacy checkbox is missing, unchecked, preselected, or accompanied by client-supplied policy versions or an acceptance time.
- Current policy versions change after submission but before the 15-minute onboarding link is consumed; activation persists the immutable snapshot accepted at submission.
- Two first-time signup requests for the same normalized address arrive concurrently; exactly one pending account remains and only the newest issued link can activate it.
- A retained pending account receives a later valid submission with a different name; only the name associated with the link that successfully activates the account becomes active profile data.
- A pending-account link is opened exactly at or after its 15-minute expiry boundary.
- A link is consumed while another signup request for the same address is being processed; each operation atomically rechecks state, commit order decides the winner, and no stale link can activate or alter an active account.
- A valid onboarding link is opened in a browser authenticated as a different user; no account switch or token consumption occurs until the user signs out and reopens the link.
- Account activation succeeds but session establishment fails; verified activation remains durable, the consumed link cannot be replayed, and localized login remains available.
- An active user receives a signup attempt; the submitted name never replaces the active profile name.
- A callback contains a foreign or malformed destination and must not redirect outside the configured application origin.
- A shared provider outage begins or ends during a request; the public outcome applied to that request remains independent of account status.
- An isolated onboarding-email failure occurs after a prior link was superseded; neither link remains valid and the retained pending account can be reused by a later request.
- An isolated account lookup, persistence, token-issuance, or notice-delivery failure occurs after valid input; it leaves no unsafe partial state and retains the generic accepted public result.
- Repeated invalid requests, requests from distributed clients, or combined login and signup traffic approach the shared request-limit boundaries.
- Long localized text, a long valid name, and a long email do not overlap controls or create horizontal page scrolling.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The signup page MUST be available at `/signup`, `/es/signup`, and `/ca/signup` in English, Spanish, and Catalan respectively.
- **FR-002**: The page MUST use the established public authentication visual language and support the application's complete light and dark appearances.
- **FR-003**: The form MUST request name, email, and one required combined Terms and Privacy acceptance. It MUST NOT offer a password, social sign-in, external identity provider, or additional profile fields.
- **FR-004**: Name validation MUST use the shared account-name contract: remove surrounding whitespace, require a non-empty value, allow at most 80 characters, and allow only Unicode letters, spaces, straight or typographic apostrophes, and hyphens.
- **FR-005**: Email validation MUST remove surrounding whitespace, normalize case, enforce a maximum of 254 characters, and require a valid email format before any account lookup or lifecycle change.
- **FR-006**: The trusted server-side process MUST independently validate the exact submitted field set, normalized values, and affirmative policy acceptance; any missing, unchecked, invalid, malicious, or additional field MUST reject the entire request before account lookup or mutation.
- **FR-007**: Signup MUST be the only flow in this feature that may explicitly create a pending account. Login requests and generic authentication callbacks MUST continue to create no account for an unknown email.
- **FR-008**: A valid first signup for an unused normalized email MUST create exactly one pending account with a candidate policy-acceptance snapshot that is not eligible for ordinary login until its onboarding link is successfully consumed.
- **FR-009**: Active and pending accounts MUST be unique by normalized email, including when stored legacy addresses differ in case.
- **FR-010**: A valid signup for an active account MUST NOT create or modify an account, verification credential, login credential, or session.
- **FR-011**: A valid signup for an active account MUST send only to the submitted mailbox a notice in the request locale equivalent to "An account already exists for this email address. Sign in instead." The notice MUST direct the recipient to the localized login page, contain no signup or login credential, and MUST NOT authenticate the recipient.
- **FR-012**: A valid signup for a retained pending account MUST reuse that account rather than create another and MUST associate the latest validated name and candidate policy-acceptance snapshot with the newly issued onboarding link.
- **FR-013**: New, pending, and active-account submissions MUST return the same public accepted status, response fields and structure, visible confirmation, and navigation behavior; only the private email delivered to the submitted mailbox may differ.
- **FR-014**: Every accepted submission MUST show the localized equivalent of the generic message "Check your email for the next step." and MUST NOT reveal which type of email was sent.
- **FR-015**: The interface and public response MUST NOT state or imply that an account exists, does not exist, is pending, or has been activated.
- **FR-016**: A new or retained pending account MUST receive a localized, single-use onboarding link that expires after 15 minutes.
- **FR-017**: Issuing a newer onboarding link for a pending account MUST immediately invalidate every earlier pending onboarding link for that account, leaving at most one valid link.
- **FR-018**: One successful use of a valid onboarding link MUST verify mailbox control, activate the pending account with its associated validated name, invalidate all remaining signup credentials for that account, establish exactly one authenticated session as part of that same link use, and redirect the browser to the corresponding localized home page.
- **FR-019**: Submitting the signup form alone MUST leave the visitor unauthenticated; no separate login action or second credential challenge may occur between successful onboarding-link consumption and the authenticated localized home page.
- **FR-020**: Malformed, expired, superseded, delivery-failed, active-account, and already-used links MUST produce one generic localized invalid-link state and MUST NOT change account or session state.
- **FR-021**: Link consumption MUST be atomic and single-use so concurrent attempts can activate the account and establish a session at most once.
- **FR-022**: Callback and post-onboarding destinations MUST be restricted to validated paths on the configured canonical application origin.
- **FR-023**: The signup flow MUST retain the established CSRF protection and MUST reject a missing, expired, or invalid CSRF value before account lookup or mutation.
- **FR-024**: Signup MUST use the established shared limits of five requests per trusted client and three valid normalized submissions per address in any 15-minute window; signup and login email requests MUST share these allowances so changing entry points cannot increase email volume.
- **FR-025**: Every request received by the server MUST consume a client attempt before CSRF or field validation; only a request whose CSRF value and complete field set are valid MUST consume an address attempt, regardless of whether the normalized email is new, pending, or active.
- **FR-026**: Client identity for request limits MUST follow the established trusted-proxy policy and MUST ignore arbitrary caller-supplied forwarding identity.
- **FR-027**: A limited result MUST communicate the remaining wait consistently, including a machine-readable retry duration, without account-state differences.
- **FR-028**: Every accepted valid submission MUST use the existing response floor of 500 ms plus bounded 0–100 ms jitter, measured from request start, regardless of account status or isolated delivery outcome; legitimate work that exceeds the floor need not be delayed further.
- **FR-029**: A public temporary-unavailability result MUST be shown only when a shared, account-independent service-health state reports an outage; it MUST use identical status and content for new, pending, and active-account addresses and occur before account mutation or email issuance.
- **FR-030**: An isolated onboarding delivery failure MUST invalidate the newly issued link, retain any pending account in an inactive reusable state, preserve the generic accepted public outcome, and MUST NOT restore a superseded link.
- **FR-031**: A failed existing-account notice MUST preserve the generic accepted public outcome and MUST NOT create a signup or login credential.
- **FR-032**: Pending accounts MUST NOT be automatically or opportunistically deleted by this flow; later valid signup submissions MUST be able to reuse them safely.
- **FR-033**: During submission, the primary action MUST prevent duplicate requests, expose its pending state, and announce that state to assistive technology.
- **FR-034**: The interface MUST support initial, pending, accepted, invalid-name, invalid-email, missing-policy-acceptance, invalid-request, rate-limited, shared-service-unavailable, and generic invalid-link states with stable layout.
- **FR-035**: The name and email fields and combined policy checkbox MUST have explicit accessible labels; errors and status changes MUST be announced; all actions and policy links MUST be keyboard operable; and focus MUST remain visible and move to the first invalid field after validation fails.
- **FR-036**: The page MUST remain readable and operable without overlap, clipping, or horizontal page scrolling at supported mobile and desktop viewports, including 375×667 and 1440×900.
- **FR-037**: All page content, states, validation feedback, navigation, onboarding emails, existing-account notices, and invalid-link results MUST have behaviorally equivalent English, Spanish, and Catalan versions.
- **FR-038**: The route locale MUST be preserved through form submission, private email destinations, onboarding-link consumption, session establishment, and final navigation.
- **FR-039**: Signed-out navigation MUST enable separate localized Login and Signup actions, and the signup page MUST offer a localized route to login without carrying submitted name or email data.
- **FR-040**: An authenticated user who visits a signup route MUST be returned to the localized home page without creating or changing an account.
- **FR-041**: Account creation, activation, and session establishment MUST pass through the established hardened account and session boundaries and MUST NOT weaken account-creation, canonical-origin, token, cookie, or session protections.
- **FR-042**: Names, emails, account identifiers, onboarding tokens, verification URLs, session data, mail credentials, and recipient-level delivery outcomes MUST NOT appear in application logs.
- **FR-043**: Concurrent and replayed signup requests MUST create at most one account per normalized email, must never reactivate or alter an active account, and must leave a deterministic newest-link state for a pending account.
- **FR-044**: Any isolated post-validation account lookup, persistence, token-issuance, or email-delivery failure MUST retain the generic accepted public result, invalidate any unusable credential, and leave no unsafe partial lifecycle state; the reusable pending account explicitly retained after an isolated onboarding-delivery failure is the only permitted partial state.
- **FR-045**: If a valid onboarding link is opened while a different user is authenticated, the system MUST preserve the current session, leave the pending account inactive, leave the link unconsumed, and show localized guidance to sign out and reopen the link; it MUST NOT switch accounts automatically.
- **FR-046**: If email verification and account activation succeed but session establishment fails, activation MUST remain durable, the onboarding link MUST remain consumed, and the user MUST see a localized recovery state linking to ordinary login; the system MUST NOT reactivate the account, restore the link, or send another credential automatically.
- **FR-047**: Every overlapping signup or activation operation for the same normalized email MUST atomically recheck account and link state when it commits. Commit order MUST govern the result: the last signup committed while the account remains pending owns the authoritative name, locale, and only valid link; activation succeeds only if its link is current when activation commits; once activation commits, a later signup follows the active-account path and cannot alter the account.
- **FR-048**: The signup page MUST display one unchecked combined acceptance control with accessible links to the current localized Terms and Privacy Notice; the control MUST NOT be preselected.
- **FR-049**: Policy version identifiers and acceptance time MUST be selected and recorded by the trusted server and MUST NOT be accepted from the client.
- **FR-050**: Each valid new or retained-pending signup MUST associate an immutable candidate snapshot containing the current Terms version, current Privacy Notice version, and server-recorded acceptance time with its onboarding link; a newer committed signup MUST supersede the earlier candidate snapshot together with its link.
- **FR-051**: Successful activation MUST persist the candidate snapshot associated with the consumed current link as the active account's immutable policy-acceptance record, even if a policy version changes during the link's 15-minute validity period.
- **FR-052**: Signup submissions for an active account MUST NOT create, replace, or otherwise modify that account's policy-acceptance records.

### Verification Requirements

- **VR-001**: Automated component verification MUST cover the localized form, exact fields, unchecked combined policy control, current policy links, validation, focus, pending and duplicate prevention, generic confirmation, all required states, login navigation, and accessibility semantics.
- **VR-002**: Automated integration verification MUST demonstrate the complete new-user lifecycle from valid submission and candidate policy snapshot through pending account, newest-link activation, persisted acceptance, immediate session establishment, localized redirect, and successful access to an authenticated page.
- **VR-003**: Automated integration verification MUST demonstrate that an active-account signup changes no account or policy-acceptance data, creates no signup or login credential or session, returns the same public outcome as a new email, and sends only the private existing-account login notice.
- **VR-004**: Automated integration verification MUST demonstrate that a retained pending account is reused, the newest validated name and candidate policy snapshot are applied only by successful activation, and earlier links and snapshots cannot authenticate or become authoritative.
- **VR-005**: Automated comparison MUST assert equal observable status, content, structure, navigation, and request-start-relative response floor for new, pending, and active-account submissions.
- **VR-006**: Automated verification MUST cover the combined login-and-signup client and address limits, exact boundary attempts, retry duration, trusted client identity, and consumption rules for invalid CSRF and invalid fields.
- **VR-007**: Automated integration verification MUST prove that invalid, malicious, additional-field, shared-outage, and isolated post-validation failure cases create no unintended active account or session, expose only the permitted public result, and leave only the documented reusable pending state.
- **VR-008**: Automated concurrency verification MUST prove that simultaneous first submissions create one pending account, the last successfully committed pending signup owns the authoritative name, locale, and link, signup-versus-activation races follow commit order after atomic state rechecks, and concurrent link consumption activates and signs in at most once.
- **VR-009**: Automated regression verification MUST prove that unknown-email login and generic authentication callbacks still create no user and that existing-user magic-link login still succeeds.
- **VR-010**: Automated route verification MUST cover `/signup`, `/es/signup`, and `/ca/signup`, locale-preserving email destinations and activation redirects, authenticated-user handling, and public navigation.
- **VR-011**: The critical signup and activation journey MUST pass automated accessibility checks and keyboard interaction verification in every supported locale.
- **VR-012**: Responsive verification MUST assert no horizontal page overflow or control clipping at 375×667 and 1440×900 across all required form states.
- **VR-013**: Because signup, account creation, and email delivery are critical public behavior, verification MUST exercise the real established mail and authentication boundaries in integration or end-to-end coverage rather than relying only on isolated unit checks.
- **VR-014**: Automated integration verification MUST prove that opening a valid onboarding link during a different user's session preserves that session and leaves both the pending account and link unchanged until sign-out and a later valid use.
- **VR-015**: Automated integration verification MUST simulate session-establishment failure after successful activation and prove that the account remains active, the link remains consumed, no replacement credential is sent, and localized ordinary login can recover access.
- **VR-016**: Automated verification MUST prove that missing or unchecked acceptance is rejected before account lookup, client-supplied policy metadata is ignored or rejected, current server-selected versions and time are persisted on activation, superseded snapshots cannot become authoritative, and active-account signup changes no acceptance record.

### Key Entities

- **Signup Request**: A public request containing a candidate name, email, locale, and anti-forgery proof. Its public accepted result is independent of account status.
- **Pending Account**: An explicitly registered but inactive account associated with a normalized email. It cannot use ordinary login, remains reusable after safe retries or isolated delivery failure, and becomes active only through its newest valid onboarding link.
- **Active Account**: A verified existing account eligible for login. Signup never modifies it; a signup attempt only triggers a private existing-account notice.
- **Onboarding Link**: A secret, localized, single-use, 15-minute credential associated with one pending account and one validated candidate name. A newer link, delivery failure, successful use, or account activation invalidates it.
- **Existing-Account Notice**: A private localized email informing the mailbox owner that an account already exists and directing them to login without containing a signup or login credential.
- **Policy Acceptance**: The immutable active-account record of one combined Terms and Privacy acceptance, containing server-selected version identifiers and a server-recorded acceptance time. Before activation, the same fields form a candidate snapshot bound to one onboarding link.
- **Request Limit Window**: Shared 15-minute client and normalized-address allowances across public signup and login email requests.
- **Locale Context**: The English, Spanish, or Catalan context retained from the public page through email, activation, session establishment, and final navigation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In automated new-user journeys where session establishment is available, 100% of newest valid onboarding links activate exactly one pending account, retain the validated name and associated policy-acceptance snapshot, and establish one authenticated session without a second login step; 0% authenticate after use, expiry, supersession, or delivery failure.
- **SC-002**: In automated comparison, 100% of matched new, pending, and active-account signup requests return identical observable accepted status, content, structure, and navigation behavior.
- **SC-003**: Across all verification, zero active-account signup attempts alter profile data, create another account, issue a signup or login credential, or establish a session.
- **SC-004**: Across all login regression checks, zero unknown-email login or generic callback attempts create an account, while 100% of valid existing-user login checks continue to succeed.
- **SC-005**: All three supported signup routes complete submission and activation in their own language and return the activated user to the matching localized home page.
- **SC-006**: The sixth combined public email request from one client and the fourth valid combined request for one normalized address within 15 minutes are limited in 100% of boundary checks and communicate a valid remaining wait.
- **SC-007**: Invalid input, missing policy acceptance, invalid anti-forgery proof, unexpected fields, shared outages, and isolated post-validation failures produce zero unintended active accounts or sessions; 100% of isolated failures retain the generic accepted public result.
- **SC-008**: The signup and activation journey has zero serious or critical automated accessibility violations and can be completed by keyboard in every supported locale.
- **SC-009**: At 375×667 and 1440×900, every required signup state has zero detected overlap, clipped controls, or horizontal page scrolling.
- **SC-010**: In a no-coaching usability test starting from the signed-out public home page, at least 20 first-time target users who have not seen or used this signup flow, including at least five participants assigned to each supported locale, at least eight participants using a mobile viewport, and at least eight participants using a desktop viewport, MUST attempt to create a new account. A participant succeeds only by choosing Signup rather than Login, submitting a valid name, email, and policy acceptance on the first attempt, and identifying email as the next step within 2 minutes, excluding email-delivery time. At least `ceil(0.95 × N)` participants MUST succeed, where `N` is the total eligible cohort; for the minimum cohort, at least 19 of 20 MUST succeed.
- **SC-011**: In automated lifecycle verification, 100% of activated accounts have exactly one authoritative acceptance record matching the consumed link's server-selected policy versions and time, while 0 active-account signup attempts modify an acceptance record.

## Assumptions

- "Signed in immediately" means that successful onboarding-link consumption establishes the session without a second login form; an unverified form submission does not authenticate the visitor.
- The existing email transport, canonical-origin validation, hardened account adapter, session handling, trusted-proxy policy, shared request limiting, and locale routing remain available and retain their current security contracts.
- The existing profile name validation contract is authoritative for signup, making name required for every newly activated account.
- A 15-minute, newest-link-only lifecycle remains appropriate because it matches the established email magic-link security model.
- The localized home page is the default post-activation destination; no arbitrary user-supplied destination is needed for signup.
- Pending accounts are retained as inactive records and reused by later valid submissions; this feature does not introduce automated pending-account deletion or a retention policy change.
- Mailbox-only disclosure that an account already exists is intentional because the recipient has demonstrated access to that mailbox; the public interface and logs remain non-enumerating.
- Existing active accounts already have an email suitable for authentication and remain unchanged by registration attempts.
- User-authorized development dummy Terms and Privacy Notice content, stable `2026-08-18-draft` version identifiers, and accessible localized destinations are available in English, Spanish, and Catalan; the copy remains explicitly unreviewed, and determining legal sufficiency remains outside engineering scope.

## Non-Goals *(mandatory)*

- Password authentication, password recovery, or password management.
- OAuth, social sign-in, or any external identity-provider flow.
- Implicit account creation from login, authentication callbacks, or adapter fallbacks.
- Changing the existing magic-link login behavior except for the shared navigation and regression coverage required to keep signup separate.
- Profile customization beyond the required signup name and email.
- Email changes, image upload, usernames, phone numbers, addresses, preferences, or account deletion.
- Automatically deleting, expiring, or reclaiming retained pending accounts.
- Changing the mail provider, adding a second provider, or broadening infrastructure beyond what end-to-end signup requires.
- Guaranteeing resistance to sophisticated statistical timing analysis or fully distributed request-limit evasion.
- Determining whether the user-authorized development dummy policies are legally sufficient, presenting them as reviewed legal advice, or adapting them to a particular jurisdiction.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: The signup page, submission, and onboarding-link entry are intentionally public. Form submission creates only an inactive pending account. Only atomic consumption of the newest valid link may activate that account and establish its first authenticated session.
- **Account lifecycle**: Registration is explicit and separate from login. New normalized addresses enter a pending state; pending addresses are reused; active addresses remain unchanged and receive a private login suggestion. Login and generic callbacks continue to reject implicit account creation.
- **Authentication provider verification**: Verification must cross the established real mail-delivery and authentication boundaries with deterministic integration or end-to-end coverage for onboarding delivery, existing-account notice delivery, failure handling, token consumption, and session establishment.
- **Data sensitivity**: Names, emails, and policy-acceptance records are personal information. Onboarding links, verification URLs, session material, anti-forgery values, and mail credentials are confidential and remain inside trusted boundaries except for the intended recipient link.
- **Input validation**: Exact fields, name, normalized email, affirmative policy acceptance, server-selected policy versions and time, locale, anti-forgery proof, request-limit identity, account state, link validity, and callback destination require authoritative server-side validation before the corresponding account action.
- **Log hygiene**: Logs must exclude names, emails, account identifiers, submitted values, tokens, verification URLs, session data, mail credentials, and recipient-level delivery outcomes in every success and failure path.
- **Public exposure**: Public access is necessary for new visitors. Uniform accepted outcomes, a response floor, shared limits, CSRF protection, and mailbox-only account guidance reduce enumeration and automated abuse.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: Attackers may probe account status through content, status, redirects, email type, or timing; register another person's address; flood onboarding or existing-account emails; switch between login and signup to evade limits; rotate clients or addresses; forge proxy identity or anti-forgery values; race duplicate account creation or activation; supersede a legitimate user's link; replay a consumed link; manipulate callback destinations; submit pathological fields; exhaust storage with pending accounts; or seek personal data in logs.
- **Controls**: Normalize and validate exact input server-side; require an unchecked-by-default combined policy acceptance while selecting versions and time server-side; keep public outcomes uniform; disclose active-account status only inside email to that address; require mailbox proof before activation or session creation; preserve any different authenticated session without consuming an onboarding link; retain login's no-creation boundary; share client and address limits across email entry flows; derive client identity through the trusted-proxy policy; apply the response floor; protect submission against cross-site requests; use one newest, short-lived, atomic, single-use link; restrict callbacks to the canonical origin; enforce uniqueness under concurrency; retain failed pending accounts without activating them; and exclude sensitive data from logs.
- **Residual risk**: A requester can create an inactive record for an address they do not control, distributed attackers may evade one client allowance, attackers can consume an address allowance or supersede pending links, mailbox recipients can observe their own account state, and sophisticated timing analysis may still infer differences. These risks are accepted for this scope because no unverified requester can activate or access the account, request volume is bounded, retries reuse pending records, and public content and obvious timing signals remain controlled.

## Operational Impact

- **Deployment changes**: No new external service, container, network, volume, secret, or provider is expected; the existing mail and authentication capabilities are reused.
- **Data & migrations**: The account lifecycle must reliably distinguish pending from active accounts, enforce normalized-email uniqueness, bind candidate policy snapshots to onboarding links, and preserve immutable active-account acceptance records. A forward-compatible migration is expected unless the current model already provides every guarantee; it must preserve existing active users and remain compatible during deployment. Backup format and restore tooling remain unchanged.
- **Recovery**: Failed signup requests never activate accounts, and retained pending accounts remain reusable. If activation succeeds but session establishment fails, activation remains durable and ordinary login is the recovery path. A release defect should be corrected with compatible application changes or a forward corrective migration; an incompatible data failure follows the verified restore procedure rather than destructive rollback.
- **Observability**: Existing health checks remain sufficient. Structured operational events may record only coarse outcomes such as `accepted`, `invalid_request`, `rate_limited`, `provider_unavailable`, `delivery_failed`, `activated`, and `invalid_link`, together with non-personal correlation data. Metrics should track aggregate conversion and failures without recipient, account, token, or session data.
