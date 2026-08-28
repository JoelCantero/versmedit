# Feature Specification: Personal Data Export

**Feature Branch**: `20260823-personal-data-export`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "Add personal data export to Data & Privacy using GitHub issue #43"

## Clarifications

### Session 2026-08-23

- Q: What resource limits should apply to one data-export generation attempt? → A: 25 MiB and 30 seconds by default, configurable per application.
- Q: When should the envelope and each exported section increment their versions? → A: Use independent integer versions: the envelope changes only for its own incompatible changes; each section changes when its schema or meaning changes.
- Q: When may a contributor mark its section unavailable without aborting the export? → A: Only for an expected, declared non-error condition; no records produce an empty section, and any error aborts the whole export.
- Q: What rate limits should apply to export requests, confirmations, and generations? → A: Per 15 minutes: request 5 per trusted client and 3 per account; confirmation 5 per trusted client; generation 3 per exact session.

## User Scenarios & Testing *(mandatory)*

### User story 1: Request, confirm, and download personal data (Priority: P1)

As an authenticated user, I want to confirm a personal-data export through my account email and explicitly download it from Data & Privacy so that I can inspect or port the information associated with my account without weakening other account protections.

**Why this priority**: This is the core user value and the minimum complete journey. A request or confirmation without a secure, usable download would not solve the user's need.

**Independent Test**: Use an account with representative framework data to request an export, follow the email confirmation from the same active session, activate the separate download action, and verify that the resulting file is complete, valid, and unavailable after the authorization expires.

**Acceptance Scenarios**:

1. **Given** an authenticated user on the localized Data & Privacy page, **When** they request a data export, **Then** one localized confirmation email is sent to the authoritative account email without generating or retaining an export file.
2. **Given** an unconsumed confirmation credential and any existing active session for the same account, **When** the user confirms within 15 minutes, **Then** the credential is consumed once, a download authorization is bound to that exact session until the credential's original expiry, and the user returns to a clean localized Data & Privacy URL.
3. **Given** a valid session-bound download authorization, **When** the user explicitly activates Download data, **Then** a versioned UTF-8 JSON snapshot is generated from one consistent committed view and returned as a direct attachment without a retained server-side copy.
4. **Given** a user who has only opened or confirmed the email link, **When** they do not activate Download data, **Then** no export is generated and no download begins.
5. **Given** the original 15-minute expiry has passed, **When** the user views or activates the download action, **Then** the authorization is unavailable and the user is directed to request a new confirmation email.

---

### User story 2: Fail safely without revealing account state (Priority: P2)

As a user or visitor whose confirmation cannot be accepted, I want a clear but non-revealing outcome so that I can recover without exposing whether an account, session, or credential exists.

**Why this priority**: Exported data is sensitive, and a safe failure path prevents the confirmation link from becoming a login, enumeration, or cross-account access mechanism.

**Independent Test**: Exercise signed-out, expired-session, revoked-session, conflicting-account, expired, malformed, superseded, replayed, cross-origin, and rate-limited attempts and verify that none grants download access, creates a session, discloses account state, or produces a file.

**Acceptance Scenarios**:

1. **Given** a valid confirmation link opened without an active same-account session, **When** the callback is processed, **Then** it grants no download permission and presents a generic localized outcome.
2. **Given** a consumed, expired, malformed, superseded, or replayed credential, **When** confirmation is attempted, **Then** the result is generic, no account state is revealed, and no export is generated.
3. **Given** an authenticated session for a different account, **When** it opens the link, **Then** neither account receives download authorization and the response does not identify the conflict.
4. **Given** a successful export confirmation, **When** the user attempts another privileged account action, **Then** export confirmation provides no authorization or freshness for that action.
5. **Given** any export operation has exhausted its applicable 15-minute allowance, **When** another attempt is made, **Then** it receives a generic localized wait outcome with the remaining wait time and performs none of that operation's protected work.

---

### User story 3: Contribute application-specific personal data (Priority: P2)

