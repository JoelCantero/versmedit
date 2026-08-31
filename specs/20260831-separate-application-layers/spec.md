# Feature Specification: Separate Application Layers

**Feature Branch**: `20260831-separate-application-layers`

**Created**: 2026-08-31

**Status**: Draft

**Input**: User description: "GitHub issue #61 - Separate transport, domain, and persistence responsibilities without changing public contracts, security controls, or observable behavior"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preserve Account Security Flows (Priority: P1)

As a person activating an account or confirming account deletion, I receive exactly the same outcome as before the refactor so that an internal restructuring cannot disrupt access to my account or weaken its protections.

**Why this priority**: These are security-sensitive account lifecycle flows. Preserving every success, rejection, and failure outcome is the minimum viable result of this refactor.

**Independent Test**: Run the existing signup activation and account deletion verification journeys against pre-change and post-change versions using the same inputs, then compare statuses, payloads, headers, cookies, redirects, timing protections, session effects, and recorded security events.

**Acceptance Scenarios**:

1. **Given** an eligible, delivered, unexpired signup activation token for a valid account, **When** the person follows the activation link, **Then** the account and session reach the same state and the person receives the same response and redirect as before the refactor.
2. **Given** an eligible, delivered, unexpired account deletion token for a valid account, **When** the authorized person follows the verification link, **Then** deletion confirmation and session handling produce the same response, redirect, cookies, and account outcome as before the refactor.
3. **Given** either flow receives a missing token, unknown token, wrong-purpose token, undelivered token, expired token, or token for an invalid user, **When** verification is attempted, **Then** the existing invalid-link outcome is preserved without revealing which validation failed.
4. **Given** the active session conflicts with the account identified by a valid token, **When** verification is attempted, **Then** the existing session-conflict outcome is preserved and no action is applied to the wrong account.
5. **Given** domain verification succeeds but the subsequent session operation fails, **When** the route completes the request, **Then** the existing failure outcome, transaction guarantees, logs, and account state are preserved.

---

### User Story 2 - Keep Responsibilities Independently Verifiable (Priority: P2)

As a maintainer, I can verify account rules without constructing a web request and verify request translation without direct data access so that security decisions have one authoritative home and transport contracts remain easy to audit.

**Why this priority**: Removing duplicated decisions reduces the chance that one route accepts a token or account state another route rejects, while keeping protocol behavior at the application boundary.

**Independent Test**: Exercise each account verification decision through the corresponding domain service, then exercise each route with controlled domain results and confirm that each layer can be tested without assuming the responsibilities of the other.

**Acceptance Scenarios**:

1. **Given** any supported token, user, or session state, **When** the corresponding domain verification operation runs, **Then** it returns a transport-independent result that uniquely represents eligibility, an invalid link, a session conflict, or another defined domain outcome.
2. **Given** a domain result, **When** a product route translates it, **Then** the route alone determines the matching status, payload, headers, cookies, response, redirect, session-provider interaction, and request-scoped logging.
3. **Given** account verification code is reviewed, **When** token and user decisions are traced, **Then** each decision is defined once in its owning domain service rather than duplicated in product routes.
4. **Given** an accepted login or signup request, **When** the anti-enumeration wait completes, **Then** the route constructs the public response while the wait retains the exact pre-change duration and random variation.

---

### User Story 3 - Prevent Boundary Regressions (Priority: P3)

As a maintainer, I receive an automatic failure when a future change crosses an application boundary so that direct persistence access, protocol objects in domain services, and server-only contracts in client-facing modules do not return unnoticed.

**Why this priority**: The refactor will decay without an enforceable rule. A focused automated check protects the architecture after the moved code and its immediate regression tests are in place.

**Independent Test**: Run the architecture check against compliant source and representative prohibited dependency cases. It passes the current source, permits the documented infrastructure exception, and rejects every prohibited boundary crossing without adding a production dependency.

**Acceptance Scenarios**:

1. **Given** a product route directly depends on the persistence client or generated persistence contracts, **When** the architecture check runs, **Then** it fails and identifies the violating route.
2. **Given** a domain service constructs a transport response, **When** the architecture check runs, **Then** it fails and identifies the violating service.
3. **Given** a public module contract or client component depends on persistence-only, domain-service, or server-only code, **When** the architecture check runs, **Then** it fails and identifies the violating module.
4. **Given** the infrastructure health endpoint performs its documented direct persistence check, **When** the architecture check runs, **Then** that explicit exception passes without permitting the same access in product routes.

### Edge Cases

