# Feature Specification: Unified Branded Transactional Emails

**Feature Branch**: `20260824-branded-transactional-emails`

**Created**: 2026-08-24

**Status**: Draft

**Input**: User description: "GitHub issue #47 - Add unified branded transactional email templates and local previews"

## Clarifications

### Session 2026-08-25

- Q: Which future-only messages should show a primary action button and matching plain-text link? → A: Personal-data-export ready, email change requested, security alert, and generic confirmation; account deleted and email changed remain informational.
- Q: May the six operational messages be rewritten for a consistent voice, or must their current localized wording remain unchanged? → A: Rewrites are allowed in each locale provided they preserve the existing meaning, next action, and security-relevant information.
- Q: Which email-client compatibility level must every template pass before release? → A: Every template must remain readable and actionable in the current stable Gmail web and mobile clients, Apple Mail and iOS Mail, Outlook web, and classic Outlook desktop; pixel-identical rendering is not required.
- Q: When transactional email is enabled but branding is invalid, how should startup behave? → A: The entire application must fail startup before serving requests.
- Q: How much custom content may the preview-only generic confirmation template accept? → A: It uses fixed catalogue-owned localized copy and accepts only predefined structured display values and a fictional action destination.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Receive Consistent Transactional Messages (Priority: P1)

As a recipient, I receive a recognizable, localized transactional message with a clear purpose and action so that I can complete the intended account task safely.

**Why this priority**: The six existing messages support authentication and sensitive account actions. Their purpose, credential protections, and delivery behavior must remain intact while their presentation becomes consistent.

**Independent Test**: Trigger each existing email flow in English, Spanish, and Catalan and verify that the resulting message is branded, complete, localized, and behaviorally equivalent to the current message.

**Acceptance Scenarios**:

1. **Given** any of the six existing business events, **When** its message is prepared, **Then** the recipient receives a non-empty localized subject, a complete branded HTML message, and an equivalent plain-text alternative.
2. **Given** an existing message that carries an account-action credential, **When** it is rendered, **Then** it contains one clear business-action destination with the same purpose, destination, scope, and expiry semantics as before.
3. **Given** an active account receives the existing-account signup notice, **When** the notice is rendered, **Then** it may offer the canonical locale-preserving login destination but contains no activation, verification, token, or other credential-bearing destination.
4. **Given** any supported locale, **When** a message is rendered, **Then** its subject, preview text, body, action label, support details, and legal links use only that locale without fallback copy from another language.
5. **Given** rendering or delivery fails after a credential has been issued, **When** the owning business flow handles the failure, **Then** no newly issued credential remains usable and no superseded credential is restored.
6. **Given** an operational message is migrated to the shared presentation, **When** its localized wording is revised for a consistent voice, **Then** its essential meaning, required next action, and security-relevant information remain equivalent without requiring the previous wording verbatim.

---

### User Story 2 - Configure One Trusted Email Brand (Priority: P1)

As an operator, I configure one deployment-wide email brand so that every transactional message identifies the same product and provides accurate support and legal information.

**Why this priority**: Shared presentation is only trustworthy when identity, support, legal details, and action colors are complete and valid in every operational message.

**Independent Test**: Validate and render the full catalogue with a complete brand, with no logo, and with representative light and dark brand colors, then verify startup behavior when transactional email is enabled and disabled.

**Acceptance Scenarios**:

1. **Given** transactional email is enabled with complete valid branding, **When** any message is prepared, **Then** it uses the configured product identity, primary color, support address, legal organization, postal address, and optional logo consistently.
2. **Given** no logo is configured, **When** a message is rendered, **Then** the product name provides a complete text-brand fallback with no empty image or broken layout.
3. **Given** a very light or very dark primary color, **When** a primary action is rendered, **Then** its foreground is selected to maintain at least a 4.5:1 contrast ratio.
4. **Given** transactional email is enabled with missing or malformed required branding, **When** application configuration is validated, **Then** the entire application fails startup before serving requests and does not expose supplied values.
5. **Given** transactional email is disabled, **When** the application starts without the additional branding values, **Then** startup succeeds and no email-dependent action becomes available.

---

### User Story 3 - Review Every Message Locally (Priority: P2)

As a developer or reviewer, I can inspect every message variant in every supported language using obviously fictional data so that I can review content and layout without sending email or running a business workflow.

