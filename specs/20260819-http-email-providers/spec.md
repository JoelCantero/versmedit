# Feature Specification: Transactional Email HTTP Providers

**Feature Branch**: `20260819-http-email-providers`

**Created**: 2026-08-19

**Status**: Draft

**Input**: Replace SMTP/Nodemailer transactional delivery for magic-link login, signup onboarding/activation, and existing-account notices with a configurable HTTP provider boundary supporting Brevo and Mailjet without changing business-flow behavior.

## Clarifications

### Session 2026-08-19

- Q: What delivery-tracking scope must this feature include? → A: Structured logs for outbound HTTP sends only; no webhooks in this feature, and later delivery remains unknown.
- Q: Must the HTTP transport retry a failed send automatically? → A: No; each business operation makes one provider attempt.
- Q: What may activate the public global mail-unavailable state? → A: Only a recipient-independent health check; individual send outcomes never change it.
- Q: What flows must the email feature gate control after migration? → A: Replace `AUTH_EMAIL_ENABLED` with one global `MAIL_ENABLED` gate for all transactional email flows.
- Q: How is each provider API endpoint selected? → A: Derive its fixed official endpoint from `MAIL_PROVIDER`; remove `MAIL_API_BASE_URL` and use internal substitution only in tests.
- Q: Are signup onboarding and account activation separate transactional messages? → A: No; the existing onboarding email contains the activation link, so the feature preserves three message types: magic-link login, signup onboarding/activation, and existing-account notice.

## User Scenarios & Testing *(mandatory)*

### User story 1: Send transactional email through the selected provider (Priority: P1)

As a person using login or signup, I receive the same localized transactional email as today while the application sends it through the configured HTTP provider.

**Why this priority**: Login, account activation, and existing-account notices depend on reliable email delivery; replacing their transport without changing their behavior is the core value of this feature.

**Independent Test**: Run login and signup against a controlled HTTP server for each supported provider and verify the provider request, localized sender and content, normalized result, and existing token lifecycle.

**Acceptance Scenarios**:

1. **Given** Brevo is selected and `MAIL_ENABLED` is true, **When** an existing user requests a magic link, **Then** the localized message is submitted to Brevo's transactional endpoint with the verified sender, project name, text content, HTML content, and no SMTP connection.
2. **Given** Mailjet is selected and `MAIL_ENABLED` is true, **When** a new visitor starts signup, **Then** the localized onboarding message is submitted to Mailjet's transactional endpoint with the verified sender, project name, text content, HTML content, and no SMTP connection.
3. **Given** either supported provider, **When** signup targets an active account, **Then** the existing-account notice uses the same provider boundary and contains no login or signup credential.
4. **Given** an accepted provider response without a message identifier, **When** the send completes, **Then** the result remains accepted and records a null message identifier rather than inventing one.

---

### User story 2: Change providers through configuration (Priority: P1)

As an operator, I can select Brevo or Mailjet through deployment configuration without modifying login, signup, or message-composition behavior.

**Why this priority**: Provider portability is the reason for introducing a common boundary and prevents business flows from becoming coupled to one vendor.

**Independent Test**: Start the same application artifact once with Brevo configuration and once with Mailjet configuration, send the same conceptual message, and verify that only the provider-specific transport contract changes.

**Acceptance Scenarios**:

1. **Given** complete Brevo configuration, **When** the application validates email settings, **Then** Brevo and its official transactional endpoint are selected and no Mailjet-only secret is required.
2. **Given** complete Mailjet configuration, **When** the application validates email settings, **Then** Mailjet and its official transactional endpoint are selected and both its API key and API secret are required.
3. **Given** an unsupported provider, missing required credential, or invalid sender address, **When** email configuration is validated, **Then** the configuration is rejected before any delivery attempt and no secret is exposed.
4. **Given** only `MAIL_PROVIDER` changes between two complete configurations, **When** the application restarts, **Then** login and signup use the newly selected provider without business-code changes or SMTP fallback.
5. **Given** `MAIL_ENABLED` is false, **When** a visitor attempts magic-link login or signup, **Then** no account lookup, account mutation, token issuance, or provider request occurs.
6. **Given** `MAIL_ENABLED` is true, **When** the application starts, **Then** complete valid configuration for the selected provider is required before login, signup, activation email, or existing-account notices are available.

