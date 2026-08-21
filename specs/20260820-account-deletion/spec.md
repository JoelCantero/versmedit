# Feature Specification: Permanent Account Deletion

**Feature Branch**: `20260820-account-deletion`

**Created**: 2026-08-20

**Status**: Draft

**Input**: GitHub issue 37, with the user direction to delete the user permanently and directly, without soft deletion, a retention copy, or a recovery period.

## Clarifications

### Session 2026-08-21

- Q: If the fresh magic link is opened in a different browser or device, may that browser continue to final deletion confirmation? → A: Yes. Any browser that consumes the valid link may continue in the same locale, but deletion still requires a separate explicit final confirmation.
- Q: What response-time target must deletion meet from final confirmation until success or error is shown? → A: At least 95% of attempts must present a definitive outcome in under 2 seconds.
- Q: If deletion completes but the browser loses the response, what should it show after reconnecting? → A: Show the localized public confirmation when that browser has a pending deletion signal and its former session no longer authorizes.
- Q: If the fresh authentication link cannot be sent, should the confirmation dialog remain open for retry? → A: Yes. Keep the dialog open, announce a generic error, and allow retry without changing account data or session state.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Permanently Delete My Account (Priority: P1)

As an authenticated person, I can open Data & Privacy, review every consequence of account deletion, verify my identity when needed, and explicitly confirm permanent deletion so that my access and all application data attributable to me are removed.

**Why this priority**: Permanent self-service deletion is the feature's core user value and privacy outcome.

**Independent Test**: Sign in as an existing user with authentication identities, multiple sessions, policy acceptances, pending access links, and address-specific request-limiting state; complete the localized deletion flow and verify that the account, every listed related record, and every session are gone, the local session is cleared, and a public localized confirmation is shown.

**Acceptance Scenarios**:

1. **Given** an authenticated person on Data & Privacy, **When** they select Delete account for the first time, **Then** no data changes and an accessible confirmation dialog explains that deletion is irreversible, lists every consequence, and offers unambiguous cancel and continue actions.
2. **Given** the person's most recent authentication occurred within the previous 10 minutes, **When** they explicitly confirm permanent deletion, **Then** the system removes the account and all attributable active data as one indivisible operation.
3. **Given** the person's most recent authentication occurred more than 10 minutes ago or cannot be established, **When** they try to continue, **Then** no data changes and they must authenticate through a new email magic link before final confirmation becomes available.
4. **Given** the person completes fresh authentication for deletion in the original or a different browser, **When** they return from the magic link, **Then** that browser restores the same localized deletion intent but deletion still requires a separate explicit final confirmation.
5. **Given** deletion completes, **When** any former session or pending access link is used, **Then** it cannot authorize access to the deleted account.
6. **Given** deletion completes in any supported locale, **When** the browser receives the result, **Then** the local session is cleared and the person reaches the public confirmation page for that locale without personal information in the URL or page.
7. **Given** the initiating browser loses the completion response, **When** it reconnects with its unexpired pending deletion signal and finds that its former session no longer authorizes, **Then** it clears that signal and shows the same localized public confirmation without submitting another deletion request.

---

### User Story 2 - Leave Without Deleting or Recover From Failure (Priority: P2)

As an authenticated person, I can cancel at every pre-deletion step and can safely retry after a failure without losing any part of my account.

**Why this priority**: An irreversible action must remain avoidable until final confirmation and must never leave partially deleted data.

**Independent Test**: Open and dismiss the dialog through each supported cancellation method, then simulate a failure while deleting each category of related data and verify that all account data and sessions remain usable before a successful retry.

**Acceptance Scenarios**:

1. **Given** the confirmation dialog is open and deletion is not in progress, **When** the person cancels, presses Escape, or closes the dialog, **Then** the dialog closes, focus returns to Delete account, and no data changes.
2. **Given** any part of permanent deletion fails, **When** the operation ends, **Then** every targeted account record remains intact, the current account remains usable, and the dialog presents a generic localized error that can be retried.
3. **Given** deletion is in progress, **When** the person activates controls repeatedly or attempts to dismiss the dialog, **Then** only one deletion attempt proceeds, progress is announced, and the result cannot be mistaken for a cancellation.
4. **Given** a failed attempt, **When** the person retries with a still-valid recent authentication, **Then** they can complete deletion without reloading the page.
5. **Given** fresh authentication is required, **When** the link cannot be sent, **Then** the dialog remains open, account data and session state remain unchanged, a generic localized error is announced, and the person can retry.

---

### User Story 3 - Prevent Unauthorized or Ambiguous Deletion (Priority: P3)

As an account holder, I am protected from another person, another origin, or a replayed request deleting my account or learning whether an account exists.

**Why this priority**: The action is irreversible and privileged, so identity and request integrity must be established at the moment of deletion.

**Independent Test**: Attempt deletion while signed out, with an expired session, from another origin, with a forged account identifier, and through concurrent or replayed requests; verify that only the account derived from a valid recent server session can be deleted and that failures disclose no account details.

**Acceptance Scenarios**:

1. **Given** a signed-out visitor requests any localized Data & Privacy page, **When** access is evaluated, **Then** the visitor follows the existing localized sign-in flow with a validated local return destination and sees no account data.
2. **Given** a request supplies another person's identifier or email, **When** deletion is evaluated, **Then** the supplied identity is ignored or rejected and no account other than the one established by the authenticated session can be affected.
3. **Given** a deletion request originates outside the trusted application context, **When** it is evaluated, **Then** it is rejected without changing data or revealing account existence.
4. **Given** two already-authorized confirmations race for the same account, **When** one deletion commits, **Then** both interactions converge on the completed signed-out state, at most one deletion occurs, and no attributable record is recreated or left behind.
5. **Given** a request is replayed after session revocation, **When** authorization is evaluated, **Then** it is treated as unauthenticated and cannot disclose whether the former account existed.

---

### User Story 4 - Use the Flow in Every Supported Locale and Viewport (Priority: P4)

As an English, Spanish, or Catalan user, I can understand and operate the complete deletion flow with a keyboard or assistive technology on mobile and desktop.

**Why this priority**: People must be able to make an informed privacy decision regardless of locale, input method, or supported viewport.

**Independent Test**: Exercise discovery, cancellation, recent authentication, progress, failure, final confirmation, and the public result in all three locales at representative mobile and desktop viewports using keyboard navigation and automated accessibility checks.

**Acceptance Scenarios**:

1. **Given** an authenticated person in any supported locale, **When** they use Data & Privacy, **Then** navigation, headings, warnings, consequences, controls, progress, errors, and the final public confirmation are complete and behaviorally equivalent in that locale.
2. **Given** the confirmation dialog opens, **When** focus is assigned, **Then** focus starts on the non-destructive Cancel action, remains trapped within the dialog, and returns to Delete account after cancellation.
3. **Given** a keyboard or assistive-technology user, **When** they complete or abandon the flow, **Then** every control is operable in a logical order and dialog title, description, progress, errors, and completion are announced appropriately.
4. **Given** a supported mobile or desktop viewport with the longest translated content, **When** the page and dialog are displayed, **Then** content remains readable with no overlap, clipping, or horizontal page scrolling.

### Edge Cases

