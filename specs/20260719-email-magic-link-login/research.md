# Phase 0 Research: Email Magic Link Login

## Existing Authentication Boundary

**Decision**: Keep NextAuth 4.24's native `POST /api/auth/signin/email` and email callback, but wrap
the sign-in branch in the existing route handler. Before account lookup, the wrapper validates
NextAuth's double-submit CSRF token using its documented cookie format and constant-time comparisons;
it does not import private NextAuth internals. The wrapper then validates and normalizes the request,
consumes limits, checks provider state, performs the existing-user lookup, delegates only known users
to NextAuth, and replaces the provider response with a canonical public response.

**Rationale**: Uniform CSRF validation before branching prevents unknown-email requests from taking
a weaker path than known-email requests. This preserves NextAuth-compatible CSRF, token hashing,
callback verification, database sessions, and same-origin redirects while creating the server-only
boundary needed to prevent implicit registration and account enumeration. Unknown emails never reach
token creation or SMTP.

**Alternatives considered**:

- A new custom magic-link endpoint was rejected because it would duplicate Auth.js token hashing,
  callback, CSRF, and session behavior.
- Calling NextAuth for unknown emails was rejected because it would create tokens and attempt email
  delivery, violating the specification.
- A Server Action was rejected as the sole boundary because the existing public Auth.js endpoint and
  callback still require consistent hardening and integration coverage.
- Delegating only known users without prevalidating CSRF was rejected because synthetic unknown-email
  responses would bypass a control applied by NextAuth to known-email requests.

## Public Response Contract

**Decision**: The login client posts URL-encoded form data with `email`, `csrfToken`, `callbackUrl`,
and `json=true` to the native email sign-in endpoint. The wrapper returns a small canonical JSON
contract: `200 accepted`, `400 invalid`, `429 rate_limited`, or `503 unavailable`. Known and unknown
valid emails always receive byte-equivalent `200` bodies and no account-dependent redirect.

**Rationale**: A response owned by the wrapper is straightforward to compare in tests and prevents
NextAuth/provider-specific success or isolated failure details from leaking. Localized user messages
remain in next-intl catalogs rather than varying API content.

All accepted valid-email paths wait until a shared 500 ms floor plus server-selected 0–100 ms jitter
has elapsed before returning. The delay starts after request receipt and applies to known, unknown,
delivered, and isolated-failure outcomes. It removes the obvious immediate unknown-email response but
does not claim resistance to repeated statistical timing analysis.

**Alternatives considered**:

- Returning NextAuth's raw response was rejected because provider failures and redirect details can
  differ from a synthetic unknown-email response.
- Returning localized API strings was rejected because it adds locale-dependent API shapes and
  duplicates catalog ownership.

## Email Validation and Normalization

**Decision**: Use one shared Zod schema for client and server. Trim surrounding whitespace,
lowercase the address, enforce a valid email shape and a 254-character maximum, then hash only the
normalized value for the address limit key. Every server-received request consumes the client
bucket; only successfully validated normalized addresses consume an address bucket.

**Rationale**: Shared validation prevents client/server drift. Normalizing before lookup and rate
limiting makes equivalent inputs share account and abuse controls. The maximum bounds parsing and
storage work on a public endpoint.

**Alternatives considered**:

- Browser-only validation was rejected because the endpoint is public and directly callable.
- Raw-string rate-limit keys were rejected because case and whitespace variants could evade limits.
- Logging or storing the normalized email in limiter keys was rejected because email is PII; the
  existing SHA-256 key pattern is retained.

## Existing-User Enforcement

**Decision**: Query `User` by normalized email with a case-insensitive PostgreSQL comparison on the
server before delegating to NextAuth. Return the canonical accepted response for no account only after
the shared response envelope. Keep the hardened adapter's `createUser` rejection as defense in depth.

**Rationale**: This is the earliest point that can guarantee unknown addresses create neither
`User` nor `VerificationToken` while preserving the same public response.

**Alternatives considered**:

- Relying only on the adapter's `createUser` rejection was rejected because token creation and SMTP
  happen before the callback attempts user creation.
- Client-side account checks were rejected because they expose account existence and are untrusted.
- Exact case-sensitive equality was rejected because legacy mixed-case stored addresses must remain
  eligible without a data migration.

## Single Active Token and Concurrency

**Decision**: Override `createVerificationToken` in the hardened adapter. Within a PostgreSQL
transaction, acquire a transaction-scoped advisory lock derived from the normalized identifier,
delete all pending tokens for that identifier, and create the new hashed token. Continue using the
adapter's atomic delete-on-use callback behavior.

**Rationale**: `deleteMany + create` alone can interleave under concurrent requests and leave two
valid tokens. A transaction-scoped advisory lock serializes only requests for the same identifier,
requires no schema change, works across replicas, and leaves unrelated logins concurrent.

**Alternatives considered**:

- Adding a unique constraint on `identifier` was rejected because the feature forbids schema changes
  and would still require conflict/retry behavior.
- In-memory locks were rejected because they do not coordinate multiple containers.
- Deleting older tokens without a lock was rejected because it does not guarantee newest-only links
  under races.