---

### User story 3: Preserve private authentication outcomes during failures (Priority: P1)

As a login or signup visitor, I receive the same account-private public outcome and token protections regardless of provider acceptance, rejection, timeout, or isolated network failure.

**Why this priority**: A transport migration must not weaken anti-enumeration, account lifecycle, magic-link security, or the established response timing contract.

**Independent Test**: Compare known and unknown login requests and new, pending, and active-account signup requests while simulating provider acceptance, rejection, rate limiting, timeout, and network errors.

**Acceptance Scenarios**:

1. **Given** a known and an unknown valid login email, **When** either provider accepts, rejects, or times out on the known-address delivery attempt, **Then** both requests retain the same established public status, structure, content, redirect behavior, and response floor.
2. **Given** a new login token was issued and its isolated send fails, **When** the request completes, **Then** the token and every token it superseded are invalid, while the generic accepted public outcome is preserved.
3. **Given** a signup onboarding send fails in isolation, **When** the request completes, **Then** the new onboarding token is invalid, the reusable pending account remains inactive, no superseded token is restored, and the generic accepted public outcome is preserved.
4. **Given** an unknown login email, **When** any provider outcome occurs, **Then** no user, account, profile, email record, or verification token is created or modified.
5. **Given** a recipient-independent health check has marked the selected provider unavailable, **When** valid login or signup requests are evaluated, **Then** the existing generic unavailable outcome remains identical across account states and no account lookup or send occurs.
6. **Given** a provider rejection, rate limit, timeout, or network failure, **When** the send attempt ends, **Then** the application applies the established token and public-response rules without retrying the provider request automatically.
7. **Given** an individual provider request fails for any recipient, **When** its result is classified, **Then** it does not activate, extend, or otherwise alter the shared public provider-unavailable state.

---

### User story 4: Diagnose provider submission outcomes safely (Priority: P2)

As an operator, I can distinguish provider request acceptance from normalized request failures without exposing recipients, credentials, links, or message content.

**Why this priority**: HTTP providers return useful submission metadata, but operational visibility must not falsely claim delivery or leak authentication material and personal data.

**Independent Test**: Exercise provider responses and network failures, then inspect structured events to verify normalized categories, message identifiers when available, acceptance semantics, and redaction.

**Acceptance Scenarios**:

1. **Given** a provider accepts a send request, **When** the response is recorded, **Then** the event says only that submission was accepted and does not claim delivery.
2. **Given** a provider rejects a request, rate limits it, is unavailable, or returns an invalid response, **When** the response is recorded, **Then** only the normalized safe failure category and allowlisted technical metadata are logged.
3. **Given** a send fails after the provider may have received it, **When** the outcome is recorded, **Then** the application does not claim acceptance or delivery and treats the later delivery state as unknown.
4. **Given** a provider accepted a request, **When** no subsequent evidence is available, **Then** the application keeps the delivery state unknown and neither exposes a provider webhook endpoint nor persists delivery history.

---

### User story 5: Complete a staged smtp retirement (Priority: P2)

As an operator and maintainer, I can deploy, verify, and complete the HTTP migration without an undocumented fallback or a period in which production email has no recoverable path.

**Why this priority**: Removing SMTP credentials and dependencies too early risks authentication outages, while retaining them indefinitely leaves unnecessary secrets and code.

**Independent Test**: Deploy the HTTP path while legacy SMTP configuration remains available but unused, verify controlled login and signup delivery in development and production, then verify that the completed application starts and passes all checks without Nodemailer or SMTP variables.

**Acceptance Scenarios**:

1. **Given** the migration has not completed production verification, **When** the HTTP version is deployed, **Then** existing SMTP values may remain provisioned for rollback compatibility but are neither read nor used as a fallback by the new flow.
2. **Given** development and production verification of the active HTTP provider succeeds and no flow uses SMTP, **When** migration cleanup completes, **Then** Nodemailer, its type package, SMTP configuration, and SMTP deployment wiring are removed.
3. **Given** the selected provider is unavailable after migration, **When** a send is attempted, **Then** the request follows the normalized failure and existing domain rules rather than silently switching to SMTP or another provider.

### Edge Cases

