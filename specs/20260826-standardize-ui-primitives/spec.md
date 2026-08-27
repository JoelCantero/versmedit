# Feature Specification: Standardize UI Primitives

**Feature Branch**: `20260826-standardize-ui-primitives`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Create the specification for GitHub issue #56: audit and adopt remaining shared UI primitives."

## Clarifications

### Session 2026-08-27

- Q: Should the separate email preview application be included in this feature's implementation scope? → A: Defer preview-app adoption to a follow-up.

## User Scenarios & Testing *(mandatory)*

### User story 1: Complete forms and actions accessibly (Priority: P1)

As a visitor or account holder, I can complete authentication and account actions through consistent controls without losing keyboard access, error context, focus behavior, or the expected meaning of links and buttons.

**Why this priority**: These controls are part of critical account journeys. A visual consistency change must not make registration, sign-in, profile editing, recovery, logout, or theme selection harder or less accessible.

**Independent Test**: Complete the sign-up, sign-in, profile, recovery, account-deleted, logout, and theme-selection interactions using both a pointer and keyboard, deliberately triggering validation errors, and verify that behavior and announcements remain intact.

**Acceptance Scenarios**:

1. **Given** a visitor is completing sign-up, **When** they toggle the policy consent control with a pointer or keyboard, **Then** its checked, focus, required, and invalid states are conveyed correctly.
2. **Given** invalid input on sign-in, sign-up, or profile editing, **When** validation feedback appears, **Then** the message is associated with the relevant field, announced at the intended time, and does not cause avoidable layout movement.
3. **Given** an account-deleted or sign-up recovery state offers navigation to another page, **When** a user inspects or activates the action, **Then** it retains link semantics, destination behavior, accessible naming, and visible focus.
4. **Given** logout and theme controls are available in application navigation, **When** a user activates either control, **Then** the existing action, state, focus, and responsive navigation behavior are preserved.

---

### User story 2: Understand warnings and account status (Priority: P2)

As a visitor or account holder, I can distinguish legal notices, personal-data warnings, operation outcomes, and current-session state through consistent presentation that preserves the urgency and announcement behavior of each message.

**Why this priority**: These messages explain legal status, sensitive account operations, and security state. Consistency is valuable only when the underlying meaning remains clear to all users.

**Independent Test**: Visit the legal and account data/security surfaces, trigger each applicable warning, error, success, and callback state, and verify visual meaning, semantic role, live announcement behavior, and current-session identification.

**Acceptance Scenarios**:

1. **Given** a visitor opens a legal page containing a draft notice, **When** the page is presented, **Then** the notice is visually distinct, semantically identifiable, and does not obscure the legal content.
2. **Given** an account holder reviews a personal-data operation, **When** the sensitive-data warning is shown, **Then** its text, urgency, and relationship to the action are clear without relying on color alone.
3. **Given** an account data or security operation returns a standalone error, success, or callback message, **When** the state changes, **Then** the message uses a treatment appropriate to its persistence and urgency while retaining its existing announcement timing.
4. **Given** an account holder reviews active security sessions, **When** the current session is displayed, **Then** it is unambiguously identified and the ordered-list meaning remains intact.

---

### User story 3: Receive useful state enhancements without semantic regressions (Priority: P3)

As a keyboard, screen-reader, or pointer user, I receive useful progress, help, empty-state, list, and navigation cues only where they improve clarity without changing the task's established semantics.

**Why this priority**: Candidate enhancements can improve consistency, but applying them indiscriminately could add noise, hide accessible names, or weaken navigation and list structures.

**Independent Test**: Review every candidate surface against its current behavior, exercise it with keyboard and assistive technology, and verify either an improved shared treatment or a documented reason to retain the current one.

**Acceptance Scenarios**:

1. **Given** an action is pending, **When** a progress indicator is shown, **Then** a descriptive pending label remains available and repeated activation is prevented where it is prevented today.
2. **Given** an icon-only theme control offers supplementary help, **When** the help is unavailable or not displayed, **Then** the control still has an independent accessible name.
3. **Given** a terminal account or recovery state has no further in-place actions, **When** it is presented, **Then** the state remains concise, understandable, and navigable without decorative structure overwhelming the message.
4. **Given** account navigation is reviewed for a shared pattern, **When** a pattern is adopted or retained, **Then** URL navigation, current-location identification, keyboard behavior, and responsive semantics are at least as clear as before.
5. **Given** security sessions are rendered as an ordered list, **When** row grouping or separators are reviewed, **Then** added presentation does not introduce misleading list items or reading-order changes.

### Edge Cases

