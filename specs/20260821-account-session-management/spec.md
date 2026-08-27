# Feature Specification: Active Session Management

**Feature Branch**: `20260821-account-session-management`

**Created**: 2026-08-21

**Status**: Draft

**Input**: GitHub issue 41, requesting a protected Account Security section where authenticated people can review active sessions, revoke one other session, or revoke all other sessions without deleting their account.

## Clarifications

### Session 2026-08-21

- Q: Do you mean 20 sessions per page, or a hard maximum of 20 active sessions per account? → A: Enforce a maximum of 20 active sessions, revoke the oldest automatically, and pin the current session in the list.
- Q: When a 21st session is created, how should the oldest session be chosen if previous sessions have missing or identical start times? → A: Treat unknown start times as oldest, then use the earliest known start time, with a stable tie-breaker.
- Q: What should happen when this feature launches and an existing account already has more than 20 active sessions? → A: Normalize the account to its 20 newest active sessions during rollout and revoke the rest using the agreed deterministic ordering.

## User Scenarios & Testing *(mandatory)*

### User story 1: Review and revoke another session (Priority: P1)

As an authenticated person, I can review my active sessions, recognize the session I am currently using, and revoke one other session so that a browser or device I no longer trust loses access without affecting the rest of my account.

**Why this priority**: Individual visibility and revocation provide the core security value while limiting disruption to the selected session.

**Independent Test**: Sign in to one account from multiple browsers, open the localized Security page in one browser, identify the current session, revoke one different session, and verify that only the selected session loses access on its next protected request.

**Acceptance Scenarios**:

1. **Given** an account has multiple unexpired sessions, **When** the person opens Security, **Then** every unexpired session belonging to that account is listed, the current session is clearly marked and pinned first, and no other account's session is shown.
2. **Given** a listed session has a known session-start time and expiry time, **When** the list is displayed, **Then** those times are presented unambiguously in the active locale without exposing mutable authentication evidence, a credential, or a secret identifier.
3. **Given** a legacy session lacks optional display metadata, **When** the list is displayed, **Then** the unavailable value is stated honestly and no device, location, or time is inferred.
4. **Given** the person selects a non-current session and has authenticated within the previous 10 minutes, **When** they explicitly confirm revocation, **Then** that session stops authorizing protected access while the current and other unselected sessions remain usable.
5. **Given** a person selects the current session, **When** the action is evaluated, **Then** revocation is unavailable and the existing sign-out action remains the stated way to end that session.

---

### User story 2: Revoke all other sessions (Priority: P2)

As an authenticated person who suspects broader account exposure, I can revoke every session except the one I am currently using so that I regain control without interrupting the security workflow in front of me.

**Why this priority**: A single bulk action is the fastest proportionate response when the person cannot identify which other session is unsafe.

**Independent Test**: Create at least three unexpired sessions for one account, confirm Revoke all other sessions from one of them, and verify that the exact confirming session remains usable while every other prior session fails its next protected request.

**Acceptance Scenarios**:

1. **Given** at least one other session is active, **When** the person first selects Revoke all other sessions, **Then** no session changes and a confirmation explains that the current session will remain active while all others will end.
2. **Given** the person has authenticated within the previous 10 minutes, **When** they explicitly confirm the bulk action, **Then** the exact session authorizing that confirmation remains active and every other session for the account is revoked as one consistent outcome.
3. **Given** no other unexpired sessions exist, **When** the Security page is displayed, **Then** the page states that only the current session is active and the bulk action is unavailable.
4. **Given** another session is created or expires while the confirmation is open, **When** the bulk action is confirmed, **Then** the result is based on the account's sessions at confirmation time and preserves only the confirming current session.

---

### User story 3: Require fresh, authorized confirmation (Priority: P3)

As an account holder, I am protected from forged, stale, cross-origin, or replayed requests ending my sessions, and I must recently prove control of the account before any revocation occurs.

**Why this priority**: Session revocation changes authorization grants and must not become a way for an attacker with an unattended or stale browser to disrupt account access.