- `MAIL_PROVIDER` is empty, has unexpected casing, or names a provider other than `brevo` or `mailjet`.
- `MAIL_ENABLED` is absent, false, or invalid while provider credentials are present; credentials alone must not enable any email flow.
- `MAIL_API_KEY` is missing; Mailjet's `MAIL_API_SECRET` is missing; or a Brevo deployment unnecessarily supplies a Mailjet secret.
- `MAIL_FROM` is missing, malformed, or not verified by the selected provider; `PROJECT_NAME` is missing or unsuitable as a sender display name.
- Runtime configuration or request data attempts to override a provider endpoint; the application honors no alternate destination because it defines and reads no endpoint override setting.
- A provider returns 200, 201, 202, or another successful response with a missing, empty, duplicated, or malformed message identifier.
- A provider returns 400, 401, 403, 409, 429, an unmapped 4xx response, a 5xx response, malformed JSON, an unexpected content type, or a body too large to retain safely.
- The single request attempt times out or fails because of DNS, TLS, connection reset, or another network error after the provider may already have accepted it; no automatic retry is made.
- A message has text but no HTML, HTML but no text, an empty subject, an unsupported locale, or content containing a full magic-link URL.
- Switching providers leaves accepted messages in flight at the previous provider; the application receives no follow-up events and their final delivery state remains unknown.
- Provider acceptance is followed externally by delivery, bounce, block, complaint, or no follow-up event; the application still records only acceptance and must not invent a later state.
- A recipient-independent health check changes the shared provider-health state while a login or signup request is in progress; the state checked before account lookup governs that request.
- An individual timeout, DNS failure, TLS failure, connection failure, rate limit, or 5xx response occurs while the shared provider-health state is available; it must not open a public outage window.
- A migration rollback occurs before SMTP cleanup versus after the obsolete dependency and variables have been removed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Magic-link login, signup onboarding/activation, and existing-account notices MUST send through one common server-side transactional-email boundary.
- **FR-002**: The common boundary MUST provide capabilities equivalent to sending a transactional message, validating the selected provider configuration, and classifying provider failures into the normalized result contract.
- **FR-003**: Login, signup, account lifecycle, localization, and message-composition logic MUST depend only on the common boundary and MUST NOT contain Brevo- or Mailjet-specific decisions.
- **FR-004**: `MAIL_PROVIDER` MUST select exactly one initially supported value, `brevo` or `mailjet`; any absent or unsupported value MUST fail closed when `MAIL_ENABLED` is true.
- **FR-005**: `MAIL_API_KEY` MUST be required as a server-only secret for either supported provider and MUST never be exposed to client code or public responses.
- **FR-006**: `MAIL_API_SECRET` MUST be required as an additional server-only secret only when Mailjet is selected; Brevo MUST NOT require it.
- **FR-007**: `MAIL_FROM` MUST be required, server-validated as an email address, and documented as a sender that must be verified with the selected provider.
- **FR-008**: The sender display name MUST come from the existing `PROJECT_NAME`; the feature MUST NOT add or read a `MAIL_FROM_NAME` setting.
- **FR-009**: `MAIL_PROVIDER` MUST map `brevo` and `mailjet` exclusively to their fixed official transactional endpoints. The application MUST NOT define, read, or honor `MAIL_API_BASE_URL` or any runtime endpoint override; controlled tests MUST substitute the HTTP destination only through an internal test boundary unavailable to production configuration and requests.
- **FR-010**: `AUTH_EMAIL_ENABLED` MUST be removed and replaced by `MAIL_ENABLED`, a single explicit boolean global gate for magic-link login, signup onboarding/activation, and existing-account notices; configuring provider credentials alone MUST NOT enable any email flow, and any value other than true, false, or absence MUST fail startup validation.
- **FR-010a**: When `MAIL_ENABLED` is false or absent, every email-dependent public action MUST stop before account lookup, account mutation, token issuance, or provider request and expose only the established account-independent unavailable behavior.
- **FR-011**: When `MAIL_ENABLED` is true, complete valid configuration for the selected provider MUST be validated at application startup before any email-dependent flow becomes available; invalid configuration MUST fail startup with a clear redacted operational error.
- **FR-012**: A transactional message input MUST include recipient, subject, plain-text content, and HTML content, and MUST preserve the established English, Spanish, or Catalan locale selected by the invoking flow.
- **FR-013**: Brevo sends MUST use `POST https://api.brevo.com/v3/smtp/email` by default, authenticate with `api-key: MAIL_API_KEY`, use JSON content, and map sender email, `PROJECT_NAME`, recipient, subject, text, and HTML to Brevo's transactional message fields.
- **FR-014**: Brevo magic links, signup emails, and notices MUST NOT use `/v3/emailCampaigns` or any marketing-campaign endpoint.
- **FR-015**: Mailjet sends MUST use `POST https://api.mailjet.com/v3.1/send` by default, authenticate with HTTP Basic using `MAIL_API_KEY` and `MAIL_API_SECRET`, and map sender email, `PROJECT_NAME`, recipient, subject, text, and HTML to one transactional message.
- **FR-016**: Provider credentials MUST appear only in the provider-required authentication header and MUST NOT be placed in a URL, query string, payload, returned result, error text, or structured log.
- **FR-017**: Every send MUST return only `accepted`, `providerMessageId`, `provider`, and `category`, where `accepted` is boolean; `providerMessageId` is a string or null; `provider` is `brevo` or `mailjet`; and `category` is `accepted`, `authentication`, `rate_limited`, `recipient_rejected`, `provider_unavailable`, `invalid_request`, or `unknown`.
- **FR-018**: A valid 2xx provider response MUST normalize to `accepted: true` and category `accepted`; its provider message identifier MUST be retained when present and otherwise be null.
- **FR-019**: Provider 401 and 403 responses MUST normalize to `authentication` without exposing credentials or raw authorization data.
- **FR-020**: Provider 429 responses MUST normalize to `rate_limited`; a safe retry interval MAY be retained for internal control but MUST NOT change established account-private public responses.
- **FR-021**: A provider response that explicitly and reliably rejects the destination MUST normalize to `recipient_rejected`; the raw recipient and provider rejection body MUST NOT be returned publicly or logged.
- **FR-022**: Provider 400 and 409 responses MUST normalize according to documented provider semantics, defaulting to `invalid_request` when no reliable recipient-specific classification exists.
- **FR-023**: Provider 5xx responses, timeouts, DNS failures, TLS failures, and other connection failures MUST normalize to `provider_unavailable` unless the provider gives reliable evidence for a more specific safe category.
- **FR-024**: Unmapped statuses, malformed responses, contradictory provider fields, and failures that cannot be classified reliably MUST normalize to `unknown` and MUST NOT be represented as accepted or delivered.
- **FR-025**: Error classification MUST be deterministic for the same provider response or network failure and MUST preserve only safe technical metadata needed by the calling domain rule.
- **FR-026**: The transport MUST apply a bounded request timeout and MUST handle an indeterminate post-send network failure without claiming either provider acceptance or delivery.
- **FR-026a**: Each business email operation MUST make at most one outbound provider request. A rejection, rate limit, 5xx response, timeout, DNS failure, TLS failure, connection failure, or indeterminate outcome MUST NOT trigger an automatic retry within the request or through background work; recovery requires a new domain request subject to the existing limits and token lifecycle. Provider failover and SMTP fallback are governed separately by FR-043.
- **FR-027**: Provider-specific response bodies and authentication headers MUST remain inside the trusted provider boundary; business flows receive only the normalized result.
- **FR-028**: Sender, subject, plain text, HTML, and locale behavior MUST remain equivalent to the three existing transactional messages: magic-link login, signup onboarding/activation, and existing-account notice.
- **FR-029**: Known and unknown valid login requests MUST retain the same established public status, response structure, content, redirect behavior, and request-start-relative floor of 500 ms plus bounded 0-100 ms jitter across all provider outcomes.
- **FR-030**: New, pending, and active-account signup requests MUST retain the same established public accepted status, structure, content, navigation behavior, and response floor across isolated provider outcomes.
- **FR-031**: Only a recipient-independent health check that performs no account lookup and uses no recipient address MAY activate, extend, or clear the shared provider-health state and thereby produce the existing public mail-service-unavailable outcome.
- **FR-031a**: The shared provider-health state MUST be checked before account lookup, token issuance, account mutation, or email sending. The result of that check governs the current request even if health changes concurrently.
- **FR-031b**: Individual send outcomes, including authentication, rate-limit, recipient-rejection, invalid-request, provider-unavailable, and unknown categories, MUST NOT activate, extend, clear, or otherwise mutate the shared provider-health state; isolated failures retain the established generic accepted public outcome.
- **FR-032**: An isolated magic-link send failure MUST immediately invalidate the newly issued login token, leave every superseded token invalid, and MUST NOT expose the delivery result or account existence.
- **FR-033**: An isolated onboarding send failure MUST immediately invalidate the new onboarding token, retain the pending account as inactive and reusable, leave superseded tokens invalid, and preserve the generic public outcome.
- **FR-034**: A failed existing-account signup notice MUST create no credential, account change, or session and MUST preserve the generic public signup outcome.
- **FR-035**: Unknown-email login MUST continue to create or modify no user, account, profile, email record, verification token, or other lifecycle data under any provider outcome.
- **FR-036**: Magic links MUST retain their existing 15-minute expiry, newest-link-only behavior, single-use enforcement, canonical-origin restriction, locale preservation, and callback protections.
- **FR-037**: The provider boundary MUST NOT weaken existing shared request limits, anti-forgery checks, trusted-client identity rules, account-state checks, or atomic token and activation behavior.
- **FR-038**: Structured send events MAY contain provider, normalized category, acceptance flag, provider message identifier when available, safe status class, duration, and a non-personal correlation identifier.
- **FR-039**: Logs MUST NOT contain API keys, API secrets, authorization headers, recipients, names, account identifiers, tokens, full magic-link or onboarding URLs, subjects, text, HTML, raw provider bodies, or other message content.
- **FR-040**: Provider request acceptance MUST be recorded distinctly from confirmed delivery, and neither a 2xx response nor a provider message identifier MAY be described as delivery.
- **FR-041**: Delivery tracking for this feature MUST use option A, structured operational logs only; delivery status MUST NOT be persisted as product data or exposed in an administrative view.
- **FR-042**: This feature MUST NOT expose or process provider webhooks; after provider acceptance, delivery, deferral, bounce, block, complaint, unsubscribe, and absence of follow-up evidence MUST remain unknown to the application.
- **FR-043**: The application MUST NOT implement a silent SMTP fallback, automatic provider failover, or client-selected provider.
- **FR-044**: Existing tests that mock or assert SMTP/Nodemailer behavior MUST be replaced with provider-boundary or controlled HTTP assertions while retaining their domain-security coverage.
- **FR-045**: `.env.example`, operational documentation, Docker Compose definitions, and GitHub Actions deployment configuration MUST describe and inject the HTTP provider settings consistently without committing real credentials.
- **FR-046**: Production MUST store `MAIL_API_KEY` and Mailjet-only `MAIL_API_SECRET` as GitHub Repository Secrets; `MAIL_ENABLED`, `MAIL_PROVIDER`, `MAIL_FROM`, and the existing `PROJECT_NAME` MUST be GitHub Repository Variables. `MAIL_FROM_NAME` MUST NOT be introduced.
- **FR-047**: Legacy SMTP variables MAY remain provisioned during the development and production verification window for rollback compatibility, but the HTTP-enabled application MUST NOT read or use them.
- **FR-048**: Nodemailer, `@types/nodemailer`, SMTP-specific code, SMTP documentation, and SMTP deployment variables MUST be removed once controlled development and production verification confirms no transactional flow uses SMTP.
- **FR-049**: The completed migration MUST start and run login and signup with the selected HTTP provider while no SMTP variable is present.
- **FR-050**: Migration verification MUST prove the active production provider through controlled login and signup sends before obsolete SMTP secrets are deleted; secret values MUST never appear in deployment output.