- A validation message appears, changes, or clears while focus remains in its associated field.
- Multiple fields become invalid at once and each field must reference only its own feedback.
- A status message changes from pending to success or error while focus is elsewhere on the page.
- A transient form status is more understandable inline than in a visually boxed callout.
- An action is visually styled as a prominent command but must remain a link because it only navigates.
- A pending action is activated repeatedly before its first result is available.
- A session divider would become an extra item or disrupt the reading order of an ordered list.
- Supplementary hover help is unavailable on touch devices or to a screen-reader user.
- Long English, Spanish, or Catalan text is displayed at a narrow mobile width or under text zoom.
- A notice or status treatment is viewed in either light or dark appearance and cannot rely on color alone.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST maintain an audit record covering every confirmed replacement and review candidate from the source issue, with each item marked as standardized or intentionally retained with a concrete rationale.
- **FR-002**: The sign-up policy consent control MUST use the project's established shared control treatment while preserving checked state, required state, invalid state, keyboard operation, focus visibility, and its relationship to policy content and validation feedback.
- **FR-003**: Sign-in, sign-up, and profile field errors MUST use one consistent field-feedback treatment while preserving field association, invalid-state exposure, live announcements, and reserved layout space.
- **FR-004**: Navigation actions in the account-deleted and sign-up recovery states MUST use the shared action presentation while remaining links with unchanged destinations and navigation behavior.
- **FR-005**: Logout and theme triggers in both navigation contexts MUST be reviewed for shared presentation; a custom treatment MAY remain only when it better preserves trigger state or responsive navigation behavior and the reason is documented.
- **FR-006**: Legal draft notices and the personal-data warning MUST use a consistent callout treatment that preserves message text, urgency, semantic role, and relationship to surrounding content.
- **FR-007**: Standalone callback, error, and success notices in account data and security surfaces and account dialogs MUST be reviewed for the same callout treatment.
- **FR-008**: Transient form status text MUST remain inline when a boxed callout would add visual noise or change announcement timing.
- **FR-009**: Every migrated status message MUST preserve its existing alert or status role, live-announcement priority, atomic announcement behavior, focus target, and announcement timing where those behaviors currently exist.
- **FR-010**: The current security session MUST use the shared status-label treatment and remain distinguishable through text or another non-color cue.
- **FR-011**: Explicit separators in personal-data export and account-deletion sections MUST use the established separator treatment only where section and list semantics remain correct.
- **FR-012**: Security-session row dividers MUST remain presentational boundaries rather than inserted list entries; existing borders MUST be retained when a separate element would weaken ordered-list semantics.
- **FR-013**: Security-session row grouping MUST be evaluated for clearer item and metadata structure, with existing markup retained when the alternative does not improve scanning, semantics, or maintainability.
- **FR-014**: Pending sign-in, sign-up, profile, export, deletion, and session-revocation actions MUST be evaluated for a shared progress indicator while retaining a descriptive pending label and existing activation safeguards.
- **FR-015**: Icon-only theme controls MUST be evaluated for supplementary pointer and keyboard help, but their accessible names MUST remain available independently of that help.
- **FR-016**: Terminal account-deleted, invalid-link, and recovery states MUST be evaluated for a shared empty-state treatment, which MUST be rejected where it obscures the primary message or next action.
- **FR-017**: Account navigation MUST be evaluated against available shared navigation patterns and MUST retain the existing pattern if alternatives reduce clarity of URL navigation, current location, keyboard use, or responsive behavior.
- **FR-018**: The email preview application MUST remain unchanged by this feature; adopting the shared interface system and replacing its inspection-mode and viewport controls MUST be deferred to a separately scoped follow-up.
- **FR-019**: The audit record MUST identify both email preview control groups as deferred and describe the required follow-up scope so they are not mistaken for omissions.
- **FR-020**: Shared application controls MUST NOT be introduced into transactional email markup.
- **FR-021**: Domain-specific forms, panels, dialogs, headers, footers, semantic landmarks, headings, navigation regions, and lists MUST retain their application-specific or semantic structures unless a change is independently justified by user value.
- **FR-022**: Existing user-facing text and supported translations MUST remain intact except for corrections required to preserve meaning or accessibility.
- **FR-023**: Existing keyboard behavior, focus placement and restoration, visible focus, live-region announcements, and accessible names and descriptions MUST remain intact across all changed surfaces.
- **FR-024**: Automated verification MUST cover the affected sign-in, sign-up, profile, security-session, and personal-data export behaviors, including their accessibility states and announcements.
- **FR-025**: Acceptance review MUST cover affected surfaces at mobile and desktop widths in light and dark appearances, including long translated content and visible focus.
- **FR-026**: The refactor MUST NOT change routes, account permissions, operation outcomes, stored user data, or the number of steps required to complete an existing task.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of confirmed replacement surfaces use the established shared interaction treatment or have a documented, evidence-based exception showing that retention better preserves semantics or accessibility.
- **SC-002**: 100% of changed interactive controls remain operable by keyboard and expose an accessible name, role, state, visible focus, and error or descriptive relationship equivalent to or better than the baseline.
- **SC-003**: All affected validation and status messages are announced with the intended urgency and timing, with no duplicate announcement introduced by the refactor.
- **SC-004**: Users can complete every affected sign-in, sign-up, profile, recovery, logout, theme, export, deletion, and session-management task with no additional interaction steps and no new keyboard blocker.
- **SC-005**: All affected surfaces pass acceptance review at representative mobile and desktop widths in both light and dark appearances, across English, Spanish, and Catalan, with no clipping, overlap, missing text, or meaning conveyed by color alone.
- **SC-006**: 100% of candidate surfaces in the main web application have a recorded adopt, retain, or defer decision with a user-experience rationale, and both email preview control groups are recorded as deferred follow-up work.
- **SC-007**: All relevant automated quality checks and critical workflow checks pass without reducing existing coverage of authentication, profile, sessions, or personal-data export behavior.
- **SC-008**: Acceptance review finds no change to transactional email output, account authorization, stored data, public exposure, or deployment behavior.