- A token exists but belongs to the other account action; it follows the same non-enumerating invalid-link path as before.
- A token was created but delivery was never confirmed; it remains ineligible and does not reveal delivery state.
- A token expires at the verification boundary; the same authoritative time rule and pre-change outcome apply.
- A token identifies a missing, deleted, disabled, or otherwise ineligible account; no session or account action is completed.
- The caller has no session, the matching session, or a session for another account; each state retains its existing result and provider interaction.
- The same verification link is submitted repeatedly or concurrently; existing replay behavior, transactions, and locks remain unchanged.
- The request has an invalid origin or exceeds a rate limit; rejection occurs at the same boundary and with the same observable contract as before.
- A session operation fails after an eligible result; the route preserves the existing failure translation, account state, and logging behavior.
- An unexpected internal error occurs; sensitive token, account, and session details remain absent from public responses and logs.
- A compliant server-side caller invokes a domain service directly; the architecture rule does not mistake this supported path for a client-side boundary violation.

### Verification Strategy

- Capture the pre-change behavior matrix for signup activation and account deletion verification, including success, every invalid-token class, invalid user, session conflict, and post-verification session failure.
- Test domain verification outcomes independently from transport concerns, including token purpose, delivery, expiry, user eligibility, and session compatibility.
- Test product routes with controlled domain outcomes for origin enforcement, result translation, redirects, response contracts, logging, and authentication-session provider delegation.
- Keep integration coverage for signup and account deletion as the authoritative comparison of observable behavior, including transactions, locks, cookies, and rate limits.
- Verify accepted login and signup responses retain the pre-change minimum delay and random variation while response construction remains a transport responsibility.
- Exercise the architecture check with representative prohibited imports and the one documented infrastructure exception.
- Complete project lint, type checking, and automated tests before the refactor is considered ready.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The change MUST be exclusively structural and MUST preserve all public contracts, security controls, state transitions, and observable behavior of the affected account flows.
- **FR-002**: Product routes MUST remain responsible for request parsing, input and origin validation, authentication-session provider interaction, status codes, payloads, headers, cookies, responses, redirects, and request-scoped logging.
- **FR-003**: Product routes MUST NOT access the persistence client or generated persistence contracts directly; the infrastructure health endpoint MUST remain the sole documented exception.
- **FR-004**: The signup and account deletion domains MUST own the persistence queries and decisions needed to verify token existence, purpose, confirmed delivery, expiry, user eligibility, and session compatibility.
- **FR-005**: Domain verification operations MUST return explicit, discriminated, transport-independent outcomes that distinguish at least eligibility, invalid link, and session conflict where those outcomes apply.
- **FR-006**: Domain services MUST NOT construct or return transport response objects.
- **FR-007**: The anti-enumeration wait for accepted login and signup requests MUST retain exactly its pre-change duration and random variation, while construction of the accepted public response MUST belong to the product route.
- **FR-008**: The refactor MUST introduce zero changes to redirects, statuses, payloads, headers, cookies, rate limits, transaction boundaries, lock behavior, authentication-session provider behavior, logging events, or enumeration resistance.
- **FR-009**: Token and user rules moved into a domain service MUST have one authoritative definition and MUST NOT remain duplicated in product routes.
- **FR-010**: Public data-export contracts consumed outside the server boundary MUST remain independent of persistence-specific transaction types.
- **FR-011**: Persistence-dependent data-export context MUST be private to the server-side export workflow and unavailable to client code.
- **FR-012**: Client components MUST remain independent of domain services, persistence contracts, and server-only modules.
- **FR-013**: An automated architecture check MUST enforce the route, service, public-contract, and client-component boundaries using existing development tooling and MUST add no production dependency.
- **FR-014**: The architecture check MUST identify the violating file and boundary, MUST allow the explicit health-endpoint exception, and MUST not broaden that exception to product behavior.
- **FR-015**: Automated domain coverage MUST include unknown token, wrong token purpose, unconfirmed delivery, expired token, invalid user, session conflict, eligible result, and failure of the subsequent session operation.
- **FR-016**: Automated route coverage MUST verify origin enforcement, domain-result translation, redirects, response contracts, logging, and authentication-session provider delegation without reproducing domain token or user decisions.
- **FR-017**: Existing signup and account deletion integration journeys MUST continue to pass with no observable changes.
- **FR-018**: Existing controls against enumeration, replay, privilege confusion, resource exhaustion, and disclosure of token or account details MUST remain effective at their current boundaries.
- **FR-019**: The completed change MUST pass the project's lint, type-checking, and automated test gates.

### Key Entities

