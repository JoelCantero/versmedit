# Phase 0 Research: Signup Page

All technical unknowns from the specification and plan are resolved below. The decisions preserve
the existing login boundary and use the repository's current Next.js, NextAuth, Prisma, SMTP,
localization, accessibility, and test patterns.

## Account Lifecycle Representation

**Decision**: Keep `User` as the canonical account row, add a unique `normalizedEmail`, and add an
explicit `UserStatus` with `PENDING` and `ACTIVE`. Backfill every existing user as `ACTIVE`; create
new signup users as `PENDING` with `name = null` and `emailVerified = null`; retain pending rows for
later valid signup attempts.

**Rationale**: Auth.js sessions, accounts, profile updates, and existing navigation already resolve
the `User` model. An explicit state keeps registration product-driven while allowing the hardened
adapter to exclude pending users from generic login. A database unique constraint on the normalized
address closes case-only races that application lookup alone cannot prevent.

**Alternatives considered**:

- A separate `PendingUser` table was rejected because activation would require moving identity and
  relations between tables and would duplicate the canonical account model.
- Treating `emailVerified = null` as the only pending marker was rejected because legacy active
  users may lack that timestamp and account eligibility needs an explicit invariant.
- Relying only on case-insensitive application queries was rejected because concurrent inserts
  still require a database uniqueness guarantee.

## Onboarding Token and Candidate Snapshot

**Decision**: Extend the existing `VerificationToken` model rather than add a second link table.
Add a `LOGIN`/`SIGNUP` purpose, globally unique token hash, locale, proposed name, Terms version,
Privacy Notice version, server-recorded acceptance time, and creation time. Signup fields are an
immutable candidate snapshot bound to that token. Reconcile the current schema/migration drift by
removing the unused schema-only token `id` and adding the schema-only `proposedName`/`createdAt`
fields through the new migration.

**Rationale**: NextAuth already owns token hashing, callback validation, expiry, and database-session
creation through this table. The hardened adapter already serializes newest-token replacement and
atomic consumption. The existing `proposedName` field was introduced with the controlled email
verification work but is not yet persisted by a migration, making this the intended extension point.
A purpose discriminator lets login and signup share storage without sharing lifecycle behavior.

**Alternatives considered**:

- A new `SignupLink` table was rejected as redundant because the existing adapter token row has the
  same lifetime and single-use ownership and can carry the complete candidate snapshot.
- Candidate fields on `User` were rejected because later pending submissions would mutate consent
  before mailbox verification and would not remain bound to the link that is consumed.
- Raw token storage was rejected; only an Auth.js-compatible salted SHA-256 hash is persisted.

## Policy Acceptance Source and Persistence

**Decision**: Add one immutable `PolicyAcceptance` row with a unique `userId`, `termsVersion`,
`privacyVersion`, `acceptedAt`, and audit creation time when signup activation commits. Keep the
candidate snapshot on the signup token until activation. Define current versions and localized
application-relative `/terms` and `/privacy` destinations in a server-owned signup policy module.
Use the user-authorized, clearly labeled development dummy copy in English, Spanish, and Catalan
with stable `2026-08-18-draft` Terms and Privacy version identifiers. Implementation integrates this
product input as visibly unreviewed development content and does not claim legal review or assess
its sufficiency.

**Rationale**: One active row satisfies the clarified requirement for exactly one authoritative
signup acceptance without inventing acceptance for legacy users. Server-owned constants prevent
client tampering and source control versions policy content with the application release. Persisting
the token snapshot means a policy update during the 15-minute link lifetime cannot rewrite what the
user accepted.

**Alternatives considered**:

- Storing version or time from the request was rejected because both values are trust-boundary data.
- Environment-variable policy URLs and versions were rejected because six locale-specific settings
  would create avoidable deployment drift for non-secret, release-coupled content.
- Updating an acceptance row on later signup attempts was rejected because active-account signup is
  explicitly non-mutating and acceptance is immutable.

## Signup Submission Boundary

**Decision**: Add `POST /api/signup` as a dedicated JSON endpoint. It consumes the shared client
limit before parsing or CSRF validation; validates the existing Auth.js CSRF cookie/body pair and an
exact `{name,email,policyAccepted,locale,csrfToken}` body; normalizes and validates all fields; then
consumes the existing shared normalized-address limit. It checks shared provider availability before
any account mutation. Valid new/pending/active requests all return the same `200 {status:
"accepted"}` after the established 500 ms plus 0-100 ms floor.