## Failed-Delivery Compensation

**Decision**: Wrap each known-account delegation in an `AsyncLocalStorage` verification context. The
adapter publishes the exact persisted `{identifier, hashedToken}` to that request context. If
`sendVerificationRequest` fails, it awaits token creation if necessary and deletes that exact token;
it never restores a superseded token. The wrapper still returns the canonical accepted response for
isolated failures.

**Rationale**: NextAuth 4 creates the token and invokes SMTP concurrently with `Promise.all`, so SMTP
failure can otherwise leave a valid token. Exact-token compensation avoids deleting a newer token
from another request and needs no changes to NextAuth internals or the schema.

**Alternatives considered**:

- Deleting every token for the email after failure was rejected because it can erase a newer
  concurrent request.
- Waiting to create the token until SMTP succeeds was rejected because the accepted clarification
  requires invalidating a newly created token and because it would require deeper control of
  NextAuth's concurrent workflow.
- Leaving the token to expire was rejected because it violates the clarified lifecycle.

## Shared Provider Availability

**Decision**: Add a provider-availability helper that uses a reserved `RateLimitBucket` key and
`resetAt` as a shared cooldown. Transport/configuration failures mark a 60-second unavailable window;
recipient-specific rejection remains an isolated failure and does not open the global state. The
request that discovers a transport failure keeps the generic accepted response; subsequent valid
requests of any account status receive the canonical `503 unavailable` until the marker expires.

**Rationale**: This implements the clarified globally observable state across replicas without a new
table, service, variable, or migration. A short self-expiring cooldown prevents a transient provider
failure from causing repeated connection work while limiting recovery delay. The discovering request
does not become an account-existence oracle.

**Alternatives considered**:

- A process-local circuit breaker was rejected because replicas would disagree.
- A new provider-health table or Redis was rejected because existing PostgreSQL state is sufficient
  and the feature disallows schema/infrastructure changes.
- Exposing every isolated SMTP failure as `503` was rejected because only known accounts invoke SMTP
  and the difference would enumerate accounts.
- Treating a recipient rejection as provider-wide was rejected because it can suppress unrelated
  users and lets one address influence global availability.

## Locale and Canonical Redirects

**Decision**: Render pages below `src/app/[locale]/login`; build callback destinations from the
validated active locale (`/`, `/es`, `/ca`); update Auth.js error-page localization from signup to
login; and retain existing `NEXTAUTH_URL`, proxy host validation, and same-origin redirect callback.
All unverifiable callback failures render one generic localized invalid-link state. Invalid CSRF uses
a separate localized invalid-request state and is never presented as provider unavailability.

**Rationale**: This follows next-intl's `localePrefix: "as-needed"` routing and preserves the locale
without trusting arbitrary callback origins.

**Alternatives considered**:

- A locale query parameter was rejected because URL locale routing is already authoritative.
- Trusting a submitted absolute callback URL was rejected because it creates an open redirect risk.

## UI Baseline and Accessibility

**Decision**: Run `npx shadcn@latest add login-03`, create its generator configuration if needed,
then remove registration/password/social controls and adapt the composition to one email field and
the project's styles. Model the form as stable initial, pending, accepted, invalid-email,
invalid-request, rate-limited, unavailable, and generic invalid-link regions. Use associated labels,
persistent message space, visible focus, `aria-invalid`/`aria-describedby`, and polite/assertive live
regions as appropriate.

**Rationale**: This meets the required official visual baseline while keeping the existing app's
components and multilingual critical-flow semantics authoritative.

**Alternatives considered**:

- Copying visual markup manually was rejected because the specification explicitly requires the
  official generator command.
- Keeping login-03's password/social/signup controls was rejected as out of scope and misleading.

## Verification Strategy

**Decision**: Add Vitest component tests with Testing Library/user-event and direct `axe-core` DOM
checks; route/service/adapter unit tests; and PostgreSQL integration tests that exercise request,
token persistence, controlled SMTP outcomes, callback consumption, uniform known/unknown responses,
concurrency, limits, locale redirects, and failed-delivery compensation. Do not add a feature-specific
Playwright E2E test or a real-provider inbox dependency.

**Rationale**: Controlled outcomes keep success and failure tests deterministic without provider
credentials, external inbox availability, or sending real messages. No recipient, body, token, or URL
is logged.

**Alternatives considered**:

- Unit tests alone were rejected because authentication and PostgreSQL coordination are critical.
- A Mailpit/container SMTP emulator was rejected because the constitution says the template does not
  emulate SMTP and the feature excludes provider changes.
- A new feature Playwright suite was rejected because the specification explicitly excludes E2E.

## Deployment, Migration, and Recovery

**Decision**: Make no Compose, environment, schema, or migration changes. Roll out application code
against the existing schema. On rollback, reserved provider-state rows expire automatically and
verification tokens expire within 15 minutes; no data reversal is required.

**Rationale**: All required durable behavior fits existing tables and runtime configuration. This is
forward- and backward-compatible at the data boundary.

**Alternatives considered**:

- Adding an SMTP health service, queue, worker, or cache was rejected as unnecessary operational
  complexity for this scope.