**Independent Test**: Attempt individual and bulk revocation while signed out, with stale authentication, with another account's selection, from another origin, and through concurrent or replayed requests; verify that only an explicit request from a recently authenticated account session can revoke sessions owned by that account.

**Acceptance Scenarios**:

1. **Given** the current session was authenticated more than 10 minutes ago or its authentication time is unavailable, **When** the person tries to revoke sessions, **Then** no session changes and the person is asked to authenticate through a new single-use email link.
2. **Given** the person completes fresh authentication while an active session for the same account exists in the consuming browser, **When** the valid link is consumed, **Then** that exact existing session receives fresh authentication evidence, no session is created or revoked, the person returns to Security in the same locale, the current list is refreshed, and an action must be selected and confirmed again.
3. **Given** fresh-authentication delivery fails, **When** the attempt completes, **Then** every session remains unchanged and a generic localized error allows a safe retry.
4. **Given** a request presents another account's session selection or a nonexistent selection, **When** authorization is evaluated, **Then** no session is revoked and the response does not reveal whether the selection exists.
5. **Given** two individual or bulk requests race or a completed request is replayed, **When** they are evaluated, **Then** they converge on the same authorized session set without revoking the current confirming session or disclosing prior state.
6. **Given** a request comes from outside the trusted application context, **When** revocation is evaluated, **Then** it is rejected without changing sessions or exposing account information.

---

### User story 4: Use security controls in every supported context (Priority: P4)

As an English, Spanish, or Catalan user, I can understand and operate session security controls with a keyboard or assistive technology on supported mobile and desktop viewports.

**Why this priority**: Security controls are only useful when every supported user can find, understand, and operate them without accidental revocation.

**Independent Test**: Exercise session discovery, individual and bulk confirmation, reauthentication, success, empty, stale, and failure states in all three locales at representative mobile and desktop viewports using keyboard navigation and automated accessibility checks.

**Acceptance Scenarios**:

1. **Given** an authenticated person in any supported locale, **When** they navigate through Account, **Then** Security appears alongside the existing account sections, preserves the locale, and exposes the active section visually and semantically.
2. **Given** a signed-out visitor requests a localized Security page, **When** access is evaluated, **Then** the visitor enters the existing sign-in flow in the same locale with only a validated application-local return destination and sees no session data.
3. **Given** a confirmation opens, **When** it receives focus, **Then** initial focus favors the non-destructive action, focus remains within the confirmation, and cancellation restores focus to the initiating control.
4. **Given** a keyboard or assistive-technology user, **When** a revocation is pending or completes, **Then** progress, errors, and the resulting session state are announced without relying on color or pointer input.
5. **Given** the longest translated content and session metadata, **When** the page is displayed on a supported viewport, **Then** controls and content remain readable without overlap, clipping, or horizontal page scrolling.

### Edge Cases

