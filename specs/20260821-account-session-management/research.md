# Phase 0 Research: Active Session Management

## Decision 1: Reuse the existing session row as the noncredential model

**Decision**: Use `Session.id` as the opaque selector accepted from the browser and add nullable
immutable `Session.createdAt` for display and age ordering. Keep `authenticatedAt` as mutable recent
authentication evidence and `expires` as displayed expiry. Before this feature the hardened adapter
wrote `authenticatedAt` only at session creation, so the migration may safely copy each non-null
value into `createdAt`; truly unknown legacy values remain null. New sessions initialize both fields
from one captured time, while security reauthentication updates only `authenticatedAt`. Never
display `Session.id`; pass it only as an untrusted action selector.

**Rationale**: The primary key is stable, noncredential, and unrelated to `sessionToken`; ownership
is still rechecked against the server-derived account. Immutable age and mutable freshness become
different facts once reauthentication refreshes an existing row. One nullable timestamp preserves
the clarified unknown-start behavior without collecting device/network data or fabricating legacy
history.

**Alternatives considered**: A new public selector was rejected as redundant state. A hash of
`sessionToken` was rejected because it remains token-derived. Reusing mutable `authenticatedAt` for
ordering was rejected because successful reauthentication would make an old session appear newly
created and change the cap victim. A purpose-specific freshness column was rejected because it
would duplicate the existing general authentication evidence. Showing the primary key was rejected
because it has no user value.

## Decision 2: Define one canonical deterministic session order

**Decision**: The oldest-session order is `createdAt ASC NULLS FIRST`, then `id ASC`. The
newest-session order is its exact inverse: `createdAt DESC NULLS LAST`, then `id DESC`. The
Security page pins the current session first and orders all other sessions newest first. The
database primary key is only a stable tie-breaker and is not interpreted as a timestamp.

**Rationale**: This directly implements the clarified unknown-first rule, remains deterministic for
equal or missing timestamps, and gives migration, creation, listing, and tests one vocabulary. The
explicit null direction avoids database/ORM default differences.

**Alternatives considered**: Expiry order was rejected because it is not session age. Lexically
interpreting CUID values as time was rejected because only stable ordering is guaranteed. Ranking
oldest first and deleting rows after position 20 was rejected because that would preserve the
oldest sessions rather than the newest.

## Decision 3: Enforce the 20-session cap in the hardened Auth.js adapter

**Decision**: Extend `hardenAdapter().createSession` inside its existing transaction-scoped
user advisory lock. At one captured time, count active prior sessions (`expires > now`); if needed,
delete enough oldest prior sessions to leave room for the new session, then create the new session
with that same time as both `createdAt` and `authenticatedAt`. At the normal 20-session boundary
this deletes exactly one oldest prior session. A failed create rolls the eviction back.

**Rationale**: Auth.js remains the sole supported session creator, and the adapter already acquires
`pg_advisory_xact_lock(hashtextextended(userId, 0))`. Reusing that lock serializes creations across
replicas, guarantees the new session survives, and adds no trigger, cache, queue, or process-local
mutex.

**Alternatives considered**: Creating first and relying on timestamp order was rejected because a
future-dated legacy row could displace the new session. A PostgreSQL trigger was rejected as hidden
duplicate business logic when every supported creator already crosses the locked adapter. A
process mutex was rejected because it does not coordinate replicas. Serializable isolation for all
authentication operations was rejected as broader than the keyed lock required.

## Decision 4: Use the same user lock for every revocation action

**Decision**: Individual and bulk services first resolve a preflight session from the trusted
cookie, then begin a transaction, acquire the same user advisory lock, and re-read the exact current
session. They revalidate active account ownership, expiry, and the 10-minute `authenticatedAt`
window before mutation. Individual revocation deletes an owned non-current `Session.id`; bulk
revocation deletes every session for the user except the exact current row.

**Rationale**: Rechecking after the lock closes time-of-check/time-of-use races with session
creation, account deletion, another revocation, and natural expiry. A missing, foreign, current, or
already-revoked individual selector can return the same completed no-op without enumeration. The
transaction makes bulk deletion indivisible and keeps the confirming session usable.

**Alternatives considered**: Trusting the rendered list or client ownership was rejected. Deleting
by `sessionToken` was rejected because credentials must not cross the browser contract. Separate
row locks were rejected because bulk revocation and concurrent creation need one account-wide
ordering boundary.

## Decision 5: Normalize rollout with one forward SQL statement and one index

**Decision**: Add `@@index([userId, expires])` and a migration that first adds
`VerificationPurpose.ACCOUNT_SECURITY` with PostgreSQL's idempotent `IF NOT EXISTS` form outside the
transaction, matching the required enum visibility boundary. A following explicit transaction
adds nullable `Session.createdAt`, copies only non-null pre-feature `authenticatedAt` values into it,
updates the verification-token check constraint, creates the index, ranks active sessions per user
by `createdAt DESC NULLS LAST, id DESC`, and deletes every row ranked after 20 in one SQL statement.
Accounts at or below 20 and expired rows remain unchanged.