### Verification Requirements

- **VR-001**: Unit tests MUST cover valid Brevo selection, valid Mailjet selection, unsupported providers, absent provider settings, absent `MAIL_API_KEY`, absent Mailjet `MAIL_API_SECRET`, absent or invalid `MAIL_FROM`, valid and invalid `MAIL_ENABLED`, and credentials present while the global gate is false.
- **VR-001a**: Integration tests MUST prove that `MAIL_ENABLED=false` prevents account lookup, account mutation, token issuance, and provider requests for login and signup, while `MAIL_ENABLED=true` requires complete provider configuration at startup.
- **VR-002**: Unit tests MUST verify the complete Brevo request method, default endpoint, headers, sender, recipient, subject, text, and HTML, and MUST prove that no campaign endpoint is used.
- **VR-003**: Unit tests MUST verify the complete Mailjet request method, default endpoint, Basic authentication contract, sender, recipient, subject, text, and HTML without exposing either credential in snapshots, assertion failures, or logs.
- **VR-003a**: Configuration and contract tests MUST prove that each `MAIL_PROVIDER` value selects only its official endpoint, that `MAIL_API_BASE_URL` is neither defined nor read, and that fake-server substitution is reachable only through the internal test boundary.
- **VR-004**: Unit tests MUST cover representative 2xx responses; 400, 401, 403, 409, 429, and 5xx responses; timeouts; DNS, TLS, and other network failures; malformed bodies; absent message identifiers; and deterministic normalized classification for both providers.
- **VR-004a**: Unit and integration tests MUST assert exactly one captured provider request for every rejection, rate limit, 5xx response, timeout, DNS failure, TLS failure, connection failure, and indeterminate outcome.
- **VR-005**: Unit tests MUST inspect captured logs and public errors to prove that recipients, names, tokens, full URLs, message content, provider response bodies, API credentials, and authentication headers are absent.
- **VR-006**: Integration tests MUST use a controlled fake HTTP server to exercise login and signup with simulated Brevo and simulated Mailjet without making external network calls.
- **VR-007**: Integration tests MUST cover provider acceptance, rejection, rate limiting, timeout, and indeterminate network failure for login, signup onboarding, and existing-account notices where each outcome is relevant.
- **VR-008**: Integration comparisons MUST prove that existing and unknown login requests retain identical public anti-enumeration behavior and that new, pending, and active-account signup requests retain their established uniform public behavior across isolated provider outcomes.
- **VR-008a**: Integration tests MUST prove that only a recipient-independent health check can change shared provider availability; every individual send category leaves it unchanged, and an unavailable preflight result prevents account lookup, token issuance, account mutation, and provider requests equally across account states.
- **VR-009**: Integration tests MUST prove that failed delivery invalidates newly issued login and onboarding tokens according to current rules, never restores superseded tokens, retains reusable pending accounts only where currently allowed, and creates or changes no email, user, account, profile, or token for unknown-email login.
- **VR-010**: Contract tests MUST cover Brevo and Mailjet request shapes, authentication expectations, response and error mappings, nullable provider message identifiers, and the ability to add a future provider without changing business-flow contracts.
- **VR-011**: Automated route verification MUST prove that no Brevo or Mailjet webhook endpoint is exposed and that no delivery-status product record or administrative delivery view is introduced.
- **VR-012**: Locale tests MUST verify correct sender, subject, text, HTML, links, and equivalent meaning for English, Spanish, and Catalan across every transactional message type.
- **VR-013**: Migration tests MUST prove the HTTP path reads no SMTP setting, invokes no SMTP transport, and does not fall back when the selected provider fails.
- **VR-014**: Dependency and configuration checks MUST prove that Nodemailer, `@types/nodemailer`, and obsolete SMTP wiring are absent after the production verification gate is completed.
- **VR-015**: The complete change MUST pass the repository's lint, typecheck, automated test, coverage, end-to-end, production dependency audit, production build, and Docker build gates.