## Assumptions

- The behavior, content, routes, translations, and visual hierarchy present before this feature form the acceptance baseline.
- The source issue's confirmed replacements are expected to be standardized unless testing demonstrates a concrete semantic or accessibility regression.
- Review candidates may be retained when the current treatment is clearer or more semantic; maximizing shared-component usage is not a success measure.
- The main web application is the complete implementation scope; shared interface adoption in the email preview application will be specified separately.
- English, Spanish, and Catalan remain the supported locales for affected application surfaces.
- Existing server-side validation, authorization, anti-forgery safeguards, and duplicate-action protections remain authoritative and unchanged.
- This feature introduces no new user data, persistence, public endpoint, environment configuration, deployment step, or infrastructure dependency.

## Non-Goals *(mandatory)*

- Replacing domain-specific headers, footers, forms, panels, dialogs, or other application components merely because they are custom components.
- Replacing semantic landmarks, sections, navigation regions, headings, or lists with generic interface containers.
- Introducing shared application controls into transactional email markup.
- Redesigning navigation, account workflows, legal content, or visual identity beyond the consistency changes required by this audit.
- Replacing one established shared treatment with another when it does not reduce duplication or improve behavior.
- Changing routes, business rules, account permissions, operation outcomes, data models, or server behavior.
- Configuring the email preview application or replacing its inspection-mode and viewport controls; that work is deferred to a separately scoped follow-up.
- Treating every transient form status as a boxed callout or every candidate as a mandatory replacement.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: Access rules for account data, security, export, deletion, profile, and session actions remain unchanged and MUST continue to be enforced by the authoritative server-side action. A control's visual state or presence never grants permission.
- **Account lifecycle**: Registration, sign-in eligibility, profile requirements, recovery, and deletion rules do not change. Authentication MUST NOT create an account implicitly as a side effect of this refactor.
- **Authentication provider verification**: Provider boundaries and integration coverage remain unchanged; affected authentication journeys retain their existing integration and end-to-end verification.
- **Data sensitivity**: Profile data, session metadata, export data, and deletion state remain sensitive. The refactor MUST not expose additional values in labels, descriptions, page content, or client-visible state.
- **Input validation**: Existing authoritative validation for consent, credentials, profile fields, exports, deletion, and session revocation remains required. Client-visible invalid states are feedback only and MUST not replace server-side validation.
- **Log hygiene**: No new logging is required. Existing protections against logging credentials, profile data, session identifiers, export contents, or deletion details remain in force.
- **Public exposure**: No new public endpoint or unauthenticated capability is introduced. Existing public legal and authentication pages retain their current exposure and behavior.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: A semantic regression could cause accidental activation of logout, export, deletion, or session revocation; a lost pending state could permit repeated submissions; a hidden or misleading invalid state could cause users to retry sensitive input unnecessarily; and a visual-only permission cue could be mistaken for authorization.
- **Controls**: Preserve confirmation steps, disabled or pending behavior, duplicate-action protection, anti-forgery protection, authoritative server-side validation and authorization, focus restoration, and error handling. Verify both keyboard and pointer activation for privileged actions.
- **Residual risk**: Minor visual differences may remain across shared and intentionally custom treatments. This is acceptable when documented and when semantic behavior, accessibility, authorization, and task completion remain unchanged.