**Why this priority**: A complete review surface reduces localization and layout defects while preventing design work from touching production data, credentials, or providers.

**Independent Test**: Open the local preview without application configuration, authentication, database access, or provider credentials; navigate all 36 combinations and verify that no outbound submission occurs.

**Acceptance Scenarios**:

1. **Given** the local preview experience, **When** a reviewer opens its catalogue, **Then** all 12 variants in English, Spanish, and Catalan are listed and renderable for a total of 36 previews.
2. **Given** no application environment, database, authenticated session, or provider credential, **When** the preview is opened and navigated, **Then** every combination remains available.
3. **Given** any preview interaction, **When** the reviewer opens or changes a message, **Then** no provider request, credential creation, account action, or application log event occurs and no sending control is offered.
4. **Given** any preview fixture, **When** its content is inspected, **Then** all identities, addresses, destinations, credentials, devices, sessions, and network details are obviously fictional and use reserved example domains where applicable.

---

### User Story 4 - Prepare Future Messages Without Enabling Them (Priority: P2)

As a product reviewer, I can inspect complete future transactional messages before their business workflows exist so that content and presentation can be agreed without accidentally enabling new account behavior.

**Why this priority**: The six future variants complete the 12-message presentation catalogue required by the local review experience. They remain presentation assets only because enabling their business semantics without separate specifications would expand security and account-lifecycle scope.

**Independent Test**: Render the six future variants in all supported locales, then verify that the deployed application exposes no event, route, job, credential path, or sending entry point for them.

**Acceptance Scenarios**:

1. **Given** a future preview-only variant, **When** it is rendered in any supported locale, **Then** it has complete localized subject, HTML, plain text, branding, support information, and legal links.
2. **Given** personal-data-export ready, email change requested, security alert, or generic confirmation, **When** its preview is rendered, **Then** it shows one primary action and the same fictional destination in plain text.
3. **Given** account deleted or email changed, **When** its preview is rendered, **Then** it remains informational and contains no business-action destination.
4. **Given** the generic confirmation preview, **When** its values are supplied, **Then** its subject, preview text, heading, body, and action label come from the localized catalogue while only predefined display values and the fictional action destination vary.
5. **Given** the deployed application, **When** its production behaviors are inspected and exercised, **Then** none of the six future variants can be triggered, sent, or used to create a credential.
6. **Given** a later product need to send one of the future variants, **When** that workflow is proposed, **Then** its trigger, authorization, credential, and lifecycle behavior require a separate feature specification.

### Edge Cases

- The optional logo is absent, temporarily unreachable, or has an unusually wide intrinsic aspect ratio; the message remains complete and does not rely on the image to communicate product identity or purpose.
- A supported email client suppresses remote images or applies its own font, spacing, or color adjustments; all essential content, destinations, and reading order remain usable without pixel-identical rendering.
- The configured primary color is near white or near black; action text still meets the required contrast ratio.
- Product names, legal names, postal addresses, support addresses, and translated copy are unusually long or contain quotes, apostrophes, ampersands, angle brackets, or long unbroken values.
- An action destination contains multiple query parameters and an opaque credential; its destination remains intact, escaped, and isolated from support and legal links.
- Rendering fails after credential issuance but before any provider request; the owning flow applies its established failed-submission compensation behavior.
- Delivery is rejected or acceptance cannot be determined after rendering; the existing one-attempt classification and compensation behavior remains authoritative.
- Transactional email is disabled while provider or branding settings are present; settings alone do not enable any email-dependent flow.
- A preview is opened without an application environment, database, authenticated session, provider credentials, or network access to the configured logo.
- A future preview-only message resembles an existing operational flow; resemblance does not make it triggerable or grant it access to credentials.
- Rendered output approaches the existing request-size limit; oversize content is rejected before submission without logging the message.

### Verification Strategy