### Key Entities

- **Transactional Email**: A server-originated message with one recipient, verified sender, project display name, locale, subject, plain text, and HTML; it may contain a confidential login or onboarding link.
- **Provider Configuration**: Server-only runtime selection and credentials for one active provider, including the verified sender; the provider value determines a fixed official endpoint and the configuration contains no endpoint override.
- **Normalized Send Result**: The safe outcome returned to business flows, containing only acceptance, nullable provider message identifier, provider, and normalized category.
- **Provider Message Identifier**: An optional technical identifier returned by a provider and usable for safe submission correlation; its presence proves neither recipient identity nor delivery, and no later provider event is consumed in this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In controlled integration verification, 100% of login, onboarding, and existing-account notice cases pass with Brevo and with Mailjet using only HTTP delivery.
- **SC-002**: In configuration verification, switching between the two complete provider configurations requires zero business-code changes and produces zero SMTP connection attempts.
- **SC-002a**: With `MAIL_ENABLED=false`, 100% of login and signup email actions produce 0 account lookups, 0 account mutations, 0 tokens, and 0 provider requests; with it true, 100% of incomplete provider configurations fail startup before serving email-dependent flows.
- **SC-003**: Across all supported messages and locales, 100% of captured provider requests contain the expected verified sender, `PROJECT_NAME`, recipient, subject, plain text, and HTML.
- **SC-004**: In matched automated comparisons, 100% of known/unknown login pairs and new/pending/active signup groups retain their established equal public status, structure, content, navigation behavior, and response floor during isolated provider outcomes.
- **SC-005**: In failure verification, 0 failed login or onboarding sends leave a newly issued or superseded token valid, and 0 unknown-email login requests create or modify product data.
- **SC-005a**: Across all individual-send failure tests, 0 outcomes change shared provider availability; across unavailable-health preflight tests, 100% of login and signup requests stop before account lookup or mutation with account-independent public behavior.
- **SC-006**: Every required provider response and network condition maps to one allowed category in 100% of contract cases; no accepted response without a message identifier receives an invented identifier.
- **SC-006a**: In automated failure verification, 100% of business email operations produce at most one provider request and 0 automatic retries or alternate-transport attempts.
- **SC-007**: Automated log inspection finds 0 API credentials, authorization headers, recipients, names, account identifiers, tokens, full authentication URLs, subjects, bodies, or raw provider payloads.
- **SC-008**: Automated route and data-model verification finds 0 provider webhook endpoints, 0 persisted delivery-status records, and 0 administrative delivery views introduced by this feature.
- **SC-009**: Across all send records, 0 provider-accepted requests are labeled delivered; their later delivery state remains unknown.
- **SC-010**: In the CI integration environment with an immediate-accept controlled provider, pre-warmed application and provider-health state, and fresh request data, run two unmeasured warm-ups followed by 20 sequential measured requests for each login/signup and Brevo/Mailjet combination. At least 19 of 20 measured requests in every combination MUST complete in under 5 seconds, every accepted valid-email response MUST take at least 500 ms from request start, and no measured request may be retried, discarded, or excluded as an outlier.
- **SC-011**: The completed application starts and all email flows pass with 0 SMTP variables, 0 Nodemailer runtime or type dependencies, and 0 SMTP fallback paths.
- **SC-012**: Lint, typecheck, automated tests, configured coverage, end-to-end checks, production dependency audit, production build, and Docker build all complete successfully before release.