- Selecting Delete account only opens the dialog; the first selection never deletes data.
- Closing the dialog by Cancel, Escape, or its close control has identical no-change behavior while no deletion is pending.
- A recent-authentication window that expires while the dialog is open prevents final deletion and requires fresh authentication.
- Opening an expired, already-used, or superseded authentication link never deletes data and returns a generic localized authentication result.
- A fresh-authentication link restores the intended localized Data & Privacy destination in whichever browser consumes it, including a different device, but never acts as deletion confirmation.
- Failure to send a fresh-authentication link leaves the dialog open and restores its controls for retry without changing account data, session state, or the localized deletion intent.
- Losing the current session before final confirmation prevents deletion and follows the localized sign-in flow.
- Failure while removing any one category of related data preserves every category, including all sessions, rather than committing a partial result.
- Related records created concurrently before deletion commits are either included in the same completed deletion or cause the operation to fail without partial deletion.
- Two confirmations authorized before the first commit result in one permanent deletion and a consistent signed-out completion experience.
- A replayed deletion request after deletion is complete cannot use the revoked session or reveal previous account state; only the initiating browser's unexpired, non-identifying pending signal can recover the generic public completion state.
- If the browser loses the deletion response but its session still authorizes after reconnecting, it does not show success; it clears the pending signal and presents a generic retryable error with the account unchanged.
- Pending access or registration links issued before deletion cannot recreate or sign in to the deleted account.
- Reusing the same email through the normal registration journey may create a new, independent account; it never restores the deleted account or its data.
- Only request-limiting state attributable to the account email is removed; global or shared client state remains intact.
- Long email addresses and translated warnings fit in the dialog and page without obscuring controls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide Data & Privacy at `/account/data`, `/es/account/data`, and `/ca/account/data` in English, Spanish, and Catalan respectively.
- **FR-002**: Authenticated account navigation MUST include Profile and Data & Privacy, preserve the active locale, and expose the current item visually and semantically.
- **FR-003**: The system MUST restrict Data & Privacy content and account deletion to authenticated people.
- **FR-004**: A signed-out request for a localized Data & Privacy page MUST enter the existing sign-in flow in the same locale with only a validated application-local return destination.
- **FR-005**: Data & Privacy MUST contain a visually distinct permanent-deletion section with an explicitly destructive Delete account action.
- **FR-006**: The first activation of Delete account MUST only open a confirmation dialog and MUST NOT change any account data or session state.
- **FR-007**: Before final confirmation, the dialog MUST state that deletion is irreversible and that it will sign the person out everywhere, invalidate pending access or registration links, remove the profile, authentication identities, and policy acceptances, and make the deleted account inaccessible.
- **FR-008**: The dialog MUST provide unambiguous Cancel and Permanently delete account actions whose visual and accessible names distinguish their outcomes.
- **FR-009**: Final deletion MUST require evidence that the account holder authenticated within the previous 10 minutes.
- **FR-010**: When recent authentication is absent or expired, the system MUST preserve the localized deletion intent, change no account data, and require a new single-use email magic-link authentication before final confirmation can proceed in whichever browser consumes the valid link.
- **FR-011**: Completing recent authentication in the original or a different browser MUST NOT itself delete the account; that browser MUST return to the localized deletion context, present the consequences, and require the person to confirm explicitly again.
- **FR-012**: At final confirmation, the system MUST derive the target account exclusively from the current authenticated server session and MUST NOT accept a client-provided account identifier, email, ownership value, or authorization decision.
- **FR-013**: One successful final confirmation MUST permanently remove the primary user record, linked authentication identities, every session, every policy acceptance, pending verification or access tokens matching the normalized account email, and authentication request-limiting state attributable only to that email.
- **FR-014**: Permanent deletion MUST NOT remove global request-limiting state or state shared by a client independently of the deleted email address.
- **FR-015**: All targeted data removal MUST be indivisible: either every attributable record is removed or every targeted record remains unchanged.
- **FR-016**: Successful deletion MUST leave no orphaned attributable records, user tombstone, soft-deletion marker, feature-created retention copy, or recovery period.
- **FR-017**: Once deletion commits, every session for the account, including the requesting session and sessions on other devices, MUST immediately stop authorizing requests.
- **FR-018**: Once deletion commits, every pending access or registration link issued for the deleted account email before deletion MUST be invalid and MUST NOT recreate the deleted account implicitly.
- **FR-019**: The response to successful deletion MUST clear the browser's local session state and direct the person to `/account-deleted`, `/es/account-deleted`, or `/ca/account-deleted` according to the active locale.
- **FR-020**: The public completion page MUST briefly confirm that the account was permanently deleted, provide a route to the localized public home page, and MUST NOT include personal data or distinguish prior account attributes.
- **FR-021**: A failure in any deletion step MUST preserve the complete account and all targeted related data, keep the experience recoverable, and present a generic localized error without internal details.
- **FR-022**: While deletion is pending, the system MUST prevent duplicate submissions, keep the dialog in an unmistakable progress state, announce progress, and prevent dismissal from being represented as a successful cancellation.
- **FR-023**: Concurrent confirmations that were both authorized before one deletion commits MUST result in at most one data deletion, leave no attributable records, and converge on the same signed-out public completion state without exposing which request won.
- **FR-024**: A new or replayed deletion request evaluated after the session has expired or been revoked MUST make no data change and MUST follow the same generic unauthenticated behavior as any other invalid session; browser recovery under FR-035 and FR-036 MUST NOT authorize or resubmit deletion.
- **FR-025**: The deletion mutation MUST reject requests that fail the application's existing same-origin and cross-site request protections.
- **FR-026**: Cancellation through the Cancel action, Escape key, or dialog close control before deletion begins MUST preserve all data and restore focus to Delete account.
- **FR-027**: Initial focus in the dialog MUST be placed on Cancel, keyboard focus MUST remain within the open dialog, and all dialog controls MUST have a logical focus order.
- **FR-028**: After a deletion failure, the dialog MUST remain open, restore its controls, announce the generic error, move focus to that error, and permit a safe retry.
- **FR-029**: All user-facing strings and states in the page, dialog, recent-authentication journey, errors, and completion page MUST have complete, behaviorally equivalent English, Spanish, and Catalan translations.
- **FR-030**: The selected locale MUST be preserved through account navigation, sign-in redirects, fresh authentication, cancellation, errors, and successful completion.
- **FR-031**: The complete flow MUST be operable with a keyboard and assistive technology and MUST remain free of overlap, clipping, and horizontal page scrolling at supported mobile and desktop viewports.
- **FR-032**: Logs and user-visible errors produced by this flow MUST NOT contain names, emails, account identifiers, authentication links, tokens, cookies, session values, or other personal data.
- **FR-033**: Operational reporting MAY record only sanitized outcome categories and aggregate counts that cannot identify the deleted person or reconstruct the account.
- **FR-034**: Automated verification MUST cover discovery, first-click safety, consequences, cancellation methods, recent-authentication enforcement, magic-link return without automatic deletion, authorization, same-origin protection, atomic rollback, every targeted data category, concurrent confirmation, replay, lost-response recovery, all-session revocation, pending-link invalidation, localization, accessibility, responsive layout, and the public completion state.
- **FR-035**: Immediately before submitting final confirmation, the browser MUST create a non-identifying pending deletion signal scoped to that browser, containing no account data or authorization capability and expiring no later than 10 minutes after creation.
- **FR-036**: If the completion response is lost, the browser MUST show the localized public confirmation without resubmitting deletion only when its pending signal remains valid and its former session no longer authorizes; it MUST then clear the signal.
- **FR-037**: If the browser receives a definitive success or failure, its pending signal expires, or the former session still authorizes after a lost response, the browser MUST clear the signal; an authorized session MUST remain on the account flow and receive a generic retryable error rather than a false success.
- **FR-038**: If a fresh authentication link cannot be sent, the system MUST leave all account data and session state unchanged, keep the confirmation dialog open, restore its controls, announce a generic localized error, move focus to that error, preserve the localized deletion intent, and allow another send attempt.
- **FR-039**: Both account-deletion POST operations MUST apply operation-specific, client-scoped limits through the existing shared database rate limiter before expensive work; fresh-authentication issuance MUST additionally apply the exact normalized-email-derived address limit, while final deletion MUST retain its client bucket and remove only the email-address bucket required by FR-013 and FR-014.