- The current session expires or is revoked elsewhere after the page loads but before confirmation.
- A selected non-current session expires or is revoked elsewhere before the individual action commits.
- The current session changes because fresh authentication is completed in a different browser that already has an active session for the same account; the browser that submits the new confirmation defines which session is current.
- A legacy session has no reliable authentication time but remains unexpired and otherwise valid.
- Multiple sessions have identical visible timestamps and cannot be distinguished by device, location, or browser metadata.
- A new session is created while an individual or bulk confirmation is open.
- Two tabs submit the same individual revocation, different individual revocations, or individual and bulk revocations concurrently.
- The revocation succeeds but the browser loses the response; refreshing must show the authoritative current session set rather than repeat the action automatically.
- Fresh-authentication links are malformed, expired, already used, superseded, opened without an active session, or opened while a conflicting account session is active.
- Fresh-authentication email delivery is unavailable or abuse limits are reached.
- A new session is established when the account already has 20 active sessions; the oldest prior session loses access and the new session remains active.
- Multiple prior sessions have missing or identical start times when the account limit is enforced; missing times rank oldest and a stable tie-breaker selects exactly one candidate.
- Concurrent session creations at the 20-session boundary never leave the account with more than 20 active sessions.
- An account already has more than 20 active sessions when the feature is deployed; rollout preserves the 20 newest according to the deterministic ordering and revokes every older session as one consistent account-level result.
- Expired sessions remain in retained storage temporarily but are never shown as active or allowed to authorize access.
- Localized dates, long translated labels, and the maximum 20-session list remain usable on supported viewports.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide Account Security at `/account/security`, `/es/account/security`, and `/ca/account/security` in English, Spanish, and Catalan respectively.
- **FR-002**: Authenticated account navigation MUST include Profile, Data & Privacy, and Security, preserve the active locale, and identify the active section visually and semantically.
- **FR-003**: The system MUST restrict Security and all session details and actions to authenticated people.
- **FR-004**: A signed-out request for a localized Security page MUST enter the existing sign-in flow in the same locale with only a validated application-local return destination.
- **FR-005**: Security MUST list every unexpired session belonging to the authenticated account, up to the account-wide maximum of 20, and MUST exclude expired sessions and sessions belonging to every other account.
- **FR-006**: Security MUST clearly distinguish the exact current session from every other listed session and pin it as the first item.
- **FR-007**: Each session MUST show its reliable session-start time and expiry time in an unambiguous locale-aware form; unavailable legacy start values MUST be labeled as unavailable.
- **FR-008**: The system MUST NOT infer or display IP address, geolocation, device fingerprint, browser, operating system, or device name when that information is not intentionally collected for this feature.
- **FR-009**: The page and its responses MUST NOT expose session tokens, cookies, authentication links, token-derived identifiers, or any value that can authorize a request.
- **FR-010**: An authenticated person MUST be able to select and revoke one non-current session owned by their account.
- **FR-011**: The system MUST prevent the session authorizing the current request from being selected for revocation and MUST direct a person who wants to end it to the existing sign-out action.
- **FR-012**: An authenticated person MUST be able to revoke all other sessions for their account while preserving exactly the session that authorizes the final confirmation.
- **FR-013**: The first activation of any revocation action MUST change no session and MUST present the action's scope, consequences, and unambiguous cancel and confirm choices.
- **FR-014**: Individual and bulk revocation MUST require evidence that the exact confirming session authenticated within the previous 10 minutes.
- **FR-015**: When recent authentication is absent, expired, or indeterminate, the system MUST change no session and require a new single-use email authentication before revocation can be confirmed.
- **FR-016**: Completing fresh authentication MUST require an existing active session for the same account in the consuming browser, MUST atomically refresh the authentication evidence of that exact session without creating or revoking any session, MUST return the person to the localized Security page, MUST refresh the authoritative list, and MUST require the person to select and confirm an action again.
- **FR-017**: Failure to send or consume a fresh-authentication link MUST leave all sessions unchanged, present a generic localized error, and permit a safe retry through the existing authentication recovery behavior.
- **FR-018**: A successfully revoked session MUST fail authorization on its next protected request, without a grace period.
- **FR-019**: Individual revocation MUST validate ownership, verify that the target is not current, and revoke the selected session as one indivisible action; any failure MUST leave the target, current, and unselected sessions unchanged.
- **FR-020**: Bulk revocation MUST determine the account and current session again at final confirmation and revoke every other session for that account as one indivisible action; any failure MUST preserve the complete pre-action session set.
- **FR-021**: The system MUST derive account identity and the current session exclusively from trusted authenticated state at final confirmation and MUST NOT accept a client-provided user identity, ownership decision, session token, or authorization result.
- **FR-022**: Any noncredential session selection received from the client MUST be treated only as an untrusted selector and MUST be authorized against the authenticated account before it can affect a session.
- **FR-023**: A nonexistent, expired, already-revoked, or unauthorized individual selection MUST make no unauthorized change and MUST NOT reveal whether that session currently exists or who owns it.
- **FR-024**: Repeated, replayed, and concurrent revocation attempts MUST revoke each target at most once, MUST NOT restore revoked access, MUST preserve the session authorizing any successful bulk confirmation, and MUST treat a target already revoked by another request as a non-disclosing no-op.
- **FR-025**: Revocation requests MUST reject requests that fail the application's existing same-origin and cross-site request protections.
- **FR-026**: Fresh-authentication issuance MUST retain the existing shared limits of five attempts per trusted client and three per normalized account address in 15 minutes; excess requests MUST reach a generic rate-limited state before email delivery, while revocation confirmations MUST prevent duplicate in-flight work and handle completed replays according to FR-024.
- **FR-027**: While an action is pending, the system MUST prevent duplicate submission, expose an unmistakable progress state, and announce progress to assistive technology.
- **FR-028**: A cancellation before revocation begins MUST preserve every session and restore focus to the action that opened the confirmation.
- **FR-029**: A failure before an authorized revocation commits MUST preserve the complete pre-action session set, present a generic localized outcome, and allow the person to refresh the authoritative list safely; a lost response after commit MUST never cause the browser to repeat the action automatically.
- **FR-030**: After every success, no-op, or failure, the Security page MUST show or retrieve the authoritative current session set rather than relying on stale optimistic state.
- **FR-031**: All page, confirmation, reauthentication, progress, empty, success, and error content MUST be behaviorally equivalent in English, Spanish, and Catalan and preserve the selected locale throughout the journey.
- **FR-032**: The complete feature MUST be operable with a keyboard and assistive technology and MUST remain free of overlap, clipping, and horizontal page scrolling at supported mobile and desktop viewports.
- **FR-033**: Logs and user-visible errors MUST NOT contain names, emails, account identifiers, session selections, session tokens, cookies, authentication links, user-agent strings, IP addresses, or other personal or credential data.
- **FR-034**: Operational reporting MAY record only sanitized outcome categories and aggregate counts that cannot identify an account or session or reconstruct its activity.
- **FR-035**: Automated verification MUST cover access control, current-session identification, individual and bulk revocation, recent authentication, delivery failure, ownership isolation, same-origin protection, replay, concurrency, lost responses, localization, accessibility, responsive layout, abuse controls, and secret redaction.
- **FR-036**: An account MUST have no more than 20 active sessions, including its current session; when establishing another session would exceed that maximum, the system MUST preserve the new session and automatically revoke exactly the oldest prior active session.
- **FR-037**: For automatic limit enforcement, a prior session with no reliable start time MUST rank older than every prior session with a known start time; otherwise the earliest known start time ranks oldest, and equal-ranked candidates MUST be resolved by one stable deterministic ordering.
- **FR-038**: Concurrent session creation at the account-wide maximum MUST apply the limit and the ordering in FR-037 as one consistent outcome so that no more than 20 sessions remain active and no newly established session is revoked by the creation that established it.
- **FR-039**: At feature rollout, every account with more than 20 active sessions MUST be normalized immediately by repeatedly revoking the oldest session under FR-037 until exactly 20 active sessions remain.
- **FR-040**: Rollout normalization MUST be indivisible per account: either that account retains exactly its permitted 20 active sessions or its complete pre-normalization session set remains unchanged for a safe retry.