## Assumptions

- Existing login and signup public contracts, rate limits, token storage, account lifecycle, canonical-origin validation, locale routing, and message copy remain authoritative except for the delivery transport. Shared provider health is narrowed by this feature so only recipient-independent checks may change it.
- The new global `MAIL_ENABLED` gate intentionally replaces the login-only `AUTH_EMAIL_ENABLED` setting and controls all transactional email-dependent flows uniformly.
- The explicit requirement to derive the sender display name from `PROJECT_NAME` overrides the later configuration list that mentions `MAIL_FROM_NAME`; no new sender-name variable is created.
- Brevo and Mailjet accounts, verified senders, and API credentials are available to operators; provider dashboard setup is documented but not automated by the application.
- Provider endpoints are fixed by `MAIL_PROVIDER`; controlled fake-server tests replace the HTTP destination through an internal test boundary that production configuration and public requests cannot access.
- Option A, structured outbound-send logs only, is sufficient because the product currently has no user or administrator workflow that queries delivery history. Webhooks, persisted status, and an admin view would add public-ingress, authentication, idempotency, retention, privacy, authorization, and migration scope without current user value.
- Controlled integration tests use a local fake HTTP server; a redacted smoke verification with the selected real provider is performed in development and production before SMTP cleanup.
- Removal of SMTP configuration is a staged completion gate within this feature: legacy values remain only long enough to permit rollback during verification and are removed after the HTTP path is proven.