**Rationale**: A distinct endpoint keeps login existing-user-only, makes validation order explicit,
and reuses the exact PostgreSQL-backed rate-limit keys so changing entry points does not increase
mail volume. JSON provides a small typed contract while the same CSRF primitive protects the cookie-
bound public mutation.

**Alternatives considered**:

- Adding a mode to `/api/auth/signin/email` was rejected because it would blur the constitutional
  registration/login boundary and risk implicit creation regressions.
- A Server Action without a public contract was rejected because the existing login flow, rate-limit
  headers, response parity assertions, and integration tests are route-oriented.
- Client-provided policy metadata was rejected; only the affirmative checkbox and locale cross the
  boundary.

## Token Creation and Email Delivery

**Decision**: The signup service generates 32 random bytes, stores the hash format expected by the
pinned NextAuth email callback, and commits pending-account/token replacement under a PostgreSQL
advisory transaction lock keyed by normalized email. It then sends either a localized onboarding
email or active-account login notice through the existing Nodemailer classification/provider-health
boundary. On isolated onboarding delivery failure it deletes only the new token under the same
identity lock and never restores the predecessor; the pending user remains reusable. Other isolated
failures retain the generic accepted response.

**Rationale**: Owning token creation lets user creation, supersession, and candidate metadata commit
atomically before a network call, while NextAuth remains the session owner. The repository already
uses advisory locks for newest-only auth tokens and normalized SMTP outcomes for provider-wide versus
isolated failures.

**Alternatives considered**:

- Invoking the generic NextAuth sign-in route after pending-user creation was rejected because its
  email send and token insert run concurrently and cannot atomically bind the candidate snapshot to
  pending-account creation.
- Restoring an earlier link after delivery failure was rejected because it violates newest-only
  semantics and could revive a link the user believes was superseded.
- A queue or worker was rejected because one bounded SMTP attempt is required in the request and the
  target deployment does not justify another service.

## Activation and Session Establishment

**Decision**: Email links target `GET /api/signup/activate?token=<raw-token>`; no email address is
placed in the public signup URL. The wrapper hashes and validates the token without consuming it,
preserves any different current session and renders localized sign-out guidance, then enters a
server-only signup activation context and delegates a reconstructed email callback request to the
existing NextAuth route. Purpose-aware `useVerificationToken` atomically consumes the current signup
token, activates the pending user, persists its policy snapshot, and returns the adapter token;
NextAuth then creates the standard database session and cookie.

**Rationale**: The standard callback already performs expiry checks, user resolution, session-row
creation, secure cookie issuance, and canonical redirects. Activation inside token consumption means
email verification precedes account activation and session creation follows it. A required activation
context prevents a copied signup token from being used directly through the generic Auth.js callback.
The wrapper can map signup-specific invalid, session-conflict, and post-activation session-failure
outcomes without changing login errors.

**Alternatives considered**:

- Letting the generic callback create or activate unknown users was rejected by the hardened adapter,
  constitution, and feature boundary.
- Creating the session row and cookie manually was rejected because it would duplicate private
  NextAuth cookie/session behavior and become fragile across upgrades.
- Automatically replacing a different session was rejected by clarification; the wrapper must not
  delegate or consume the token in that state.

## Commit-Order Concurrency

**Decision**: Signup issuance and signup-token activation acquire the same transaction-scoped
PostgreSQL advisory lock derived from normalized email and re-read account/token state while holding
it. Signup deletes prior signup-purpose tokens before inserting the new snapshot. Activation succeeds
only when the presented token remains current and the account remains `PENDING`. Once activation
commits, a later signup follows the active-account notice path without mutation.

**Rationale**: The lock also covers the no-row-yet case, where a row lock cannot serialize two first
submissions. Re-reading under one identity lock implements the clarified "commit order wins" rule,
while unique normalized email and policy acceptance constraints provide defense in depth.

**Alternatives considered**:

- Request-arrival timestamps were rejected because arrival order is not a safe commit order across
  replicas or retries.
- Last-write-wins updates without locks were rejected because stale links could activate with stale
  names or policy snapshots.
- Process-local mutexes were rejected because the deployment can have multiple application replicas.

## Login and Adapter Hardening