**Rationale**: Ranking newest first and deleting `row_number > 20` preserves exactly the clarified
20 newest. One set-based statement is atomic (stronger than the required per-account atomicity),
deterministic, and idempotent in outcome. The composite index bounds active-list and cap lookups by
user without optimizing for forbidden device metadata.

**Alternatives considered**: A row-by-row migration was rejected because partial account cleanup
and retries are harder to reason about. Backfilling a null start was rejected as fabricated history;
only the pre-feature creation-stamped authentication value is copied. Deleting
`row_number > 20` from an oldest-first ranking was rejected because it deletes the newest rows. A
partial index using the current clock was rejected because PostgreSQL cannot use a volatile time
boundary in an immutable index predicate.

## Decision 6: Refresh an existing session with `ACCOUNT_SECURITY`

**Decision**: Add a dedicated `ACCOUNT_SECURITY` verification purpose, localized email, issuance
endpoint, and verification callback. The callback requires a supported trusted cookie resolving to
an unexpired active session for the token's same account. In one transaction it acquires the
normalized-address lock then the user lock, rechecks delivered/unexpired purpose, account, and exact
session, consumes the credential, and updates only that session's `authenticatedAt`. It creates no
session or cookie, changes no session count, carries no selector/action, and redirects to a
credential-free localized Security state. Signed-out, expired-session, and conflicting-account
browsers change nothing and do not consume an otherwise valid credential.

**Rationale**: Purpose isolation prevents login, signup, or account-deletion credentials from being
consumed by the wrong flow. Updating the consuming session ties recent proof to the exact later
confirmation and satisfies the categorical no-revocation rule even when 20 sessions are active. A
second browser remains supported when it already has an active session for the same account.
Dropping the selected action across the callback enforces the refreshed list and second explicit
confirmation.

**Alternatives considered**: Delegating to an Auth.js email-provider callback was rejected because
it creates a new session and cap enforcement would revoke an older session at the 20-session
boundary. Exempting that session would violate the hard cap. Sharing one session credential across
browsers or carrying a temporary revocation grant was rejected as unsafe. Reusing
`ACCOUNT_DELETION` or `LOGIN` was rejected because purpose, copy, callback, and mutation differ.

## Decision 7: Extract only genuinely shared account-session infrastructure

**Decision**: Move cookie parsing, exact active-session lookup, freshness calculation, and supported
cookie-name knowledge from the deletion submodule to a server-only account-session boundary used by
both deletion and security. Keep security issuance, email copy, credential hashing/consumption,
schemas, revocation service, and UI in `src/modules/account/security`; keep deletion-specific
outcomes and cookie expiry behavior in deletion.

**Rationale**: Security must not import infrastructure through `account/deletion`, while duplicating
cookie parsing and freshness rules risks divergent authorization. The narrow extraction preserves
cohesive domain modules and limits regression surface.

**Alternatives considered**: Importing deletion helpers directly was rejected because it reverses
domain ownership. Moving all reauthentication behavior into a generic framework was rejected
because copy, purpose, callback, outcomes, and mutations remain feature-specific. Duplicating the
session-cookie parser was rejected as unsafe drift.

## Decision 8: Use explicit same-origin route-handler contracts

**Decision**: Provide POST routes for reauthentication issuance, individual revocation, and bulk
revocation, plus a GET verification callback. POST bodies contain only Auth.js CSRF proof and locale,
plus an exact action marker for revocation and (for individual revocation) `Session.id`;
reauthentication issuance contains no action marker. Routes validate canonical origin, strict
allowed fields, CSRF, and the server cookie before calling the domain service.
Completed/no-op revocations return the same generic success and the client refreshes the
server-rendered list; a lost response never triggers an automatic mutation retry. The single-use
raw credential necessarily travels in the intentionally delivered inbound verification URL; the
callback never reflects it, uses it as a return value, or emits it to application logs, and every
redirect destination is credential-free.

For POST routes, canonical effective request-URL validation combines with Auth.js CSRF proof. The
email callback is an expected top-level cross-site GET and may have no HTTP `Origin` header (or a
foreign referrer), so it uses the existing `isCanonicalRequestOrigin` semantics: validate only the
externally effective scheme, host, and port from the request URL/trusted ingress headers against
`NEXTAUTH_URL`. It never requires or trusts `Origin`, `Referer`, or a client return URL.

**Rationale**: Route handlers match the existing privileged account flow and make status codes,
`Retry-After`, callback redirects, and network-loss behavior explicit. Server-rendered reads avoid
creating a separate session-list API. Generic success prevents selector enumeration while an
authoritative refresh reconciles success, no-op, and lost-response outcomes.

**Alternatives considered**: Server Actions were rejected because callback, CSRF, status, and
ambiguous-network semantics are clearer as HTTP contracts. Returning session tokens or accepting a
user ID was rejected. Returning the full list from mutation responses was rejected because it
duplicates the protected page read and increases accidental metadata exposure.

## Decision 9: Reuse existing bounded email abuse controls