## Non-Goals *(mandatory)*

- Marketing campaigns, campaign endpoints, contact lists, audience management, or marketing automation.
- Provider-managed message templates or a provider-template administration interface.
- User-account migration or changes to login, signup, activation, session, token-expiry, single-use, locale, request-limit, or anti-enumeration semantics.
- Password authentication, social sign-in, or another identity method.
- Automatic failover between providers, load balancing, client-selected providers, or silent SMTP fallback.
- Automatic retries, delayed retry queues, or background delivery workers for failed or indeterminate sends.
- Separate enablement flags for login, signup, activation, or notice emails.
- Supporting providers other than Brevo and Mailjet in the initial release, although the common contract must permit future additions.
- Persisting recipient delivery history, presenting delivery status to end users, or creating an authenticated administrative delivery view.
- Treating provider request acceptance as proof of inbox placement or guaranteeing that a recipient reads a message.
- Provider webhooks, delivery-event normalization, persisted delivery history, and an administrative delivery view.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: Only trusted server-side login, signup, and account-lifecycle processes may request a transactional send. Existing public authentication endpoints retain their current controls. This feature adds no provider callback endpoint or new public authority.
- **Account lifecycle**: Login remains existing-user-only and never creates an account for an unknown email. Signup remains the only explicit registration path. Provider outcomes cannot activate an account, establish a session, or override current token invalidation and pending-account rules.
- **Authentication provider verification**: Controlled HTTP integration tests cross the real provider boundary shape for both Brevo and Mailjet, and a redacted real-provider smoke check is required before production SMTP cleanup.
- **Data sensitivity**: Recipients and names are personal data. API credentials, magic-link and onboarding tokens, full verification URLs, session material, message bodies, and authorization headers are confidential. They remain server-side and are excluded from results and logs.
- **Input validation**: Provider selection, required credentials, sender, project display name, transactional message fields, provider responses, identifiers, and payload bounds require trusted server-side validation. Provider response fields remain untrusted until their expected shape is validated, and no request or runtime setting may supply an endpoint.
- **Log hygiene**: Logs contain only allowlisted technical metadata. Raw requests, responses, headers, bodies, recipients, subjects, URLs, tokens, names, account identifiers, and secrets are never logged, including in exceptions, test snapshots, and deployment output.
- **Public exposure**: Login and signup remain intentionally public and anti-enumerating. This feature adds no new public endpoint.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: Attackers may probe account existence through provider-dependent status or timing, trigger email flooding, force repeated provider costs, attempt to redirect provider credentials to another endpoint, steal credentials from logs or client bundles, submit oversized or malicious provider responses, or spoof acceptance with a malformed provider response.
- **Controls**: Preserve uniform public outcomes, response floors, shared request limits, anti-forgery protection, trusted client identity, and server-only account lookup; decide shared outage state only from a recipient-independent preflight before account lookup and never from an individual send; map providers only to fixed official endpoints with no runtime override; bound timeouts and payload sizes; validate provider responses; and isolate and redact provider details.
- **Residual risk**: Distributed requesters may still evade per-client limits, a valid provider credential may be compromised, and providers may accept a request that is later lost, bounced, blocked, or complained about without the application learning that outcome. These risks are accepted because account-private outcomes and token rules remain intact, credentials are independently rotatable, and unknown delivery is represented honestly.

