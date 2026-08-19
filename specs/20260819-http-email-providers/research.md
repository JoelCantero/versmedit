# Phase 0 Research: Transactional Email HTTP Providers

**Feature**: `20260819-http-email-providers`
**Date**: 2026-08-19

## 1. HTTP Client and Dependency Strategy

**Decision**: Use Node.js 24 LTS's built-in WHATWG `fetch`, `Headers`, and `AbortSignal.timeout()` through an injected server-only request function. Do not add Brevo, Mailjet, Axios, Undici, or retry libraries.

**Rationale**: Node documents global `fetch` as stable and backed by Undici, and `AbortSignal.timeout()` is available natively. The feature needs one JSON POST and one recipient-independent JSON GET per provider, with no proxy, custom dispatcher, streaming upload, or retry requirement. An injected request function gives unit and integration tests a controlled fake HTTP boundary without a runtime URL override.

**Alternatives considered**:

- Provider SDKs: rejected because they add two vendor dependencies, obscure exact request contracts, and increase bundle/audit surface without needed functionality.
- Axios or direct Undici dependency: rejected because native fetch already supplies the required behavior.
- Global fetch replacement or `MAIL_API_BASE_URL`: rejected because global mutation can leak across concurrent tests and runtime URL configuration could redirect credentials.

**Sources**:

- [Node.js global fetch](https://nodejs.org/api/globals.html#fetch)
- [Node.js `AbortSignal.timeout`](https://nodejs.org/api/globals.html#static-method-abortsignaltimeoutdelay)

## 2. Provider Selection and Outbound Contracts

**Decision**: Map `MAIL_PROVIDER` to fixed provider adapters and official endpoints. Both adapters receive one common message containing one recipient, sender email, `PROJECT_NAME`, subject, plain text, and HTML.

### Brevo

- `POST https://api.brevo.com/v3/smtp/email`
- Headers: `api-key: MAIL_API_KEY`, `content-type: application/json`
- Body fields: `sender.email`, `sender.name`, one `to[].email`, `subject`, `textContent`, and `htmlContent`
- Expected acceptance: a valid 2xx response body with no documented error; retain top-level `messageId` when it is a non-empty string, otherwise null
- Never use `/v3/emailCampaigns`

Brevo's current reference exposes both `textContent` and `htmlContent`, while examples emphasize HTML and do not prove every account accepts both together. The feature keeps both parts because localized accessibility/fallback content is required, and the staged real-provider smoke test is the release gate for this contract.

### Mailjet

- `POST https://api.mailjet.com/v3.1/send`
- Headers: HTTP Basic `MAIL_API_KEY:MAIL_API_SECRET`, `content-type: application/json`
- Body: one object in `Messages`, with `From.Email`, `From.Name`, one `To[].Email`, `Subject`, `TextPart`, and `HTMLPart`
- Expected acceptance: HTTP 2xx plus exactly one message result whose `Status` is `success`; prefer a non-empty `MessageUUID`, otherwise stringify a valid `MessageID`, otherwise null
- A 2xx response containing `Status: error` is not accepted and must be classified from its documented `Errors[]`

**Rationale**: Fixed adapters keep vendor casing, authentication, and response parsing outside login/signup business logic. Validating the Mailjet body prevents a transport-level 2xx from being falsely recorded as acceptance.

**Alternatives considered**:

- One generic payload translated by configuration: rejected because the providers have materially different nesting, casing, authentication, and response semantics.
- `MessageHref` as Mailjet's message identifier: rejected because it is a URL and the safe result requires an identifier, not a provider URL.
- Mailjet v3: rejected because v3.1 supplies detailed per-message status and error data needed for deterministic normalization.

**Sources**:

- [Brevo transactional send reference](https://developers.brevo.com/reference/sendtransacemail)
- [Mailjet Send API v3.1 guide](https://dev.mailjet.com/email/guides/send-api-v31/)
- [Mailjet Send API reference](https://dev.mailjet.com/email/reference/send-emails/)
- [Mailjet Email API authentication](https://dev.mailjet.com/reference/overview/authentication/)

## 3. Normalized Acceptance and Error Classification

**Decision**: Validate status and bounded JSON before constructing the normalized result. Use provider-specific maps with these safe defaults:

| Condition | Normalized category | Notes |
|---|---|---|
| Valid provider-specific acceptance | `accepted` | Acceptance only, never delivery |
| 401 or 403 | `authentication` | The feature contract deliberately standardizes both statuses, including Mailjet sender-related 403 responses |
| 400 or 409 | `invalid_request` | Unless a documented body unambiguously reports recipient rejection |
| Explicit documented destination rejection | `recipient_rejected` | Never infer from syntax validation alone |
| 429 | `rate_limited` | Retry metadata remains internal and does not trigger an automatic retry |
| 5xx | `provider_unavailable` | Per-send category only; never mutates shared public health |
| Timeout, DNS, TLS, reset, connection failure | `provider_unavailable` | Acceptance remains indeterminate; no retry |
| Malformed, oversized, contradictory, or unmapped response | `unknown` | Never accepted or delivered |

**Rationale**: Status alone is insufficient for Mailjet's 2xx bodies, but the authoritative feature contract standardizes every 401/403 as `authentication` and every otherwise-unclassified 400/409 as `invalid_request`. Mailjet documents sender validation failures as 403, so this normalized category is intentionally coarser than the provider's detailed meaning. Neither initial provider's reviewed send contract documents an unambiguous send-time destination rejection, so the initial `recipient_rejected` allowlist is empty; malformed email syntax remains `invalid_request`. The category stays in the common contract for a future provider or newly documented code, and other unknown semantics stay unknown instead of being invented.

**Alternatives considered**:

- Treat every 2xx as accepted: rejected because Mailjet can return message-level errors in a successful HTTP response.
- Provider-specific 403 categories: rejected because FR-019 requires one deterministic cross-provider `authentication` category for every 403.
- Treat undocumented 409 as unknown: rejected because FR-022 requires `invalid_request` when no reliable recipient-specific classification exists.
- Preserve raw error bodies for diagnostics: rejected because they may contain recipients, content, identifiers, or provider details forbidden from logs/business results.

## 4. Timeouts, Body Bounds, and Retry Policy

**Decision**: Apply one total `2,500 ms` timeout to each send and one total `1,500 ms` timeout to each health probe, including connection establishment, response headers, and bounded response-body consumption. Read at most 64 KiB of response data. Make exactly one outbound attempt.

**Rationale**: A 2.5-second send cap leaves margin within the five-second public-response objective for provider-health refresh, database/token compensation, logging, and framework overhead. A 1.5-second metadata probe plus a 2.5-second send stays under four seconds of external waiting. Provider success/error payloads are small JSON documents; 64 KiB is ample while preventing unbounded buffering. Any timeout after bytes may have left the provider is indeterminate, so retrying risks duplicate authentication email.

**Alternatives considered**:

- Existing SMTP timeout of 10 seconds: rejected because it conflicts with the clarified five-second public objective.
- Five-second send timeout: rejected because it consumes the whole public budget before local cleanup and any health refresh.
- Automatic backoff for 429/5xx/timeouts: rejected by the clarified one-attempt domain rule and duplicate-send risk.

## 5. Recipient-Independent Shared Provider Health

**Decision**: Retain the existing route-level `getProviderAvailability()` preflight but change it to a cache-first, request-triggered, cross-instance single-flight health probe using existing `RateLimitBucket` rows. Scope keys by provider:

- `mail:provider-health:<provider>`: `count=0` means last probe available, `count=1` means unavailable; `resetAt` is the next refresh/retry time.
- `mail:provider-health-lock:<provider>`: an atomic two-second claim prevents concurrent probes across app instances.

Use a 60-second health cache/outage interval. When the state is fresh, return it without network access. When stale or absent, one request atomically claims the probe; the winner performs one 1.5-second authenticated, recipient-free GET and writes the result. Other requests use the last cached state, defaulting to unavailable when no prior state exists. Do not probe at startup and do not couple `/api/health` or Docker liveness to provider availability.

Provider probes:

- Brevo: `GET https://api.brevo.com/v3/account` with `api-key`; a successful authenticated 2xx is healthy. Discard the account body without logging it.
- Mailjet: `GET https://api.mailjet.com/v3/REST/sender?Limit=1` with HTTP Basic; a successful authenticated 2xx is healthy, including an empty sender list. Discard the sender metadata body without logging it.

Individual send results never write, extend, or clear health state. Remove current `markProviderUnavailable()` calls from Auth.js and signup delivery paths.

**Rationale**: Existing login and signup routes already call availability before account lookup, and PostgreSQL already coordinates shared rate-limit state. Reusing the table avoids a schema migration, worker, cron, webhook, or new container while making state consistent across instances and independent of recipients. A provider-specific key prevents a stale Brevo outage from affecting Mailjet after configuration switches.

**Alternatives considered**:

- Mark health unavailable from individual sends: rejected because known-user-only delivery could create an account-enumeration side channel and directly violates the clarified spec.
- Probe in `/api/health`: rejected because third-party outages must not make Docker restart a healthy app.
- Probe during startup: rejected because transient external failure should not prevent the app from serving non-email routes; startup still fails on invalid configuration shape.
- Dedicated worker, cron, or sidecar: rejected as unnecessary infrastructure and explicitly outside scope.
- Manual-only flag: rejected because it does not verify provider reachability and requires undocumented operational intervention.

**Sources**:

- [Brevo account details reference](https://developers.brevo.com/reference/getaccount)
- [Mailjet API resource overview (`GET /sender`)](https://dev.mailjet.com/email-api/v3/)
- [Mailjet sender resource](https://dev.mailjet.com/email-api/v3/sender/)
- [Mailjet Email API authentication](https://dev.mailjet.com/reference/overview/authentication/)

## 6. Configuration and Startup Validation

**Decision**: Replace `AUTH_EMAIL_ENABLED` with boolean `MAIL_ENABLED` (absent defaults to false). When false, provider fields may be absent and credentials alone enable nothing. When true, require `MAIL_PROVIDER`, `MAIL_API_KEY`, valid bare-address `MAIL_FROM`, non-empty safe `PROJECT_NAME`, and Mailjet-only `MAIL_API_SECRET`; reject unsupported provider values and all incomplete/invalid configuration at startup. Do not define `MAIL_FROM_NAME` or `MAIL_API_BASE_URL`.

**Rationale**: One global gate matches the clarified scope for login, signup, activation, and notices. Provider-discriminated validation makes impossible states fail before serving email-dependent flows while keeping secrets out of error values.

**Alternatives considered**:

- Separate login/signup flags: rejected by the clarification.
- Validate provider reachability at startup: rejected because network availability is runtime health, not configuration shape.
- Accept display-name syntax in `MAIL_FROM`: rejected because sender name is authoritatively derived from `PROJECT_NAME`.

## 7. Test Boundary and SMTP Retirement

**Decision**: Replace SMTP fixtures with an injected `ProviderHttpClient`/request function and controlled local HTTP fixture that records method, fixed logical endpoint, headers, body, timing, and request count. Unit and integration tests pass an explicit request function to the adapters. E2E starts the standalone app with a test-only Node preload module that wraps global fetch in that isolated process, intercepts only the exact official Brevo/Mailjet URLs, and forwards them to the local fixture while preserving the logical target for assertions. No application environment variable changes provider URLs. Remove `nodemailer`, `@types/nodemailer`, `smtp-server`, and `@types/smtp-server` after both HTTP provider paths and real-provider smoke sends pass.

**Rationale**: The SMTP server packages have no remaining production or test consumer after HTTP fixtures replace them. Explicit injection proves future provider compatibility and fixed production endpoints while keeping tests deterministic and offline.

**Alternatives considered**:

- Network interception or DNS rewriting: rejected as brittle and capable of masking endpoint-selection defects.
- Global fetch monkey-patching inside shared Vitest processes: rejected because concurrent tests can leak state. The isolated E2E server preload is process-scoped, immutable for the run, and exact-URL allowlisted.
- Keep SMTP fixtures for rollback: rejected because rollback uses the previous deployable artifact, not dead dependencies in the completed artifact.

## 8. Delivery Tracking Scope

**Decision**: Log only outbound request acceptance or normalized failure using allowlisted metadata. Retain a safe provider message identifier when supplied. Do not expose webhooks, persist delivery state, build an admin view, or infer delivery; every post-acceptance delivery state remains unknown.

**Rationale**: This is the clarified option A. It meets current operational needs without adding public ingress, webhook authentication, idempotency storage, PII retention, migrations, or administrative authorization.

**Alternatives considered**:

- Authenticated webhooks logged only: deferred because they add public attack surface without a current product consumer.
- Persisted delivery state or admin UI: rejected as outside current scope and unnecessary for transport migration.