**Decision**: Reauthentication issuance uses a security-specific client bucket limited to five
requests per 15 minutes and the existing normalized-address bucket limited to three per 15 minutes,
before provider delivery. Revocation itself adds no new rate-limit bucket: it is authenticated,
same-origin, recently authenticated, bounded to at most 20 rows, serialized by user, protected from
duplicate in-flight UI submission, and idempotent on replay.

**Rationale**: Email is the costly public-facing boundary and already has shared multi-replica
limits. A revocation bucket could let unrelated clients sharing the conservative fallback identity
block an account holder's emergency response, while the mutation is already cheap and tightly
authorized.

**Alternatives considered**: No email limits was rejected as provider/resource abuse. A new cache
was rejected because PostgreSQL already shares limiter state. A client-only limit was rejected
because it is bypassable. A revocation rate limit was rejected because it can impede recovery and
does not add meaningful protection beyond bounded locked operations.

## Decision 10: Present a bounded, metadata-minimal accessible list

**Decision**: Render all active sessions (maximum 20) without pagination. Pin Current session first;
order the rest newest first. Each row exposes localized immutable session-start time or Unavailable,
expiry, and a generic ordinal label for accessible distinction, but no identifier, browser, device,
IP, or location. Non-current rows have a revoke command; the current row points to existing sign-out.
Individual and bulk commands use an accessible confirmation dialog whose initial focus is Cancel.

**Rationale**: Twenty rows are bounded on the Raspberry Pi and small enough for one page. Generic
labels and timestamps are honest about what the application knows. Existing Base UI dialog and
account-navigation patterns already provide focus containment, restoration, and responsive
behavior.

**Alternatives considered**: Pagination was rejected by the clarified hard-cap choice. Fabricated
device labels were rejected as misleading. Collecting user-agent/network metadata was rejected as
new personal data. Allowing current-session revocation in this flow was rejected because existing
sign-out owns that action.

## Decision 11: Quiesce legacy writers for a forward-only rollout

**Decision**: Keep the serialized GitHub Actions deployment, but replace its single Compose `up`
with a versioned sequence: build `app` and `migrate`; ensure `db` is healthy; stop and wait for
`app`; remove any completed migrator container; run `migrate` synchronously with `run --rm
--no-deps`; then force-recreate `app` with `up -d --no-deps` and perform the existing health check.
The shell remains fail-fast, so a failed migrator leaves the app stopped. This creates a brief
maintenance window with no application session writer while enum, constraint, index, and
normalization changes apply. Neither code rollback nor backup restore may revive deleted sessions;
disaster restore reapplies all migrations and normalization before traffic resumes.

**Rationale**: The current single `compose up` leaves the old image serving while migration runs;
that image takes the user advisory lock but does not enforce the cap, so it could create session 21
after normalization. Explicit quiescence closes that compatibility race without a trigger or new
service. Building first minimizes downtime, Compose remains the reproducible source of topology,
and session revocation remains an intentional security outcome rather than recoverable business
data.

**Alternatives considered**: Accepting the old-app write window was rejected because it violates
the immediate rollout invariant. A database trigger was rejected as permanent hidden duplication
for a one-deployment compatibility problem. A down migration, compensating session recreation, or
backup restore was rejected as a security regression. A background reconciliation worker was
rejected as delayed and unnecessary. Zero-downtime replacement was rejected because a single app
replica cannot simultaneously run legacy writers and guarantee the new cap without extra database
enforcement.

If failure occurs after the enum statement commits but inside the explicit transaction, PostgreSQL
rolls back the constraint, index, and every normalization deletion while retaining the enum value.
For a transient failure, verify that rollback, mark the Prisma migration rolled back, and rerun; the
idempotent enum addition makes the retry safe. For defective SQL, keep traffic stopped, resolve the
partial migration state through Prisma, and apply a versioned corrective forward migration before
starting the app.

## Decision 12: Verify database, provider, browser, and migration boundaries

**Decision**: Unit-test schemas, canonical ordering, cookie parsing, route mapping, redaction, and UI
states; use live PostgreSQL for ownership, in-place freshness, individual/bulk atomicity, adapter cap
races, and replay; use a schema-isolated migration test that seeds pre-feature rows above/at/below
20 before applying the new SQL; use the existing controlled real-provider HTTP fixture for
security-token delivery and atomic consumption against an existing session; and run Playwright
against the standalone artifact for all locales, 20-row mobile/desktop layout, focus,
already-authenticated cross-device return, revocation, and lost responses.

Feature-owned structured log fields are limited to one fixed sanitized outcome category. This
feature introduces no aggregate counter; timing and retry evidence is asserted from test/client
responses rather than added to feature logs. The standard redacted Pino envelope remains unchanged.

**Rationale**: Unit mocks cannot prove advisory locking, migration ordering, session invalidation,
provider acceptance, real cookies, or unchanged count during reauthentication at the cap. The
repository already has live PostgreSQL, migration, provider, and production-artifact patterns, so
no new test infrastructure is required.

**Alternatives considered**: Unit-only coverage was rejected by the constitution and the critical
authentication boundary. Manual-only migration/provider checks were rejected because deterministic
fixtures exist. External email traffic in CI was rejected in favor of the exact controlled provider
boundary already used by the project.