As an application maintainer using the framework, I want each domain that owns personal data to register a namespaced export contribution so that exports remain complete as the application grows without coupling framework core to product-specific data.

**Why this priority**: A hard-coded exporter would become incomplete when a derived application introduces a new user-owned data domain, undermining the trustworthiness of every export.

**Independent Test**: Register a fixture domain containing user-provided, observed, and derived records, generate an export, and verify its stable namespaced section while duplicate names, omitted registrations, nondeterministic data, and contributor failures are rejected or surfaced.

**Acceptance Scenarios**:

1. **Given** a registered application contributor, **When** an eligible user downloads an export, **Then** its structured data appears under its unique namespace with a section schema version and deterministic ordering.
2. **Given** an application module with no records for the user, **When** an export is generated, **Then** the module appears as an explicit empty section rather than disappearing or being marked unavailable.
3. **Given** any contributor fails, returns a duplicate namespace, or cannot provide deterministic output, **When** generation is attempted, **Then** the whole export fails generically and no apparently complete partial file is returned.
4. **Given** a new module that stores account-attributable personal data, **When** release readiness is checked, **Then** an omitted or unregistered export contribution is visible before the application is considered compliant.
5. **Given** a contributor has a declared expected non-error condition that prevents its section from applying to the account, **When** an export is generated, **Then** the manifest identifies that namespace as unavailable without exposing sensitive diagnostic detail.

---

### User story 4: Complete the journey accessibly in any supported language (Priority: P3)

As an English-, Spanish-, or Catalan-speaking user, including one using a keyboard, screen reader, or small screen, I want the export journey to retain my language and clearly announce each state so that I can complete it without confusion or loss of context.

**Why this priority**: The Data & Privacy area is already localized and protected; the new sensitive-data journey must not create a less accessible or inconsistent path.

**Independent Test**: Complete request, confirmation, ready, download, expiry, and failure journeys in all three locales across keyboard, screen-reader, mobile, and desktop checks, verifying state announcements, focus continuity, and layout integrity.

**Acceptance Scenarios**:

1. **Given** a user in any supported locale, **When** they move through request, email confirmation, download, success, expiry, or failure, **Then** the active locale is preserved and all user-facing content is localized.
2. **Given** a signed-out user who opens a localized Data & Privacy URL, **When** authentication is required, **Then** the matching localized login flow receives only a validated local return destination.
3. **Given** a keyboard or screen-reader user, **When** the export state changes, **Then** the new state and available action are perceivable without focus loss.
4. **Given** a mobile or desktop viewport, **When** any export state is shown, **Then** controls and status content remain readable and operable without clipping, overlap, or horizontal overflow.

### Edge Cases

- A second confirmation email is issued while an older credential remains unconsumed; only the newly issued credential remains eligible for confirmation.
- Email delivery fails; no new usable credential supersedes an existing credential unless the new email was successfully issued, and no export is generated.
- The requesting session expires or is revoked before confirmation or download; the credential or grant cannot restore it or create a replacement session.
- A different active session for the same account opens the link; authorization is bound only to the exact session that successfully consumes the credential, not to every account session.
- The account is deleted or becomes ineligible between request, confirmation, and generation; no export is produced and the outcome remains generic.
- The confirmation succeeds close to expiry; the ready state exposes only the remaining portion of the original 15-minute window and never extends it.
- The authorization expires while generation is starting; eligibility is checked at the protected generation boundary and an ineligible request produces no file.
- A contributor has no records, encounters a declared expected non-error condition, returns duplicate or unordered records, causes the configured 25 MiB or 30-second default limit to be exceeded, or fails mid-generation; empty, unavailable, and whole-export failure semantics remain distinct and no partial file is returned.
- Concurrent confirmation attempts target the same credential; at most one consumes it and obtains a scoped authorization.
- Concurrent download actions use the same eligible session; every successful response is a self-consistent snapshot and no shared mutable export artifact is retained.
- Concurrent attempts cross a rate-limit boundary; shared counting admits no more than the applicable allowance across application instances.
- Personal data changes during generation; the downloaded file reflects one consistent committed point in time rather than a mixture of states.
- A localized callback contains an external or malformed return destination; it is rejected in favor of a safe local destination with no credential left in the resulting URL.