### Key Entities *(include if feature involves data)*

- **Account Holder**: The authenticated person whose account and current session are established from trusted session state; they may inspect and revoke only sessions belonging to that account.
- **Active Session**: An unexpired authorization grant belonging to one account, with a noncredential identity, an expiry time, optional immutable start time, and optional mutable recent-authentication evidence. It may be current, individually selected, preserved, automatically displaced at the 20-session limit, or revoked.
- **Current Session**: The exact active session authorizing the page or final confirmation. It is marked in the list, cannot be individually revoked from this feature, and is the sole session preserved by a bulk action.
- **Session Selection**: A noncredential reference used to choose a listed non-current session. It conveys no authorization and must be checked against the authenticated account when acted upon.
- **Recent Authentication Evidence**: Proof tied to the exact confirming session that the account holder authenticated within the previous 10 minutes. It permits confirmation but does not itself select or revoke a session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In moderated first-attempt testing with at least 20 target participants and representation across all supported locales and both mobile and desktop, at least 90% can identify the current session and revoke one other session within 2 minutes, excluding fresh-authentication delivery time.
- **SC-002**: In 100% of successful individual-revocation tests, the selected session loses protected access while the current and every unselected session remain usable.
- **SC-003**: In 100% of successful bulk-revocation tests, only the exact session that authorizes final confirmation remains usable afterward.
- **SC-004**: In 100% of revocation tests, a revoked session fails its first subsequent protected request with no grace period.
- **SC-005**: In authorization and request-integrity verification, 100% of signed-out, stale, forged-ownership, cross-origin, replayed, and unauthorized attempts fail to revoke a session or reveal whether a selected session exists.
- **SC-006**: At least 95% of confirmed revocation attempts present a definitive updated session state or generic recoverable error within 2 seconds on the target deployment environment.
- **SC-007**: For English, Spanish, and Catalan, 100% of navigation, session metadata, confirmation, reauthentication, progress, empty, success, and error states are translated and preserve the selected locale.
- **SC-008**: Automated accessibility checks report zero serious or critical violations, and keyboard-only verification completes individual revocation, bulk revocation, cancellation, and error recovery without a focus trap or pointer input.
- **SC-009**: Across supported mobile and desktop verification viewports, the Security page and confirmations have zero detected content overlaps, clipped controls, or horizontal page scrolling with the longest localized content.
- **SC-010**: In 100% of Account Security pages, account-security API response payloads, post-verification redirect URLs, and feature-owned application logs, no session credential, token-derived identifier, authentication link, cookie, personal identifier, IP address, user-agent string, or inferred device/location detail is exposed. The intentionally delivered inbound single-use email URL is the sole credential-bearing URL and MUST NOT be reflected, retained as a return destination, or logged by application code.
- **SC-011**: In concurrent and lost-response verification, 100% of refreshed Security pages converge on the authoritative permitted session set without restoring access or automatically repeating a revocation.
- **SC-012**: In 100% of sequential and concurrent session-creation tests at the account limit, including missing and identical prior start times, no more than 20 sessions remain active, each creation commits with the session it just established active, and the deterministically selected oldest session that existed before that creation fails its next protected request. A later successful creation MAY subsequently evict an earlier new session only if that row then ranks as its oldest prior session.
- **SC-013**: In rollout verification, 100% of accounts starting above the limit retain exactly their deterministically selected 20 newest active sessions with no partial account-level normalization, while accounts at or below the limit remain unchanged.