### Key Entities *(include if feature involves data)*

- **Account Holder**: The existing person established exclusively by the current authenticated session. The primary record contains the profile and normalized email used to find otherwise unlinked attributable data.
- **Authentication Identity**: An external or provider-specific identity linked to the account holder and removed with the account.
- **Session**: An authorization grant for one browser or device. Every session belonging to the account holder is revoked by permanent deletion.
- **Policy Acceptance**: The account holder's recorded acceptance of application policies. All such records are deleted with the account.
- **Pending Verification Token**: A single-use access or registration credential associated through the normalized account email rather than a direct account relationship. Tokens issued before deletion are removed.
- **Address-Specific Request-Limiting State**: Authentication abuse-prevention state attributable to the normalized account email. Only the email-specific state is deleted; global or independently shared client state is retained.
- **Deletion Intent**: Short-lived context that preserves locale and the requested return to Data & Privacy during fresh authentication. A valid return may restore it in a different browser, but it contains no client-controlled target identity and cannot authorize deletion by itself.
- **Pending Deletion Signal**: A temporary, non-identifying marker held only by the browser that submitted final confirmation. It supports lost-response recovery, expires within 10 minutes, carries no account identity, and cannot authorize or target deletion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In automated first-click and cancellation journeys, 100% of interactions before final confirmation produce zero account or session changes.
- **SC-002**: In successful-deletion verification, 100% of primary user, authentication identity, session, policy acceptance, pending-link, and email-specific request-limiting records are absent after completion, with zero attributable orphan or retention records.
- **SC-003**: In injected-failure verification for every deletion stage, 100% of attempts preserve all targeted records and all pre-existing sessions, with zero partially deleted accounts.
- **SC-004**: In authorization and request-integrity verification, 100% of signed-out, stale-session, forged-identity, cross-origin, and replayed attempts fail to delete an account or reveal whether one exists.
- **SC-005**: Within one authorization check after a successful deletion, 100% of sessions previously belonging to the account fail to authorize access on every tested device.
- **SC-006**: For English, Spanish, and Catalan, 100% of page, dialog, authentication, progress, error, and completion states are translated and preserve the selected locale through the complete journey.
- **SC-007**: Automated accessibility checks report zero serious or critical violations, and keyboard-only verification completes cancellation, fresh authentication, error recovery, and deletion without a focus trap or pointer input.
- **SC-008**: Across all supported mobile and desktop verification viewports, the page and dialog have zero detected content overlaps, clipped actions, or horizontal page scrolling with the longest localized content.
- **SC-009**: In a moderated first-attempt usability study with at least 20 target participants, at least 5 using each supported locale and with both mobile and desktop represented, at least 90% correctly identify before confirming that deletion is irreversible and signs them out everywhere, and at least 90% complete or safely abandon the flow within 3 minutes, excluding email-delivery time; only aggregate results and non-identifying defect notes are retained.
- **SC-010**: On the target ARM64 Raspberry Pi using the repository's standalone production-artifact E2E harness and isolated PostgreSQL topology, after 10 untimed warm-ups per outcome, the nearest-rank p95 of 100 successful final confirmations and 100 injected-rollback confirmations MUST each present the localized public success state or generic retryable error in under 2 seconds; fixture setup and email delivery are outside the measured interval.
- **SC-011**: In 100% of successful deletion tests, the resulting public confirmation page and address expose no personal data.
- **SC-012**: In 100% of lost-response tests, a browser with a valid pending signal shows the localized public confirmation only when its former session no longer authorizes; an authorized session receives a retryable error, no second deletion request is sent, and the signal is cleared after either result.
- **SC-013**: In 100% of injected fresh-authentication delivery failures, account data and session state remain unchanged, the dialog remains usable in the selected locale, the generic error is announced, and a later retry can succeed.
- **SC-014**: In automated abuse-control verification, every reauthentication or final-deletion request beyond its configured client limit receives the same generic rate-limited outcome and `Retry-After` metadata without entering email delivery or the deletion transaction, while the reauthentication address limit remains shared across clients.