- Automated rendering verification covers every template-locale combination, subject and body completeness, semantic parity between HTML and plain text, exact business-action destinations, and the credential-free existing-account notice.
- Localization verification covers every subject, preview text, heading, body, action, support detail, and legal label, including detection of unresolved placeholders and mixed-locale fallback copy.
- Safety verification covers HTML escaping, punctuation, query-rich destinations, non-executable output, credential isolation, log redaction, optional-logo behavior, and action-color contrast.
- Integration verification covers all six existing business triggers, rendering failure before submission, delivery failure after rendering, credential compensation, and unchanged delivery submission contracts.
- Preview verification covers all 36 combinations without application startup or external dependencies and records zero provider submissions, production-data access, credential creation, or sending controls.
- Release-package verification covers rendering and submission of every operational variant from the deployable artifact, including dependency completeness and the existing request-size boundary.
- Content-comprehension verification uses at least six reviewers who did not implement the feature, with at least two proficient reviewers per supported locale. Each reviewer assesses all six operational messages in one proficient locale from fictional rendered fixtures, and an assessment passes only when both the purpose and required next action match the fixed rubric.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide one shared transactional-email presentation system for all 12 in-scope variants.
- **FR-002**: The six operational variants MUST be login magic link, signup activation, existing-account signup notice, account-deletion reauthentication, account-security reauthentication, and personal-data-export confirmation.
- **FR-003**: The six preview-only variants MUST be personal-data-export ready, account deleted, email change requested, email changed, security alert, and generic confirmation.
- **FR-003a**: The generic confirmation variant MUST use catalogue-owned localized subject, preview text, heading, body, and action label. It MAY accept only predefined escaped display values and a fictional action destination and MUST NOT accept caller-provided message copy, HTML, or plain text.
- **FR-004**: Every successful render MUST produce a non-empty localized subject, a complete HTML document, and a non-empty plain-text alternative with the same essential purpose and primary destination.
- **FR-005**: Every variant MUST use a shared message structure containing localized inbox preview text, product identity, heading, body, support contact, legal identity, postal address, and localized Terms of Use and Privacy Notice links.
- **FR-006**: Every message MUST support English, Spanish, and Catalan, use only its requested locale, and contain no silent fallback copy from another language.
- **FR-007**: A message that requires an account action MUST present exactly one business-action destination as its clear primary action and MUST expose that same destination visibly in its plain-text alternative.
- **FR-007a**: Among the preview-only variants, personal-data-export ready, email change requested, security alert, and generic confirmation MUST require one primary action with a matching fictional plain-text destination; account deleted and email changed MUST remain informational with no business-action destination.
- **FR-008**: The existing-account signup notice MUST preserve its canonical locale-aware login destination while remaining credential-free and MUST contain no activation, verification, token, or other credential-bearing destination.
- **FR-009**: Support and legal destinations MUST NOT contain, inherit, or propagate any credential or recipient-specific parameter from the business-action destination.
- **FR-010**: Each operational variant MUST continue to originate from its current business event and preserve its current purpose, destination, credential scope, expiry, acceptance handling, public outcome, and failure compensation.
- **FR-010a**: The localized subject, preview text, heading, body, and action wording of an operational variant MAY be rewritten for a consistent voice, but the revised copy MUST preserve its essential meaning, required next action, and all security-relevant information; verification MUST assess semantic equivalence rather than require the previous wording verbatim.
- **FR-011**: Credential creation, expiry, single-use enforcement, persistence, supersession, and compensation MUST remain the responsibility of the owning business flow; message presentation MUST receive only values that the flow has already decided.
- **FR-012**: Presentation MUST complete before delivery submission. A presentation failure MUST make no provider request and MUST be handled by the existing caller as a failed submission attempt.
- **FR-013**: The existing provider-neutral delivery contract and its provider selection, fixed destinations, one-attempt behavior, timeout, request-size limit, response classification, acceptance semantics, and safe logging MUST remain unchanged.
- **FR-014**: Every template-locale render, when combined with a fictional recipient and locale and serialized through each existing provider adapter, MUST remain below the existing 1 MiB UTF-8 provider request-size limit. An oversized operational request MUST be rejected by the existing HTTP boundary before network submission.
- **FR-015**: Dynamic text and destinations MUST be escaped safely in HTML without executable markup or a changed destination, while subjects and plain text remain human-readable.
- **FR-016**: No rendered output MUST contain `undefined`, an unresolved placeholder, missing required copy, or an empty required field.
- **FR-017**: Messages MUST contain no remote script, executable content, tracking pixel, open tracking, click tracking, or recipient-specific logo destination.
- **FR-018**: Branding MUST be deployment-wide and MUST NOT vary by recipient, account, tenant, message, or application area.
- **FR-019**: The configurable brand MUST include the existing product name and canonical application origin, a primary color, support email address, legal organization name, legal postal address, and an optional absolute HTTPS logo destination.
- **FR-020**: When transactional email is enabled, every required brand value MUST be validated during application startup before any request is served; when it is disabled, the additional brand values MUST NOT be required for startup.
- **FR-021**: Missing or malformed required branding while transactional email is enabled MUST fail the entire application startup without serving a partially available application or exposing any supplied brand, provider, recipient, or credential value.
- **FR-022**: When a logo is configured, it MUST have meaningful alternative text based on the product name; when it is omitted or unavailable, the product-name fallback MUST remain complete without an empty image or broken layout.
- **FR-023**: The logo destination MUST be shared across recipients, contain no recipient or credential identifiers, and MUST NOT function as a tracking pixel.
- **FR-024**: The primary-action foreground color MUST be selected so that it has a contrast ratio of at least 4.5:1 against the configured primary color.
- **FR-025**: Terms of Use and Privacy Notice destinations MUST be absolute, use the existing canonical application routes, and preserve the message locale.
- **FR-026**: Product identity, long translated copy, legal names, postal addresses, support addresses, and action destinations MUST wrap without clipping, overlap, or horizontal overflow at representative mobile and desktop email widths.
- **FR-026a**: Every template MUST remain readable and actionable in the current stable Gmail web and mobile clients, Apple Mail and iOS Mail, Outlook web, and classic Outlook desktop. Essential content, reading order, primary actions, fallback destinations, support details, and legal links MUST remain usable, but pixel-identical rendering across clients is not required.
- **FR-027**: The local preview experience MUST list and render all 12 variants in all three supported locales for exactly 36 combinations.
- **FR-028**: The local preview MUST remain fully usable without starting the application or accessing authentication, session, database, application logging, provider, or sending behavior.
- **FR-029**: Opening, navigating, or rendering a preview MUST cause zero provider submissions, credential creation, account mutation, production-data access, or application log events and MUST expose no sending control.
- **FR-030**: Preview fixtures MUST be obviously fictional, use reserved example domains where applicable, and contain no real recipient, credential, session, device, network, provider, or production information.
- **FR-031**: The six preview-only variants MUST have no production trigger, route, service call, scheduled or background job, credential creation path, or sending entry point.
- **FR-032**: Subjects, rendered bodies, recipients, action destinations, credentials, template values, and preview fixture details MUST NOT be recorded in application or preview logs.
- **FR-033**: The deployable release package MUST include everything needed to render and submit each operational variant without a missing presentation asset or dependency.