## Assumptions

- The existing account, database-backed session, localized sign-in, email delivery, and safe local-return behavior remain available dependencies.
- An active session is an unexpired session that would otherwise authorize the account; expired sessions may be cleaned up separately but are never presented as active.
- The existing recent-authentication window is 10 minutes and an absent authentication timestamp is treated as stale rather than guessed.
- The maximum of 20 includes the current session and every other unexpired session that would otherwise authorize the account.
- A stable tie-breaker identifies one session consistently but does not need to be meaningful or visible to the account holder.
- Rollout normalization may end older active sessions without an interactive confirmation because it establishes the account-wide security invariant selected for this feature.
- Immutable session-start time and expiry time are sufficient display metadata for this baseline; mutable authentication evidence is authorization-only, and collecting device, network, or location details is not required.
- The system can distinguish the current session and can identify another session with a noncredential selector whose ownership is rechecked at the action boundary.
- The browser consuming a fresh-authentication link must already hold an active session for the same account. It may be the initiating browser or another already-authenticated browser; signed-out, expired-session, and conflicting-account browsers cannot consume the credential or create a session.
- The session that consumes fresh authentication and later submits final confirmation is authoritative for the meaning of current. Reauthentication refreshes that existing session in place, restores locale and access to Security, and deliberately carries no selected revocation target across the authentication boundary.
- The intentionally delivered single-use email verification URL necessarily contains its raw credential. The callback immediately redirects to a credential-free localized route and application code never logs, reflects, or reuses the link as a return destination.
- Revocation removes authorization immediately and creates no historical session or audit record as part of this feature.
- Supported locales and viewport sizes are the same English, Spanish, Catalan, mobile, and desktop variants already covered by the application.

## Non-Goals *(mandatory)*

