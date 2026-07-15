# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[YYYYMMDD-HHMMSS-feature-name]`

**Created**: [DATE]

**Status**: Draft

**Input**: User description: "$ARGUMENTS"

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.

  Assign priorities (P1, P2, P3, etc.) to each story, where P1 is the most critical.
  Think of each story as a standalone slice of functionality that can be:
  - Developed independently
  - Tested independently
  - Deployed independently
  - Demonstrated to users independently
-->

### User Story 1 - [Brief Title] (Priority: P1)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently - e.g., "Can be fully tested by [specific action] and delivers [specific value]"]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]
2. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 2 - [Brief Title] (Priority: P2)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

### User Story 3 - [Brief Title] (Priority: P3)

[Describe this user journey in plain language]

**Why this priority**: [Explain the value and why it has this priority level]

**Independent Test**: [Describe how this can be tested independently]

**Acceptance Scenarios**:

1. **Given** [initial state], **When** [action], **Then** [expected outcome]

---

[Add more user stories as needed, each with an assigned priority]

### Edge Cases

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right edge cases.
-->

- What happens when [boundary condition]?
- How does system handle [error scenario]?

## Requirements *(mandatory)*

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right functional requirements.
-->

### Functional Requirements

- **FR-001**: System MUST [specific capability, e.g., "allow users to create accounts"]
- **FR-002**: System MUST [specific capability, e.g., "validate email addresses"]
- **FR-003**: Users MUST be able to [key interaction, e.g., "reset their password"]
- **FR-004**: System MUST [data requirement, e.g., "persist user preferences"]
- **FR-005**: System MUST [behavior, e.g., "log all security events"]

*Example of marking unclear requirements:*

- **FR-006**: System MUST authenticate users via [NEEDS CLARIFICATION: auth method not specified - email/password, SSO, OAuth?]
- **FR-007**: System MUST retain user data for [NEEDS CLARIFICATION: retention period not specified]

### Key Entities *(include if feature involves data)*

- **[Entity 1]**: [What it represents, key attributes without implementation]
- **[Entity 2]**: [What it represents, relationships to other entities]

## Success Criteria *(mandatory)*

<!--
  ACTION REQUIRED: Define measurable success criteria.
  These must be technology-agnostic and measurable.
-->

### Measurable Outcomes

- **SC-001**: [Measurable metric, e.g., "Users can complete account creation in under 2 minutes"]
- **SC-002**: [Measurable metric, e.g., "System handles 1000 concurrent users without degradation"]
- **SC-003**: [User satisfaction metric, e.g., "90% of users successfully complete primary task on first attempt"]
- **SC-004**: [Business metric, e.g., "Reduce support tickets related to [X] by 50%"]

## Assumptions

<!--
  ACTION REQUIRED: The content in this section represents placeholders.
  Fill them out with the right assumptions based on reasonable defaults
  chosen when the feature description did not specify certain details.
-->

- [Assumption about target users, e.g., "Users have stable internet connectivity"]
- [Assumption about scope boundaries, e.g., "Mobile support is out of scope for v1"]
- [Assumption about data/environment, e.g., "Existing authentication system will be reused"]
- [Dependency on existing system/service, e.g., "Requires access to the existing user profile API"]

## Non-Goals *(mandatory)*

<!--
  ACTION REQUIRED (Constitution Principle XI): Explicitly list what is intentionally OUT of scope
  for this feature so reviewers and implementers do not assume it.
-->

- [Non-goal, e.g., "This feature does not handle multi-tenant billing"]
- [Non-goal, e.g., "Offline support is out of scope"]

## Security & Privacy Implications *(mandatory)*

<!--
  ACTION REQUIRED (Constitution Principles X & XI): Describe authorization, data sensitivity,
  server-side validation, and any intentional public exposure. Never trust client-provided identity,
  roles, prices, permissions, or ownership.
-->

- **Authentication/Authorization**: [Who may access this? Which server-side checks are required?]
- **Account lifecycle**: [If authentication is in scope, define registration separately, the
  required profile fields, which existing users may sign in, and the behavior for unknown emails.
  Authentication MUST NOT implicitly create an account. Otherwise: N/A.]
- **Authentication provider verification**: [If authentication is enabled, identify the real
  provider boundary and the integration/E2E strategy. The template does not emulate SMTP.
  Otherwise: N/A.]
- **Data sensitivity**: [Any PII, secrets, or regulated data involved? How is it protected?]
- **Input validation**: [Which inputs MUST be validated on the server?]
- **Log hygiene**: [Any secrets/PII that MUST be redacted from logs?]
- **Public exposure**: [Are any endpoints intentionally public? If so, document why.]

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

<!--
  ACTION REQUIRED (Constitution Principle X): Identify realistic misuse before implementation.
  Cover automated abuse, enumeration, privilege escalation, replay/idempotency, resource exhaustion,
  and the trust boundary for proxy/client identity where applicable.
-->

- **Abuse scenarios**: [How could this endpoint or action be automated, replayed, or misused?]
- **Controls**: [Rate limits, authorization, idempotency, quotas, CSRF, validation, or monitoring?]
- **Residual risk**: [What remains possible, and why is that acceptable?]

## Operational Impact *(include if the feature changes deployment, data, or infrastructure)*

<!--
  ACTION REQUIRED (Constitution Principles I, VI, VIII): Note Docker/compose, migration, backup,
  and healthcheck impact so operational readiness is not discovered at deploy time.
-->

- **Deployment changes**: [New containers, env vars, secrets, networks, or volumes?]
- **Data & migrations**: [Schema changes, forward migration plan, compatibility window, backup impact?]
- **Recovery**: [Corrective migration or verified restore procedure if deployment fails?]
- **Observability**: [New healthcheck, structured logs (Pino) / events to emit, or monitoring needs?]