### Verification Requirements

- **VR-001**: Automated rendering checks MUST cover all 36 template-locale combinations and verify a non-empty subject, complete HTML, non-empty plain text, required shared structure, and absence of unresolved values.
- **VR-002**: Localization checks MUST verify subject, preview text, body, action, support, and legal copy in each locale without mixed-language fallback content and MUST verify that revised operational copy preserves the previous essential meaning, next action, and security-relevant information without requiring verbatim wording.
- **VR-003**: Content-parity checks MUST verify that HTML and plain text communicate the same essential purpose and destination, that each credential-bearing operational message has exactly one business-action destination, that the existing-account notice has only its canonical locale-aware credential-free login destination, that the four action-bearing preview-only variants each have one matching fictional destination, and that the two informational preview-only variants have none.
- **VR-003a**: Generic-confirmation checks MUST verify fixed catalogue-owned copy in all three locales, accepted predefined display values and fictional destination, and the absence of inputs for caller-provided subject, preview text, heading, body, action label, HTML, or plain text.
- **VR-004**: Escaping checks MUST cover quotes, apostrophes, ampersands, angle brackets, long unbroken values, and destinations with multiple query parameters without executable markup or destination corruption.
- **VR-005**: Branding checks MUST cover valid configuration, each missing or malformed required value, disabled transactional email, absent and unreachable logos, meaningful alternative text, light and dark primary colors, and long legal and support details; every invalid enabled-email case MUST terminate application startup before any request is served.
- **VR-006**: Layout checks MUST cover representative mobile and desktop email widths in every locale and the current stable Gmail web and mobile clients, Apple Mail and iOS Mail, Outlook web, and classic Outlook desktop. Verification MUST find no loss of essential content, broken reading order, unusable action, obscured fallback destination, clipping, overlap, or horizontal overflow; visual differences that preserve readability and actionability are acceptable.
- **VR-007**: Preview-isolation checks MUST render and navigate all 36 combinations without application configuration or external dependencies and MUST assert zero provider requests, credential actions, production-data access, application log events, and sending controls.
- **VR-008**: Integration checks MUST exercise the current trigger for all six operational variants and verify unchanged purpose, destination, credential lifecycle, provider request contract, acceptance behavior, and public outcome.
- **VR-009**: Failure checks MUST prove that rendering errors occur before any provider request and that rendering or delivery failure leaves no newly issued credential usable and restores no superseded credential.
- **VR-010**: Automated inspection MUST verify that all six future variants are unreachable from production routes, business services, jobs, credential creation, and sending entry points.
- **VR-011**: Size checks MUST combine every template-locale render, including representative long values, with a fictional recipient and locale, serialize it through both existing provider adapters, and verify that each UTF-8 request body remains below 1 MiB. An oversized operational request MUST fail at the existing HTTP boundary before network submission and without content logging.
- **VR-012**: Release verification MUST render and submit each operational variant from the deployable package through the existing delivery boundary without a missing asset or dependency.