### Verification Strategy

- Automated behavior checks must cover credential purpose isolation, exact expiry, supersession, atomic single-use confirmation, exact-session authorization, deterministic envelopes, independent envelope and section version transitions, complete redaction, configured size and generation-time boundaries, and whole-export failure.
- Integration checks against production-equivalent persistent state and the configured email-delivery boundary must cover concurrent confirmation, exact shared rate-limit boundaries across application instances, consistent snapshots, revoked sessions, and delivery failure without replacing real boundaries with unverified substitutes.
- A production-artifact journey must cover localized request, email confirmation, clean callback, explicit download, expiry, replay, conflicting-account, and signed-out behavior.
- Contributor contract checks must use a fixture application domain to cover user-provided, observed, and derived data, empty sections, declared unavailable conditions, omitted registration, duplicate namespaces, nondeterministic ordering, and partial failure.
- Accessibility and responsive checks must cover keyboard, screen-reader, mobile, and desktop use through every visible state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST add a Download your data section before permanent account deletion on the protected Data & Privacy page in English, Spanish, and Catalan.
- **FR-002**: The section MUST explain that the export can contain sensitive information and should be stored securely.
- **FR-003**: The journey MUST keep request, email-sent, confirmation, ready-to-download, expired, downloading, success, and generic-failure states distinct, localized, and perceivable.
- **FR-004**: Signed-out access to a localized Data & Privacy page MUST enter the corresponding login flow using a validated local return destination.
- **FR-005**: Only an authenticated user with an eligible active session MUST be able to request an export for their own account.
- **FR-006**: A request MUST send a localized, export-purpose-only confirmation link to the account's authoritative email address and MUST NOT accept a client-provided address, account identifier, user identifier, export scope, or contributor list.
- **FR-007**: Requesting or sending a confirmation email MUST NOT generate, retain, queue, or attach an export file.
- **FR-008**: Each confirmation credential MUST be cryptographically random with at least 32 random bytes, retained only as a cryptographic digest, single-use, dedicated solely to personal-data export, and valid for exactly 15 minutes from issuance.
- **FR-009**: Successfully issuing a newer confirmation email MUST supersede every older unconsumed export credential for that account.
- **FR-010**: Shared abuse controls MUST enforce, in each 15-minute allowance window started by the first admitted attempt and reset atomically after expiry, no more than five export requests per trusted client and three export requests per account, five confirmation attempts per trusted client, and three generation attempts per exact session. An excess attempt MUST receive a generic localized wait outcome with the remaining wait time and MUST NOT send email, inspect or consume a credential, grant authorization, invoke contributors, or generate a file.
- **FR-011**: Opening a confirmation link MUST NOT sign the visitor in, create or replace a session, update general authentication freshness, generate an export, or start a download.
- **FR-012**: Confirmation MUST require an existing active session that belongs to the same account, resolved entirely from trusted server-side state.
- **FR-013**: Successful confirmation MUST atomically consume the credential and grant only the exact consuming session permission to download until the credential's original expiration time.
- **FR-014**: Export confirmation MUST NOT authorize account deletion, session revocation, profile changes, login, signup, or any other privileged action.
- **FR-015**: After callback processing, the user MUST return to the localized Data & Privacy page with all credential material removed from the URL and redirects.
- **FR-016**: A successfully authorized session MUST see an explicit Download data action and the remaining availability window.
- **FR-017**: The system MUST require a separate, explicit Download data activation after confirmation before generating or returning any file.
- **FR-018**: Download eligibility MUST be resolved from the exact current session, its account, the scoped authorization, and the original expiry; client claims MUST NOT influence the decision.
- **FR-019**: Each successful download MUST represent one immutable point-in-time snapshot from a consistent committed view taken only after the user activates Download data.
- **FR-020**: The export MUST be returned directly as a UTF-8 JSON attachment, marked as non-cacheable, and MUST NOT be retained in application storage, logs, queues, backups, redirects, or email after success or failure.
- **FR-021**: Every export MUST use a deterministic, versioned envelope that declares its envelope schema version and generation time and contains stable namespaced sections plus a manifest of included and unavailable sections. The positive integer envelope version MUST increment only when the envelope or manifest schema or meaning changes incompatibly; adding or changing an independently versioned section MUST NOT by itself increment the envelope version.
- **FR-022**: The initial framework export MUST include account name, email, profile image value, account status, verification timestamp, and account creation and update timestamps.
- **FR-023**: The initial framework export MUST describe linked authentication-provider identities while excluding every provider credential and secret.
- **FR-024**: The initial framework export MUST include accepted terms and privacy versions with their acceptance timestamps.
- **FR-025**: The initial framework export MUST include active-session timestamps and freshness evidence without session identifiers, selectors, credentials, network attributes, or inferred device or location information.
- **FR-026**: The export MUST NOT duplicate normalized or internal representations when the meaningful user-facing value is already present.
- **FR-027**: The framework MUST define a product-independent export contribution contract for every application module that stores account-attributable personal data.
- **FR-028**: Each application MUST explicitly declare its export contributors at its composition boundary; framework core MUST NOT discover arbitrary data stores or depend on product-specific modules.
- **FR-029**: Each contributor MUST provide a unique stable namespace, its own positive integer section schema version, structured data, and deterministic ordering. A section version MUST increment whenever that section's schema or meaning changes, independently of the envelope and every other section.
- **FR-030**: A central export coordinator MUST combine only explicitly registered contributors into one envelope and MUST reject duplicate namespaces.
- **FR-031**: A contributor with no records MUST return an explicit empty section and MUST NOT silently disappear or report itself unavailable. A namespace MAY appear as unavailable only for an expected, explicitly declared non-error condition that makes the section inapplicable to that account; the manifest MUST identify the namespace using a fixed non-sensitive reason category.
- **FR-032**: Any runtime error, timeout, invalid contribution, or undeclared inability to produce a section MUST fail the complete export with a generic outcome; the system MUST NOT reclassify the failure as unavailable or return an apparently complete partial file.
- **FR-033**: Release verification MUST expose omitted registrations, duplicate namespaces, unregistered personal-data modules, nondeterministic ordering, and partial-failure behavior.
- **FR-034**: Contributors MUST distinguish user-provided, observed, and derived values when that classification is material to interpreting the data.
- **FR-035**: Globally shared or static content MUST NOT be duplicated unless required to interpret an account-linked record and redistribution is permitted.
- **FR-036**: The active locale MUST be preserved through request, email, confirmation, ready, download, success, expiry, and failure states.
- **FR-037**: Stale, revoked, conflicting, replayed, malformed, cross-origin, rate-limited, expired, and failed attempts MUST receive generic non-enumerating outcomes, grant no authorization, and produce no file.
- **FR-038**: Export contents, credentials, reusable authorization material, internal identifiers, security-control state, and personal data MUST NOT appear in URLs, redirects, filenames, response metadata, or operational logs.
- **FR-039**: Operational records for this journey MUST be limited to fixed, non-identifying outcome categories and timing information required to assess reliability and abuse.
- **FR-040**: All states and actions MUST remain operable by keyboard and screen reader and across mobile and desktop layouts without focus loss, clipping, overlap, or horizontal overflow.
- **FR-041**: Each generation attempt MUST enforce default limits of 25 MiB for the completed export and 30 seconds for generation. An application MAY configure different limits, but exceeding either active limit MUST fail generically without returning a partial attachment or retaining export data.