- Administrative viewing or revocation of another person's sessions.
- Roles, permissions, organizations, tenants, or workspaces.
- Historical login reporting, a security activity feed, or an audit-log feature.
- IP collection, geolocation, device fingerprinting, user-agent retention, or inferred browser, device, operating-system, or location names.
- Revoking the current session from Security or replacing the existing sign-out journey.
- Account deletion, personal-data export, or changes to profile management.
- Changing registration, account activation, authentication providers, or the existing session strategy.
- Sending notifications when a session is created or revoked.
- Automatic revocation based on risk scoring, inactivity, device trust, or administrator policy; automatic enforcement of the 20-session maximum is the only automatic revocation in scope.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: Security is private to authenticated people. Account identity, current-session identity, ownership, and recent-authentication evidence are re-established from trusted state at final confirmation. A client selection is never an authorization decision.
- **Account lifecycle**: Registration, activation, ordinary sign-in, and account deletion remain unchanged. Reauthentication applies only to an existing active account and never creates an account implicitly.
- **Authentication provider verification**: Fresh verification uses the enabled real email provider boundary and single-use credential behavior. Consumption requires an existing active same-account session and refreshes only that session's authentication evidence. Integration or end-to-end verification must exercise delivery success, delivery failure, expiry, single use, missing/expired/conflicting sessions, locale preservation, unchanged session count at the 20-session boundary, and return without automatic revocation.
- **Data sensitivity**: Session credentials and authentication links are secrets. Account and session identifiers, timestamps, and activity relationships are security-sensitive. Only the minimum noncredential metadata needed by the account holder is displayed.
- **Input validation**: The system validates the current session, recent-authentication age, locale, safe return destination, requested action, selected non-current session ownership, confirmation state, and request origin at the trusted action boundary.
- **Log hygiene**: Names, emails, account identifiers, session selections, session tokens, cookies, link values, IP addresses, user-agent strings, and revocation payloads are excluded from logs. Only sanitized outcomes and aggregate counts may be observed.
- **Public exposure**: No session list or revocation action is intentionally public. Signed-out access reveals no session or account information and enters the existing generic sign-in journey.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: An attacker may forge a session selection, target another account, use an unattended stale browser, induce a cross-origin request, replay or race revocations, exploit a lost response, enumerate session existence from errors, exhaust email or revocation resources, or try to make the bulk action revoke the confirming session.
- **Controls**: Trusted-session account resolution, ownership checks at final confirmation, a 10-minute recent-authentication requirement, explicit post-authentication confirmation, same-origin protection, generic non-disclosing outcomes, bounded abuse controls, duplicate-submission prevention, idempotent replay behavior, and authoritative list refreshes limit these threats.
- **Residual risk**: A person controlling a recently authenticated browser can revoke other sessions for that account. The absence of device and location collection can make similar sessions harder to distinguish, but the bulk action provides a privacy-preserving recovery option and the person can authenticate again from a revoked browser.

## Operational Impact *(include if the feature changes deployment, data, or infrastructure)*

- **Deployment changes**: The feature requires no new public service, worker, network, volume, external provider, runtime secret, or background job. Planning must confirm whether any non-sensitive configuration is needed.
- **Data & migrations**: Rollout adds one nullable immutable session-start timestamp, backfills it only from pre-feature non-null authentication timestamps that were written exclusively at session creation, leaves truly unknown legacy starts null, normalizes every existing account above 20 active sessions to its deterministic 20 newest, and leaves accounts at or below the limit unchanged. No new selector column is required. Backup scope continues to include session data.
- **Recovery**: Rollout normalization is indivisible per account and safely retryable for any account left unchanged by a failure. Any applied data change is recovered with a corrective forward migration in normal operation; an incompatible failure uses the documented verified backup-and-restore procedure rather than assuming a code rollback reverses data or restores revoked authorization grants.
- **Observability**: Existing health behavior remains sufficient unless planning identifies a new failure mode. Structured reporting is limited to sanitized revocation, reauthentication, denial, rate-limit, and failure outcome categories plus aggregate counts, with no account, session, network, or device data.