### Key Entities *(include if feature involves data)*

- **Message Variant**: One named transactional communication with a purpose, operational or preview-only status, action requirement, and localized content in each supported language.
- **Rendered Transactional Message**: The presentation result containing locale, subject, HTML, plain text, product identity, support and legal details, and at most one business-action destination.
- **Email Brand**: The one deployment-wide identity used by every variant, consisting of product identity, canonical origin, primary color, support address, legal identity, postal address, and optional shared logo destination.
- **Preview Fixture**: A complete set of obviously fictional values used only to inspect a variant locally and incapable of authorizing or initiating any business action.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 36 template-locale combinations render successfully with a non-empty subject, complete HTML, non-empty plain text, and the required shared message structure.
- **SC-002**: Automated inspection finds zero unresolved placeholders, `undefined` values, mixed-locale fallback copy, executable content, preview secrets, or real personal data across all 36 combinations.
- **SC-003**: All six existing business events produce messages with their established purpose, destination, credential scope, expiry, acceptance behavior, compensation, and provider submission contract unchanged.
- **SC-004**: Across all rendering and delivery failure cases, zero newly issued credentials remain usable, zero superseded credentials are restored, and zero rendering failures reach a provider.
- **SC-005**: Reviewers can open and navigate all 36 previews with zero provider submissions, production-data reads, credential actions, account mutations, or application log events.
- **SC-006**: Transactional email remains disabled and the application starts successfully in 100% of tests without the additional brand values; 100% of missing or malformed required-brand cases terminate the entire application startup before serving requests when email is enabled.
- **SC-007**: Every tested action-color combination meets at least 4.5:1 contrast, and every combination in the locale, width, logo, long-content, and named email-client verification matrix preserves all essential content and actions with zero clipping, overlap, or horizontal overflow that prevents use.
- **SC-008**: Both existing provider serializations of every rendered combination remain below the 1 MiB UTF-8 request-size limit under representative content, and an oversized operational request is rejected before network submission with zero message content recorded.
- **SC-009**: The deployable release package renders and submits all six operational variants with zero missing presentation assets or dependencies.
- **SC-010**: In a review with at least six people who did not implement the feature and at least two proficient reviewers for each supported locale, every reviewer assesses all six operational messages in one proficient locale without external instructions. At least 90% of the resulting reviewer-message assessments MUST correctly identify both the message purpose and required next action against a fixed rubric, with anonymized results recorded for release review.
- **SC-011**: Automated production-surface inspection finds zero triggers, routes, jobs, credential paths, or sending entry points for the six preview-only variants.
- **SC-012**: Automated log inspection finds zero subjects, bodies, recipients, action destinations, credentials, template values, or preview fixture details.
- **SC-013**: Generic-confirmation verification finds zero caller-provided copy, HTML, or plain-text inputs and confirms catalogue-owned localized copy in all three supported locales.

## Assumptions

- Versmedit remains one deployable application with one active email brand rather than tenant-specific or account-specific branding.
- English, Spanish, and Catalan remain the complete locale set for this feature.
- The existing Terms of Use and Privacy Notice routes remain the canonical legal destinations.
- The existing delivery service continues to accept a fully prepared recipient, subject, HTML body, and plain-text body and remains the sole owner of provider submission.
- The six listed operational variants are the only currently sent transactional messages in scope.
- The six future variants remain presentation assets until separate product specifications define their triggers, authorization, credentials, and lifecycle semantics.
- Deployment configuration remains the source of real branding, while local previews use an isolated fictional brand and fixtures.
- Existing delivery timeout, request-size, one-attempt, response-classification, acceptance, and safe-logging rules remain authoritative.