**Decision**: Update active-user lookup and the hardened adapter's `getUserByEmail` behavior so only
`ACTIVE` users are eligible for generic email login. `createUser` remains an unconditional error.
Login-purpose tokens continue their existing consume/session path. Signup-purpose tokens without the
dedicated activation context fail generically and do not activate or create a session.

**Rationale**: Pending users exist in the canonical `User` table, so route-only filtering is not
enough defense against direct callback construction. Adapter-level filtering keeps login and generic
callbacks from authenticating pending accounts while allowing the dedicated wrapper to activate the
row before NextAuth resolves it.

**Alternatives considered**:

- Relaxing `createUser` was rejected because it would reintroduce implicit registration.
- Filtering only in the login form endpoint was rejected because callback URLs are public and must
  enforce the same lifecycle invariant.

## UI, Localization, and Accessibility

**Decision**: Mirror the existing localized login card and shared controls at `/signup`, `/es/signup`,
and `/ca/signup`, adding name, email, and one native unchecked checkbox whose label contains localized
Terms and Privacy links. Use message catalogs for every field, email, status, conflict, recovery, and
policy label. Use explicit labels/descriptions, `aria-invalid`, reserved error/status regions,
polite/assertive live regions by severity, visible focus, first-invalid-field focus, native links and
checkbox behavior, and at least 24x24 CSS-pixel targets. Enable the currently disabled localized
Signup navigation action without changing Login.

**Rationale**: This preserves the established product shell and avoids a new visual system. Native
semantics satisfy WCAG 2.2 form/error/target requirements with less custom ARIA. Stable dimensions and
the existing max-width auth composition address long translations and mobile overflow.

**Alternatives considered**:

- A combined login/signup toggle was rejected because the product requires distinct flows.
- A custom ARIA checkbox was rejected in favor of the native control.
- A new marketing-style signup page was rejected because public auth already has a coherent,
  task-focused visual pattern.

## Verification Strategy

**Decision**: Use layered tests. Unit/component tests own validation, exact payloads, status mapping,
focus, keyboard behavior, native acceptance semantics, localized messages, and axe. Route tests own
CSRF/limit ordering, response shapes/headers/floor, shared outage behavior, and public parity.
PostgreSQL integration tests own migration invariants, normalized uniqueness, pending reuse,
newest-only tokens, commit-order races, activation, immutable acceptance, provider outcomes, session
failure recovery, and login regressions. A test-only local SMTP server exercises Nodemailer's real
SMTP transport without an external inbox. Playwright against the production standalone artifact owns
localized routes, navigation, the critical browser/cookie/redirect journey, session conflict,
keyboard flow, axe, and exact 375x667/1440x900 overflow checks.

**Rationale**: Authentication and email are critical cross-boundary behavior, so unit tests alone are
insufficient. Keeping concurrency permutations in database integration tests and a small number of
critical browser journeys avoids slow or flaky E2E duplication. The repository already has isolated
database E2E setup, direct session fixtures, axe-core, and desktop/mobile projects.

**Alternatives considered**:

- A real third-party inbox in the default CI gate was rejected because external availability would
  make the authoritative gate non-deterministic; provider-specific live checks may remain optional.
- Browser tests for every validation permutation were rejected because component and route tests are
  cheaper and more diagnostic.
- Mocking all SMTP and Auth.js behavior was rejected because it would not prove the selected provider
  and session boundaries.

## Migration and Recovery

**Decision**: Use one forward-only additive migration. Add nullable normalized email, backfill
`lower(trim(email))`, abort on collisions before adding uniqueness, then make it required; add status
with existing rows `ACTIVE`; add token purpose/metadata with existing rows `LOGIN`; add the unique
acceptance table. Do not invent legacy policy acceptance. Use a forward corrective migration for
schema/data defects and the existing verified logical backup/restore procedure for incompatible or
destructive recovery.

**Rationale**: The rollout preserves every existing login/session and avoids assuming code rollback
reverses schema or data. Collision preflight makes a previously application-only case-insensitive
invariant explicit before enforcing it.

**Alternatives considered**:

- Destructive table replacement was rejected because it creates unnecessary account and token risk.
- Backfilling policy acceptance for legacy users was rejected because no historical consent evidence
  exists.
- Deleting retained pending accounts during rollback was rejected by the specification and forward
  recovery model.