### Key Entities

- **Export Confirmation Credential**: A purpose-isolated, single-use proof sent to the authoritative account email. It has an account association, requested locale, issuance and exact expiry times, digest, and consumed or superseded status; the raw value is never retained.
- **Session-Bound Download Authorization**: A narrowly scoped permission created by successful confirmation and associated with one exact active session, the same account, and the confirmation credential's original expiry. It grants no other account privilege.
- **Personal Data Export**: An immutable, transient snapshot generated only on explicit download. It has an envelope schema version, generation timestamp, deterministic sections, and a manifest, but no retained server-side file identity.
- **Export Contributor**: A registered owner of one stable namespaced section. It declares a section schema version and returns structured, deterministically ordered account-attributable data, an explicit empty section when no records exist, or a fixed unavailable category only for a declared expected non-error condition.
- **Export Manifest**: The included and unavailable namespace inventory that, together with the envelope-level schema version and generation time, lets recipients interpret completeness.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least 95% of representative users can complete the request-to-download journey on their first attempt within 5 minutes after receiving the email.
- **SC-002**: 100% of successful exports are valid UTF-8 JSON attachments with the declared envelope version, a manifest, all expected in-scope sections, and deterministic ordering for the same snapshot.
- **SC-003**: 100% of successful exports contain data only for the authenticated account and contain none of the explicitly forbidden credentials, identifiers, network attributes, or operational data.
- **SC-004**: 100% of confirmation credentials and unused session-bound authorizations become unusable at their original 15-minute expiry without extending the availability window.
- **SC-005**: Across all tested invalid, conflicting, expired, replayed, superseded, cross-origin, and rate-limited attempts, zero attempts create a session, grant another privilege, reveal account state, or produce a file.
- **SC-006**: Every supported locale completes the request, confirmation, download, expiry, and failure journeys with no untranslated user-facing text and no loss of locale.
- **SC-007**: All critical controls and state changes pass keyboard and screen-reader verification, and tested mobile and desktop layouts show zero clipping, overlap, focus loss, or horizontal overflow.
- **SC-008**: Release verification detects 100% of fixture cases involving omitted contributor registration, duplicate namespaces, nondeterministic ordering, and contributor failure before release approval.
- **SC-009**: No generated export copy remains in application-controlled storage, logs, queues, backups, or email after a successful or failed response.
- **SC-010**: Users receive a distinct, understandable next action for every journey state while all security-sensitive failures remain non-enumerating.
- **SC-011**: Boundary verification confirms that 100% of attempts exceeding the active size or generation-time limit fail without an attachment or retained export data, using both the 25 MiB and 30-second defaults and one application-specific configuration.
- **SC-012**: Compatibility verification confirms that adding or revising a section leaves the envelope version unchanged, revising a section increments only that section's version, and an incompatible envelope or manifest change increments the envelope version.
- **SC-013**: Contributor contract verification classifies 100% of no-record fixtures as explicit empty sections, declared expected non-error fixtures as unavailable manifest entries, and runtime or validation failures as whole-export failures.
- **SC-014**: Concurrent boundary verification across at least two application instances admits at most 5 requests per trusted client, 3 requests per account, 5 confirmations per trusted client, and 3 generations per exact session in 15 minutes; every excess attempt reports a generic remaining wait and performs zero protected work.