## Assumptions

- The application currently stores only identity and authentication data for an account; it has no invoices, payments, or other business records requiring separate lifecycle rules.
- Existing account sessions, localized authentication, email magic links, and safe application-local return destinations remain available dependencies.
- The authoritative account email has an existing normalized form suitable for identifying pending tokens and email-specific request-limiting state.
- Ten minutes is a proportionate recent-authentication window for this irreversible action. A newer valid sign-in satisfies the requirement; an older or indeterminate sign-in requires a fresh magic link.
- The normal registration journey may allow the same email to create a new independent account after deletion. Such registration does not recover the deleted identity, sessions, profile, policy acceptances, or other data.
- Supported locales and viewport sizes are the same English, Spanish, Catalan, mobile, and desktop variants already covered by the application.
- Existing authentication and same-origin protections are authoritative dependencies and remain active throughout the flow.

## Non-Goals *(mandatory)*

- Data export or download.
- Soft deletion, anonymization, a grace period, account recovery, or a user tombstone.
- A feature-created retention or archival copy of the deleted account.
- Administrative deletion of another person's account.
- Deletion or retention rules for invoices, payments, or business domains the product does not currently store.
- Preventing the email address from being used in a future, independent registration.
- Changing registration behavior or making authentication implicitly create an account.
- Letting the person select individual sessions or data categories to preserve.
- Prescribing whether related records are removed through relationship rules or explicit deletion steps; planning owns that implementation decision while preserving the specified outcome.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: Data & Privacy and deletion are private to authenticated people. The target identity is resolved from the server session at final confirmation, recent authentication within 10 minutes is required, and no client-provided identity or ownership claim is trusted.
- **Account lifecycle**: This feature permanently ends an existing account but does not change registration. A later registration with the same email creates a distinct account and never restores deleted data.
- **Authentication provider verification**: Fresh verification uses the existing real email magic-link boundary. A valid link may continue the flow in any browser or device. Verification must exercise delivery failure and retry, same-browser and cross-device return, expiry, single use, locale preservation, and the requirement for a separate final deletion confirmation.
- **Data sensitivity**: Profile details, email, linked identities, policy acceptances, authentication tokens, session state, and request-limiting state are personal or security-sensitive. They are visible only within the authorized flow and are permanently removed according to the specified scope.
- **Input validation**: The server validates the current session, recent-authentication evidence, locale and local return destination, request origin, and the exact confirmation action. It rejects target identities or authorization decisions supplied by the client. The browser's pending signal is never accepted as proof of identity, authorization, or deletion outcome.
- **Log hygiene**: Names, emails, account identifiers, token contents, cookies, sessions, link values, and deletion payloads are excluded from logs. Only non-identifying outcome categories and aggregate counts may be observed.
- **Public exposure**: The localized completion page is intentionally public so it remains available after all sessions are revoked. It contains only a generic confirmation and public navigation, never account-specific data.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: An attacker may forge a target identity, induce a cross-origin confirmation, exploit an unattended authenticated browser, replay or race requests, reuse a magic link, enumerate account existence from errors, exhaust deletion or email resources, or create related records concurrently to leave residual data.
- **Controls**: Resolve identity only from the current server session; require authentication within 10 minutes; make magic links expiring and single-use; require a separate explicit confirmation after link return; apply existing same-origin protections; prevent duplicate pending actions; make concurrent authorized confirmations converge safely; remove related records indivisibly; use generic outcomes; and bound both POST operations with operation-specific client buckets in the existing shared database limiter, plus the exact normalized-email address bucket for fresh-authentication issuance.
- **Residual risk**: A person with control of both an authenticated session and the account's email during the recent-authentication window can permanently delete the account. This is inherent to self-service deletion and is accepted because consequences are explicit, the final action is separate, and no recoverable copy is created by the feature.

## Operational Impact *(include if the feature changes deployment, data, or infrastructure)*

- **Deployment changes**: No new runtime service, secret, network, volume, or external provider is required; the feature uses the existing account and email-authentication capabilities.
- **Data changes**: Successful use permanently removes active account and authentication data. Planning must demonstrate indivisible deletion, no attributable residual records, and compatibility with requests occurring during the operation.
- **Failure behavior**: A failed deletion leaves all targeted active data unchanged. A defective release must be corrected without attempting to recreate accounts that users successfully deleted.
- **Observability**: Existing health behavior remains sufficient. Sanitized outcome categories and aggregate success or failure counts may be emitted, but no event may carry data capable of identifying or reconstructing the account.