- **Verification Token**: A time-bounded credential for one account action, characterized by identity, purpose, delivery confirmation, expiry, and prior-use state.
- **Account**: The user record affected by activation or deletion verification, including the states that determine whether the requested action remains eligible.
- **Verification Result**: A transport-independent domain outcome representing eligibility, invalid link, session conflict, or another defined failure that the route translates into its existing public contract.
- **Session Context**: The presence and account identity of the caller's current authenticated session, used to prevent an action from being applied under a conflicting identity.
- **Export Context**: Internal server-side state needed to produce a personal-data export, including transaction-scoped access that must not appear in public or client-consumable contracts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the pre-change signup activation and account deletion verification scenarios produce identical statuses, payloads, headers, cookies, redirects, account outcomes, and session outcomes after the refactor.
- **SC-002**: Automated coverage passes for all eight required rule categories: unknown token, wrong purpose, unconfirmed delivery, expiry, invalid user, session conflict, eligibility, and subsequent session-operation failure.
- **SC-003**: The accepted login and signup paths retain 100% of their pre-change anti-enumeration timing configuration, including both base duration and random variation.
- **SC-004**: Automated boundary validation reports zero prohibited dependencies in product routes, domain services, public contracts, and client components, while allowing exactly one documented direct-persistence route exception for infrastructure health.
- **SC-005**: The boundary check rejects 100% of representative violations for each protected boundary and introduces zero production dependencies.
- **SC-006**: Existing signup and account deletion integration suites, project lint, type checking, and the complete automated test suite all finish successfully.
- **SC-007**: Review of the final behavior matrix finds zero changes to rate limits, transaction boundaries, lock behavior, security-event logging, authentication-session provider behavior, enumeration resistance, or replay handling.
- **SC-008**: Maintainers can test 100% of listed domain decisions without constructing a web request and can test 100% of listed route translations without direct persistence access.

## Assumptions

- GitHub issue #61 is the authoritative source for scope, invariants, exclusions, and acceptance criteria.
- Current production behavior and the pre-change automated tests define the baseline whenever this specification says behavior must remain unchanged.
- Existing result names such as eligible, invalid link, and session conflict describe required distinctions; the implementation plan may refine names without merging semantically different outcomes.
- Existing authentication-session provider integration, rate-limit policy, transaction and lock strategy, logging events, and anti-enumeration timing are correct and must be preserved rather than redesigned.
- Existing development tooling can enforce the required dependency boundaries without a new production package.
- This refactor adds no page, localized copy, public endpoint, stored field, deployment component, environment setting, or indexing change.

## Non-Goals *(mandatory)*

- Introducing repository or data-access-object layers, replacing the persistence technology, or creating a generic persistence abstraction.
- Changing the data schema or creating a migration.
- Changing the authentication-session provider integration.
- Removing direct persistence access from the infrastructure health endpoint.
- Preventing server-rendered components from calling server-side domain services directly.
- Creating a generic verification framework shared across unrelated domains.
- Combining this work with the simplification initiative tracked separately in issue #48.
- Changing any account flow, public contract, security policy, user-facing copy, route, or indexing behavior.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: Existing authentication, ownership, origin, and session-conflict checks remain mandatory. Domain eligibility never replaces the route's responsibility to invoke and interpret the existing authentication-session provider.
- **Account lifecycle**: Signup activation and account deletion verification retain their current eligibility rules and state transitions. Authentication continues not to create an account implicitly.
- **Authentication provider verification**: The provider boundary is unchanged. Route and integration tests must continue to exercise the real configured boundary for session creation, termination, and failure behavior.
- **Data sensitivity**: Verification tokens, account identifiers, session identities, and exported personal data remain sensitive. Moving decisions between boundaries must not expose these values to clients or broaden access.
- **Input validation**: Tokens, request origin, and all untrusted request data continue to be validated at the same server-side boundaries before any protected state transition.
- **Log hygiene**: Logs must retain required security and correlation events while continuing to redact tokens, secrets, session material, and personal data.
- **Public exposure**: Existing account verification endpoints remain intentionally public only to support link-based account actions. No new endpoint or broader access is introduced.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: Attackers may automate token guesses, compare timing to enumerate accounts or token states, replay links, use a token for the wrong purpose, act while authenticated as another account, exhaust verification resources, or exploit inconsistent duplicate rules between routes.
- **Controls**: Preserve origin validation, rate limits, purpose and delivery checks, expiry and user eligibility checks, session-conflict handling, uniform invalid-link disclosure, anti-enumeration delay and jitter, transaction and lock behavior, provider-mediated session changes, and redacted structured logging. Centralized domain decisions and automated boundary checks prevent route-specific drift.
- **Residual risk**: Valid links can still be presented repeatedly or near expiry, and timing can vary because of normal system load. Existing replay, locking, expiry, and uniform-response controls define the accepted risk; this structural change must neither increase nor claim to eliminate it.