## Non-Goals *(mandatory)*

- Adding business workflows or sending triggers for personal-data-export ready, account deleted, email change, security alert, or generic confirmation messages.
- Changing credential generation, hashing, expiry, single-use behavior, persistence, supersession, or compensation rules.
- Replacing or redesigning the existing delivery contract, providers, provider health checks, request transport, endpoints, acceptance rules, or safe logging.
- Adding another provider, provider fallback, automatic retry, queues, schedules, campaigns, attachments, CC/BCC, delivery webhooks, delivery-status storage, or an administrative delivery view.
- Adding per-tenant, per-account, per-recipient, or multi-application branding.
- Creating a public or application-hosted development preview route.
- Adding database models, stored message history, or migrations.
- Rewriting or legally approving the Terms of Use or Privacy Notice.
- Sending marketing, campaign, or bulk email.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: Only the existing trusted business flows may prepare and submit operational messages. This feature adds no authority to initiate account actions, and local previews grant no production capability.
- **Account lifecycle**: Registration, sign-in eligibility, account activation, reauthentication, deletion, security, and export rules remain owned by their existing flows. Message presentation cannot create an account, session, or credential, and the existing-account signup notice remains credential-free.
- **Authentication provider verification**: Existing authentication and delivery boundaries remain unchanged. Integration verification must cross the real delivery contract for all authentication-related operational messages, while local preview checks remain deliberately isolated from it.
- **Data sensitivity**: Recipient addresses, names, action destinations, credentials, subjects, and message bodies are sensitive. They remain confined to the owning flow and delivery operation and are never copied into preview fixtures, logs, or future preview-only behavior.
- **Input validation**: Required branding, support email, legal identity, postal address, primary color, optional logo destination, locale, message variant, dynamic values, and action destinations require trusted validation before submission. Configuration cannot override provider endpoints or create arbitrary sending destinations, and generic confirmation cannot accept arbitrary message copy or rendered content.
- **Log hygiene**: Logs must exclude recipients, subjects, rendered content, action destinations, credentials, template values, branding values supplied during failed validation, and preview fixture details, including nested errors and test output.
- **Public exposure**: This feature adds no public endpoint, callback, preview route, webhook, or sending control. Existing public authentication and signup surfaces remain unchanged.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: Malicious dynamic values could attempt markup or destination injection; a business credential could leak into support or legal links; preview code could accidentally reach provider or account behavior; a future variant could become sendable without reviewed lifecycle rules; a logo could be made recipient-specific for tracking; or oversized content could exhaust or bypass delivery limits.
- **Controls**: Preserve existing authorization, anti-abuse, credential, and one-attempt delivery controls; validate and escape every presentation value; allow exactly one business-action destination; derive legal destinations from canonical routes; prohibit tracking and recipient-specific logos; isolate previews from application and provider behavior; reject oversize output before submission; and verify that future variants have no production entry point.
- **Residual risk**: A shared remote logo host may observe ordinary image fetch metadata when a recipient's client loads images, and email clients may suppress remote images or styles. This is acceptable only because the logo is optional, shared across all recipients, contains no recipient identifier, communicates no essential content, and has a complete text fallback.

## Operational Impact *(include if the feature changes deployment, data, or infrastructure)*

- **Deployment changes**: Deployment configuration gains the required non-secret brand color, support email, legal organization, legal postal address, and optional shared logo destination when transactional email is enabled. No new container, worker, network, volume, public route, provider endpoint setting, or sending service is required. The deployable package must include the complete presentation capability.
- **Data & migrations**: No database model, retained message, preview record, delivery history, or migration is introduced. Existing credentials and account data remain owned by their current flows.
- **Recovery**: Invalid enabled-email branding prevents the entire application from starting or serving requests. Recovery consists of correcting configuration or deploying a compatible presentation fix and then restarting normally; there is no data migration to reverse, and outstanding credentials continue to follow their existing expiry and compensation rules.
- **Observability**: Existing redacted delivery outcome events remain authoritative. Presentation failures may be identified only by fixed non-sensitive categories and timing; no recipient, subject, body, destination, credential, template value, or branding value may enter logs. Preview activity produces no application operational event.