## Operational Impact

- **Deployment changes**: No new container, worker, queue, network, volume, public endpoint, or configurable provider URL is required. Runtime and deployment wiring replace `AUTH_EMAIL_ENABLED` with global `MAIL_ENABLED` and add `MAIL_PROVIDER`, `MAIL_API_KEY`, `MAIL_FROM`, and optional `MAIL_API_SECRET`; the existing `PROJECT_NAME` supplies the sender name. Production uses Repository Secrets for sensitive values and Repository Variables for non-sensitive values.
- **Data & migrations**: Option A stores no delivery status and requires no product-schema migration. Existing account, token, and rate-limit data remain unchanged.
- **Recovery**: During verification, rollback may use the previously deployed SMTP-capable release because legacy SMTP values remain provisioned but unused by the HTTP release. After HTTP verification and SMTP cleanup, provider incidents follow the established unavailable/isolated-failure behavior; recovery uses credential rotation, provider configuration correction, or a compatible application fix, never silent fallback. No data rollback is required.
- **Observability**: Structured events distinguish send acceptance, normalized request failure, indeterminate state, and recipient-independent health transitions. Events retain a provider message identifier only when supplied and safe, use non-personal correlation, and never claim delivery from the send response alone. Delivery after acceptance remains unknown. Alerts may aggregate authentication failures, rate limits, provider-unavailable send outcomes, and independent health failures without recipient data; send outcomes never drive the public health state.