## Assumptions

- The existing protected Data & Privacy page, authenticated-session handling, email delivery capability, canonical-origin checks, request protections, and shared abuse controls remain available and are reused as product boundaries.
- The authoritative account email is already verified and is the only destination for export confirmation.
- English is the default unprefixed locale; Spanish and Catalan retain their existing localized routes.
- The session-bound authorization remains usable by its exact active session until the original expiry. Each explicit activation produces a new immutable point-in-time response, and no generated response is retained.
- Product applications are responsible for identifying every module that owns account-attributable personal data and explicitly registering its contributor.
- The framework defaults each generation attempt to a 25 MiB completed export and 30 seconds of generation time; applications may configure different limits after validating their expected data volume and host capacity.
- The downloaded file is sensitive user-controlled output once delivery succeeds; users are warned to store it securely.

## Non-Goals *(mandatory)*

- Implementing or prescribing any product-specific domain or data model.
- Automatically discovering arbitrary data stores or serializing an internal storage schema.
- Treating export confirmation as login, signup, general-purpose reauthentication, or authentication freshness.
- Generating or attaching the personal-data file to the confirmation email.
- Allowing the email link itself to download data as an unauthenticated bearer link.
- Retaining a generated export for later retrieval.
- Providing PDF, CSV, printable reports, or human-formatted archive variants in this release.
- Importing an export, restoring an account, or migrating data into another account.
- Providing scheduled exports, emailed attachments, shareable links, or retained downloadable archives.
- Allowing an administrator to export another user's data.
- Exporting data after account deletion.
- Duplicating globally shared content that is not attributable to the account.
- Replacing every legal data-subject-request process or identity-verification obligation with this self-service feature.
- Changing existing retention, backup, account-deletion, or session-management policies.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: Request and generation require an eligible authenticated session. Confirmation requires the same account and grants export permission only to the exact active session that consumes the link. Every account, session, ownership, scope, and authorization decision is resolved from trusted server-side state.
- **Account lifecycle**: This feature neither registers users nor authenticates unknown emails. Only existing eligible accounts may request an export, and unknown, deleted, or ineligible account states receive generic outcomes.
- **Authentication provider verification**: Existing sign-in providers are unchanged. Verification must demonstrate that export confirmation never creates a provider or application session, refreshes authentication, or bypasses the established session boundary.
- **Data sensitivity**: The export is sensitive personal data. Provider credentials, session credentials, cookies, verification credentials, magic links, access tokens, refresh tokens, identity tokens, secrets, rate-limit state, internal identifiers, raw request data, operational diagnostics, network addresses, geolocation, user-agent strings, device fingerprints, and inferred device or location labels are forbidden.
- **Input validation**: Credential shape, purpose, expiry, consumption state, origin, local return destination, current session, account match, scoped authorization, contributor registration, namespace uniqueness, and contributor output validity must be checked at the trusted processing boundary.
- **Log hygiene**: Logs may contain only fixed non-identifying outcome categories and timing. They must exclude account data, email addresses, export contents, credentials, reusable authorization, session identifiers, contributor payloads, and raw request details.
- **Public exposure**: The email callback is externally reachable but is not a bearer download and grants nothing without an existing active same-account session. Request and download actions remain protected account operations.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: Attackers may automate confirmation issuance, enumerate accounts from outcomes or timing, steal or replay links, confirm from a conflicting account, forge account or session claims, force cross-origin actions, exhaust generation resources, exploit duplicate or omitted contributors to hide data, or inject sensitive data into filenames, redirects, and logs.
- **Controls**: Use purpose isolation, high-entropy single-use credentials retained only as digests, exact 15-minute expiry, atomic consumption and grant creation, exact-session and same-account binding, canonical-origin and request-forgery protections, the operation-specific shared 15-minute limits in FR-010, generic outcomes, deterministic contributor validation, whole-export failure, direct non-cacheable attachment delivery, and strict data and log exclusions.
- **Residual risk**: A recipient can copy or mishandle a legitimately downloaded file, an attacker controlling both the user's email and active session can act as that user, and very large product-specific contributors may increase generation cost. These risks are accepted only with explicit sensitivity warnings, existing account security, bounded generation, monitoring, and application-specific contributor review.

## Operational Impact *(include if the feature changes deployment, data, or infrastructure)*

- **Deployment changes**: No new public service, container, network, volume, or retained export store is expected. The feature depends on the existing email delivery and shared abuse-control capabilities; derived applications must register their contributors and validate any departure from the default 25 MiB and 30-second generation limits before release.
- **Data & migrations**: Persistent state must represent export-purpose confirmation and exact-session download authorization, including issuance, expiry, consumption, and supersession. Any data change requires a forward migration that preserves existing authentication and account-action credentials and does not extend their privileges.
- **Recovery**: A failed deployment must be corrected with a forward change or a verified restore that preserves account and confirmation integrity. Outstanding export grants may safely fail closed; no generated file requires recovery because files are never retained.
- **Observability**: Track fixed non-identifying outcomes and timings for issuance, confirmation, generation, expiry, rate limiting, contributor failure, and download completion. Existing service health must remain representative, and alerts or diagnostics must not include export payloads or personal identifiers.
