# Feature Specification: Login Access Code

**Feature Branch**: `20260831-login-access-code`

**Created**: 2026-08-31

**Status**: Draft

**Input**: GitHub issue [#39](https://github.com/JoelCantero/versmedit/issues/39) — "feat(auth): añadir código de acceso como alternativa al magic link"

## Overview

Signing in today sends a magic link only. When the request is accepted the email form stays on
screen with a generic status message, and the link is the single way to complete the sign-in. If the
link opens on a different device, is rewritten by a mail client, or simply does not open, the person
is stuck.

This feature keeps the magic link as the primary method and adds a manually typed access code
delivered in the same email, plus a dedicated "Check your email" confirmation screen that offers
entering the code as an alternative. Link and code are two representations of the same single-use
challenge: using either one invalidates both, and both expire together.

## Clarifications

### Session 2026-08-31

- Q: Which exact set of characters should the 10-character access code be built from? → A: Option B — the 32-character Crockford-style set (`0`–`9` and `A`–`Z` excluding `I`, `L`, `O`, `U`), with strict validation and no alias decoding.
- Q: What should happen when someone repeatedly submits wrong codes for the same address? → A: Option B — 10 validation attempts per client and 10 per address in a rolling 5 minutes, plus invalidation of the challenge after 5 failed attempts against it; recovery is requesting a new email.
- Q: Which formatting should be cleaned up automatically when a code is typed or pasted? → A: Option B — trim, upper-case, and remove internal whitespace and hyphens; every remaining character outside the code alphabet is rejected.
- Q: When someone moves between the email form, the confirmation screen and the code entry screen, should the browser address bar and history change? → A: Option A — one login URL holds all three states in page state, with no new history entries and no address in the URL; a reload returns to the email form.
- Q: How much of this flow should be proven by end-to-end tests versus integration tests? → A: Option B — end-to-end covers the three login screens plus one complete code sign-in using the E2E mail transport; integration covers single use, expiry, replacement, concurrency and throttling.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in with the access code from the email (Priority: P1)

A person with an active account requests access, opens the login email on another device (for
example a phone) and cannot use the link on the computer where they started. The email shows an
access code next to the sign-in button. They return to the browser where they requested access,
choose to enter the code manually, type or paste it, and land on the same destination the magic link
would have taken them to.

**Why this priority**: This is the core value of the feature — it removes the hard dependency on the
link opening in the right browser, which is the main reason sign-in fails today.

**Independent Test**: Request access for an active account, read the code from the delivered email,
submit it through the manual entry form, and confirm an authenticated session is created and the
person is redirected to the validated destination. Delivers value even if the confirmation screen
copy is unchanged.

**Acceptance Scenarios**:

1. **Given** an active account requested access, **When** the person submits the correct code before
   it expires, **Then** an authenticated session is created and they are redirected to the same
   validated, locale-aware destination the magic link would have used.
2. **Given** a correct code was already submitted once, **When** it is submitted again, **Then**
   access is refused with the generic recoverable error.
3. **Given** the magic link was already used, **When** the code from that same email is submitted,
   **Then** access is refused; the reverse also holds — after the code is used, the link no longer
   grants access.
4. **Given** a newer access email was requested for the same address, **When** the code or link from
   the previous email is used, **Then** access is refused.
5. **Given** a wrong, expired, already used, superseded or unknown code, **When** it is submitted,
   **Then** the same generic recoverable error is shown, without revealing which condition applied
   and without disclosing whether an account exists.
6. **Given** the same valid code is submitted twice concurrently, **When** both submissions are
   processed, **Then** at most one session is created.
7. **Given** the code is copied from the email with surrounding whitespace, an internal line break or
   a separating hyphen, or in lower case, **When** it is pasted into the form, **Then** it is
   accepted; a different sequence of characters is never treated as equivalent.

---

### User Story 2 - Dedicated "Check your email" confirmation (Priority: P2)

After a person asks for access, the email form is replaced by a confirmation screen that shows the
product brand, confirms a temporary link was sent, highlights the address that was entered, and
offers two actions: enter the code manually, or go back to login to correct the address.

**Why this priority**: Without this screen there is no discoverable entry point to the code, and the
current post-submit experience gives no clear next step. It is still shippable on its own as a UX
improvement.

**Independent Test**: Submit any syntactically valid address and verify the form is replaced by the
confirmation screen containing the brand, the heading, the entered address, and both actions — with
identical output whether or not an account exists.

**Acceptance Scenarios**:

1. **Given** an accepted access request, **When** the interface updates, **Then** the initial email
   form is replaced by the confirmation state showing the brand, the "Check your email" heading, the
   temporary-link explanation, the entered address, a primary "Enter code manually" action and a
   secondary "Back to login" action.
2. **Given** an address with no active account, **When** access is requested, **Then** the response
   and the confirmation screen are indistinguishable from the active-account case, while no email is
   sent and no usable credential exists.
3. **Given** the confirmation screen, **When** the person chooses "Enter code manually", **Then** the
   code entry form appears with the originally entered address, locale and destination preserved.
4. **Given** the confirmation or code entry screen, **When** the person chooses "Back to login",
   **Then** the email form returns so a different address can be used.
5. **Given** any of the three states, **When** the state changes, **Then** keyboard focus moves to
   the new state and the change is announced to assistive technology.

---

### User Story 3 - Localized access email with brand, expiry and code (Priority: P3)

The login email is delivered in the person's language with the product name and logo, a prominent
sign-in button, a clear statement of how long the link and code stay valid, and the code presented so
it is easy to read and copy.

**Why this priority**: Required for the code to be usable at all in every supported language, but the
underlying mechanism (P1) can be verified in a single language first.

**Independent Test**: Request access in each supported language and verify the HTML and plain-text
email bodies contain the localized subject, heading, action label, validity statement and the code.

**Acceptance Scenarios**:

1. **Given** an accepted request from an active account, **When** the email is delivered, **Then** a
   single email contains both the magic link button and the access code, and both share the same
   stated validity period.
2. **Given** each supported language, **When** the email is rendered, **Then** the subject, heading,
   button label, validity statement and code are correct in that language in both the HTML and the
   plain-text body.
3. **Given** the stated validity period in the email, **When** compared with the moment access is
   actually refused, **Then** the two match.

---

### Edge Cases

- The code expires while the person is typing it: submission fails with the generic recoverable error
  and the person can return to login and request a new email.
- A second access email is requested while the first code entry form is open: only the newest code
  works; the older one produces the generic error.
- The code is pasted with hyphens, spaces, line breaks or mixed case: that formatting is removed and
  the input is upper-cased before validation; any other character causes the generic error rather
  than being silently discarded.
- Fewer or more characters than the expected code length: rejected with the same generic error, with
  no hint about the expected structure beyond the field's own accessible description.
- Repeated failed attempts against one challenge: after 5 failures the challenge stops working and
  the person must request a new access email; the message is the same generic error throughout.
- Repeated failed attempts from one client or against one address: validation is throttled once 10
  attempts are reached in the rolling window, with a generic response and a consistent retry hint.
- The mail provider rejects the message after the challenge exists: neither the link nor the code
  remain usable.
- The person requests access for an address without an active account and guesses a code: no code can
  ever be valid, and the failure is indistinguishable from a wrong code for an existing account.
- The browser back button is used during login: because the three states share one URL, Back leaves
  the login page entirely instead of showing a broken or partially populated form.
- The page is reloaded, or login is reopened in a new tab: the email form is shown again, and
  requesting access issues a fresh challenge that invalidates the previous link and code.

## Requirements *(mandatory)*

### Functional Requirements

**Challenge issuance**

- **FR-001**: The system MUST keep the magic link as the primary sign-in method; the access code is
  an additional way to complete the same sign-in, not a replacement.
- **FR-002**: A single access request MUST produce a single email containing both the magic link and
  the access code.
- **FR-003**: The magic link and the access code MUST represent the same single-use challenge:
  consuming either one immediately invalidates both.
- **FR-004**: Requesting a new access email for an address MUST invalidate the previously issued link
  and code for that address.
- **FR-005**: The link and the code MUST share exactly the same expiry instant.
- **FR-006**: The login challenge validity MUST be 5 minutes for both the link and the code, and the
  validity communicated in the email MUST always match the enforced expiry.
- **FR-007**: The access code MUST be 10 characters drawn with cryptographic randomness from the
  32-character alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (digits plus upper-case letters excluding
  `I`, `L`, `O` and `U`), giving 50 bits of entropy. Characters outside this alphabet are never
  generated and MUST be rejected rather than mapped onto a permitted character.
- **FR-008**: The system MUST NOT send credentials or create a usable challenge for addresses without
  an active account, while keeping the response and the interface indistinguishable from the
  active-account case.

**Code validation**

- **FR-009**: Users MUST be able to submit an access code and, when it is valid, obtain the same
  authenticated session the magic link would have created.
- **FR-010**: After successful code validation the system MUST redirect to the same validated,
  locale-aware destination rules already applied to the magic link, including localized paths.
- **FR-011**: The system MUST accept pasted and lower-case input by trimming surrounding whitespace,
  upper-casing, and removing internal whitespace and hyphens before validation. Every remaining
  character outside the code alphabet MUST cause rejection, so two different character sequences are
  never treated as equivalent.
- **FR-012**: Incorrect, expired, already consumed, superseded, unknown and attempt-exhausted codes
  MUST all produce the same generic, recoverable error message.
- **FR-013**: The system MUST consume the challenge atomically so that concurrent submissions create
  at most one session.
- **FR-014**: The system MUST preserve the entered address, the active language and the requested
  destination when moving from the confirmation screen to code entry.

**Login interface**

- **FR-015**: When an access request is accepted, the system MUST replace the email form with a
  confirmation state showing the product logo and brand, a "Check your email" heading, a statement
  that a temporary login link was sent, the entered address highlighted, a primary "Enter code
  manually" action and a secondary "Back to login" action.
- **FR-016**: The confirmation state MUST render identically whether or not an active account exists
  for the address, and MUST NOT claim that the mail provider delivered the message.
- **FR-017**: Users MUST be able to return from the confirmation or code entry state to the email
  form to correct or change the address.
- **FR-018**: The system MUST preserve the existing invalid-email, invalid-request, rate-limited and
  provider-unavailable states of the access request.
- **FR-019**: The login experience MUST NOT block while waiting for the email; the person can go back
  and request a new one through the normal flow at any time.
- **FR-030**: All three login states MUST share a single login URL and be held as page state. The
  system MUST NOT add history entries for state changes and MUST NOT place the entered address in
  the URL. Reloading the page MUST return to the email form.

**Localization**

- **FR-020**: The confirmation and code entry screens MUST be fully localized in English, Spanish and
  Catalan, with natural and complete copy in each language.
- **FR-021**: The login email MUST be localized in English, Spanish and Catalan in both HTML and
  plain-text bodies, carrying the same essential information — brand, sign-in action, validity period
  and code — in each.
- **FR-022**: The email MUST use the configured product name and logo rather than any third-party
  brand.

**Accessibility**

- **FR-023**: The system MUST manage keyboard focus when moving between the email, confirmation and
  code entry states.
- **FR-024**: The code entry control MUST expose a single semantic field with an accessible label and
  description, even when it is displayed as separate segments, and MUST support pasting the complete
  code.
- **FR-025**: Progress, success and error states MUST be announced to assistive technology and the
  whole flow MUST be operable by keyboard alone.
- **FR-026**: The three login states MUST render without layout shift, overflow or overlap on mobile
  and desktop viewports.

**Abuse controls**

- **FR-027**: Code validation attempts MUST be rate limited using shared server-side state, allowing
  at most 10 attempts per client and 10 per address in a rolling 5-minute window, so that both
  single-client and distributed brute-force attempts are throttled.
- **FR-028**: Throttled validation MUST return a generic response with a consistent retry hint that
  does not reveal whether an account, a challenge or a specific code state exists.
- **FR-029**: A challenge MUST be invalidated after 5 failed validation attempts against it. Further
  submissions then produce the same generic error as any other invalid code, and the person recovers
  by returning to login and requesting a new access email.

### Key Entities

- **Login challenge**: The single-use, time-limited grant issued for one email address. Expressed to
  the person as a magic link and an access code, it carries the target address, the issue and expiry
  instants, and the requested destination and language. At most one challenge is valid per address.
- **Account**: An existing active user identified by email address. Only accounts may receive a
  challenge; nothing about their existence may leak through responses, timing or copy.
- **Validation attempt counters**: Server-side counters that throttle access requests and code
  validation attempts per client and per address or challenge.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person who cannot use the magic link can complete sign-in with the code from the same
  email in under 60 seconds from opening the email, without requesting a second email.
- **SC-002**: 100% of accepted access requests for active accounts result in exactly one email that
  contains both a working link and a working code with the same expiry.
- **SC-003**: Access requests for addresses with and without an active account are indistinguishable
  in response content, on-screen output and observed response time.
- **SC-004**: A challenge can be redeemed at most once: across concurrent and repeated redemption
  attempts of the same challenge, exactly one session is ever created.
- **SC-005**: 100% of invalid, expired, consumed and superseded code submissions produce the same
  user-visible message.
- **SC-006**: The validity period stated in the email matches the enforced expiry in all three
  languages, verified for every language variant.
- **SC-007**: No challenge can ever be probed with more than 5 code guesses, and no client or address
  can exceed 10 validation attempts per 5 minutes, keeping the chance of guessing a code negligible.
- **SC-008**: The confirmation and code entry screens pass automated accessibility checks with no
  serious or critical violations and are fully operable by keyboard in all three languages.
- **SC-009**: Sign-in failures caused by a link that cannot be opened on the requesting device are
  eliminated as a dead end: every such case has a working alternative path to a session.

## Assumptions

- The reference wording for the confirmation screen is "Check your email", "We've sent you a
  temporary login link. Please check your inbox at {email}.", "Enter code manually" and "Back to
  login", with natural Spanish and Catalan equivalents; the visual composition follows the product's
  existing design system and brand.
- Reducing the login challenge validity from 15 to 5 minutes is acceptable for all existing sign-in
  paths, since the code alternative removes the main reason a person needed a longer window.
- The code is delivered only inside the email body; it is never placed in a URL, and the magic link
  keeps working exactly as it does today.
- Code validation attempts reuse the existing shared rate-limit mechanism and identity resolution
  used by access requests, applying the limits and per-challenge attempt budget fixed in the
  Clarifications section.
- Moving between the email, confirmation and code entry states happens within the existing login
  route as page state, without creating a separate resend screen or new browser history entries.
- Only the login flow gains a code; sign-up and account deletion confirmations are untouched.
- The existing anti-enumeration contract for access requests — the accepted response shape and the
  normalized response timing — remains the baseline that code validation must not undermine.

## Non-Goals *(mandatory)*

- Replacing the magic link with passwords, passkeys, SMS or TOTP.
- Adding manual codes to sign-up or account deletion flows.
- Creating a standalone resend screen; the existing login flow is reused to request a new email.
- Reproducing any third-party product's visual identity; only the described structure is a reference.
- Multi-device or cross-session challenge transfer beyond what a single-use challenge already allows.
- Changing session lifetime, session management or the account model.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: Both the access request and the code validation endpoints are
  public and unauthenticated by nature. All identity decisions are made on the server from the stored
  challenge; the client never supplies the address to trust, the account state, or the outcome.
- **Account lifecycle**: Unchanged. Authentication MUST NOT implicitly create an account. Only
  existing active accounts receive a challenge; unknown addresses get an identical response and
  screen but no email and no usable credential. Registration remains a separate flow.
- **Authentication provider verification**: The real mail provider boundary is unchanged. Coverage is
  split: end-to-end tests exercise the three login screens and one complete code sign-in, reading the
  code from the mail transport already used in end-to-end runs; integration tests exercise the actual
  send path for the combined link-and-code email together with single use, expiry, replacement,
  concurrency and throttling, and assert that a delivery failure leaves no usable challenge. Tests
  MUST NOT substitute an unverified transport for the provider boundary.
- **Data sensitivity**: The email address is PII and the access code is a credential equivalent to
  the magic link token. The code MUST NOT be stored in a second recoverable plaintext copy; any
  additional stored value must be non-reversible or securely derived from the existing challenge, so
  that database access alone does not yield a usable code.
- **Input validation**: The submitted address, code, language and destination are all validated on the
  server. The destination continues to be restricted to the existing allow-listed localized paths,
  with a safe fallback. Code format is validated before any lookup.
- **Log hygiene**: The access code MUST NOT appear in URLs, query strings, analytics, traces or logs.
  Log entries about validation record only outcome classes and correlation identifiers, with the
  address redacted according to existing logging rules.
- **Public exposure**: The login request and code validation endpoints are intentionally public
  because they are the entry point to authentication. They are protected by the existing CSRF and
  same-origin checks, shared rate limiting, and a uniform response contract.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**:
  - Brute-forcing the code for a known address, either from one client or distributed across many.
  - Enumerating which addresses have an account by comparing responses, screens, timing or the
    behavior of code submission.
  - Replaying a link or code after it has been used, or racing two redemptions of the same challenge
    to obtain two sessions.
  - Forcing challenge reissue in a loop to spam a person's inbox or exhaust mail provider quota.
  - Tricking a person into submitting their code on an attacker-controlled origin, or capturing it
    from a URL, referrer or log if it ever leaked out of the request body.
  - Exhausting rate-limit storage or causing a denial of service by flooding validation attempts for
    many addresses.
  - Burning a person's pending challenge on purpose by submitting wrong codes for their address.
- **Controls**: Single-use challenge with atomic consumption; newest-challenge-only issuance; short
  5-minute expiry; 10-character code drawn from a 32-symbol unambiguous alphabet (50 bits); a budget
  of 5 failed attempts per challenge; shared server-side rate limiting of 10 validation attempts per
  client and per address in a rolling 5 minutes; uniform generic errors and the unchanged
  accepted-response contract with normalized timing; shared rate limiting of issuance; code
  transmitted only in the body of a CSRF-protected, same-origin request; no plaintext second copy of
  the code; destination allow-list; delivery-failure compensation that invalidates the challenge.
- **Residual risk**: A person who can read the recipient's mailbox can still sign in — this is
  inherent to email-based authentication and unchanged by this feature. Up to 5 guesses per challenge
  remain possible; against 50 bits of entropy the success probability is negligible. Someone who
  knows an address can deliberately burn its pending challenge with 5 wrong codes; this is accepted
  because it grants no access, is bounded by the 5-minute window, and recovery is one request for a
  new email. Aggressive throttling can slow a legitimate person under attack, which is accepted for
  the same reason.

## Operational Impact *(include if the feature changes deployment, data, or infrastructure)*

- **Deployment changes**: No new containers, networks or volumes. No new secrets are expected; the
  existing brand, mail provider and authentication configuration is reused.
- **Data & migrations**: The stored login challenge gains the data needed to verify a code, added
  through a new forward-only migration. Existing challenges issued before the change are short-lived
  and may simply expire; the compatibility window is bounded by the challenge lifetime. Backup and
  restore procedures are unaffected in shape, and the change must not require rewriting applied
  migrations.
- **Recovery**: If the change must be rolled back, a corrective forward migration removes the added
  challenge data; the magic link path keeps working throughout because it is unchanged. Reducing the
  validity to 5 minutes is a configuration-level behavior change that can be reverted the same way.
- **Observability**: Emit structured events for code validation outcomes (accepted, rejected,
  throttled) and for challenge issuance, with the address redacted and the code never logged. No new
  healthcheck is required.
