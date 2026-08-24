# Phase 0 Research: Personal Data Export

## Decision 1: Keep the feature in the existing account domain and application container

**Decision**: Add a cohesive `src/modules/account/data-export/` module and three internal route
handlers under `src/app/api/account/data-export/`. Keep request, confirmation, snapshot generation,
and download delivery in the existing Next.js application container. Add no package, worker, queue,
cache, object store, volume, or service.

**Rationale**: The export is generated only after an explicit authenticated action, has a hard
30-second generation limit, is capped at 25 MiB by default, and must never be retained. A worker or
archive store would add lifecycle and recovery semantics that contradict direct transient delivery.
The installed stack already provides the database, email, validation, logging, localization, and
HTTP response capabilities required.

**Alternatives considered**: A background job was rejected because it requires retained status and
output. Object storage and temporary files were rejected because the specification forbids a
server-side copy. A separate export service was rejected because it adds an operational boundary
without a scaling or isolation requirement.

## Decision 2: Isolate export proof from authentication freshness

**Decision**: Add `ACCOUNT_DATA_EXPORT` to `VerificationPurpose` and add a separate
`DataExportAuthorization` row keyed one-to-one by `Session.id`. The authorization stores only
`sessionId`, `confirmedAt`, and the credential's original `expiresAt`; the owning account is always
derived through the related active Session. Deleting or revoking the Session cascades the grant.

**Rationale**: Confirmation authorizes only one purpose on one exact active session. A dedicated
row makes that scope explicit and lets revocation fail closed without modifying
`Session.authenticatedAt`, creating an Auth.js session, or granting account-wide freshness. One row
per session supports a later valid confirmation by replacing that session's prior expiry while the
grant remains reusable until expiry as specified.

**Alternatives considered**: Updating `Session.authenticatedAt` was rejected because it would grant
general recent authentication. Adding purpose-specific columns to Session was rejected because it
couples shared authentication state to one account feature. A signed browser cookie was rejected
because server-side revocation and exact-session ownership must remain authoritative. A grant keyed
by User was rejected because it would authorize every session for the account.

## Decision 3: Issue a 15-minute purpose-specific credential without invalidating a working link on delivery failure

**Decision**: Reuse the established 32-random-byte Base64URL credential and one-way
SHA-256-with-`AUTH_SECRET` digest pattern, with a fixed 15-minute expiry, stored locale, and
`deliveredAt` proof. Create the new token provisionally while older delivered export tokens remain
valid. After provider acceptance, take the normalized-email advisory lock, mark the exact token
delivered, and delete other delivered `ACCOUNT_DATA_EXPORT` tokens. If delivery rejects, times out,
or throws, delete only the provisional token. Concurrent successful sends serialize at finalization;
the last provider-accepted finalization leaves the sole usable token.

**Rationale**: This reuses the hardened token and provider-neutral email boundaries while satisfying
the stricter rule that an old usable credential is superseded only after a new email is accepted.
`deliveredAt` prevents callbacks from consuming provisional or crash-left rows. Purpose filtering
prevents login, signup, deletion, or security consumers from accepting the credential.

**Alternatives considered**: Deleting old tokens before the provider call was rejected because a
delivery failure would destroy the user's existing link. Reusing `ACCOUNT_SECURITY` or
`ACCOUNT_DELETION` was rejected because those purposes update freshness or authorize another
operation. Persisting the raw token was rejected because database disclosure would become account
export authorization.

## Decision 4: Use a custom clean callback, never the Auth.js callback

**Decision**: Send a localized link to
`GET /api/account/data-export/verify?token=<credential>&locale=<locale>`. The non-sensitive locale
parameter supplies a safe localized failure destination when the client confirmation limit is
exhausted before token lookup; once a token is inspected, its persisted locale is authoritative.
The route validates the canonical host, consumes the client limit before reading the token, and
redirects immediately to the fixed localized Data & Privacy path with only a generic state. Add
`Referrer-Policy: no-referrer`; never render the token, copy it to another URL, or include it in a
log. The initial email link is the unavoidable single-use credential transport; every callback
redirect and resulting browser URL is credential-free.

**Rationale**: The existing account-security callback proves the required custom route pattern but
updates `authenticatedAt`; the deletion callback delegates to Auth.js and can create a session.
Both effects are explicitly forbidden here. A dedicated callback can bind proof to the exact
already-active session and leave all general authentication state unchanged. A validated locale in
the email link does not carry identity or authority.

**Alternatives considered**: Delegating to Auth.js was rejected because it creates or refreshes
general authentication. A callback that accepts an arbitrary destination was rejected as an open
redirect and token-leak risk. Putting the token in a fragment was rejected because the server
cannot consume it without client-side credential handling. A signed locale blob was rejected
because locale is non-authoritative and has only three accepted values.

## Decision 5: Consume proof and create the exact-session grant atomically

**Decision**: After the confirmation client limit passes, hash and preflight the token only enough
to recover its normalized-email lock key and persisted locale. In one Prisma transaction, acquire
the normalized-email advisory lock and then the User advisory lock, re-read the delivered unexpired
`ACCOUNT_DATA_EXPORT` token, resolve the exact cookie Session and ACTIVE owner, reject a different
account generically, delete exactly one credential, and upsert the authorization for that Session
with the token's unchanged expiry. Any failed postcondition rolls the whole transaction back.

**Rationale**: Existing PostgreSQL advisory locks already serialize purpose-specific token and
session races across application instances. Consuming the token and establishing the grant in one
commit prevents replay, token-without-grant, and grant-without-consumption states. The stable email
then User lock order matches neighboring privileged account operations.

**Alternatives considered**: Separate token-consume and grant-write transactions were rejected
because a crash can split the state. An in-process mutex was rejected because it fails across
instances. Serializable isolation for all account operations was rejected because keyed locks are
narrower and already established. Consuming a token without an active same-account Session was
rejected because the email link is not a bearer download.

## Decision 6: Reuse the shared database limiter with export-specific irreversible keys

**Decision**: Use `RateLimitBucket` through `consumeSharedRateLimit` with a 15-minute window and
separate keys:

- request client: `account:data-export:request:client:<trusted-client>` at 5;
- request account: `account:data-export:request:account:<sha256(normalized-email)>` at 3;
- confirmation client: `account:data-export:verify:client:<trusted-client>` at 5;
- generation session: `account:data-export:generate:session:<sha256(session-id)>` at 3.

The route consumes the client bucket before protected work; request and generation services resolve
the active Session before deriving their non-client key. Every rejection returns generic `429` plus
`Retry-After`. Confirmation rejection occurs before token lookup; generation rejection occurs
before grant lookup invokes any contributor. State remains shared across application instances.

**Rationale**: The existing PostgreSQL upsert makes increments atomic and instance-independent.
Operation-specific keys prevent data export from starving login, deletion, or session recovery.
Hashing normalized email and Session ID avoids readable account/session selectors in persistent
bucket keys while preserving deterministic scope.

**Alternatives considered**: The global auth-email address bucket was rejected because export
requests could block login. One account-wide bucket was rejected because it conflates operations
with different cost and trust boundaries. Memory-only limits were rejected because they are
bypassable across instances and restarts. Raw email, user ID, Session ID, and session token keys
were rejected because they unnecessarily expose selectors or credentials.

## Decision 7: Generate every section from one read-only repeatable snapshot

**Decision**: Start one Prisma interactive transaction with
`Prisma.TransactionIsolationLevel.RepeatableRead`, the active generation timeout, and a bounded
`maxWait`. Make the transaction read-only before contributor queries, set a transaction-local
database statement timeout, and obtain `generatedAt` from the database transaction timestamp.
Pass a narrow `PersonalDataExportReadContext` containing the exact `userId`, transaction client,
snapshot time, and abort signal to each contributor. Run contributors sequentially in sorted
namespace order; all attributable database reads must use that transaction client, and contributors
must not call external services or the global Prisma client.

**Rationale**: Prisma 7.9 and the installed PostgreSQL adapter expose interactive transaction
`isolationLevel`, `maxWait`, and `timeout` options. PostgreSQL REPEATABLE READ gives all contributors
one committed point-in-time view without blocking ordinary writes. Passing the transaction client
through the contract prevents accidental per-contributor snapshots. Sequential execution keeps
ordering, deadline accounting, and constrained-host load predictable.

**Alternatives considered**: Independent contributor queries were rejected because they can mix
committed states. Serializable isolation was rejected because this is a read-only snapshot and does
not need serialization failures. Long-lived table locks were rejected because they impede account
activity. Exporting from a replica was rejected because no replica exists and lag would weaken the
point-in-time claim.

## Decision 8: Define a product-independent contributor contract and explicit composition registry

**Decision**: Define core types for a module declaration, contributor, read context, included
section, and declared unavailable result. Each declaration has one stable namespace, positive
integer schema version, classification metadata, and exactly one contributor. The application
composition root supplies both the declared personal-data namespace inventory and the contributor
list to a registry validator. It rejects missing declarations, missing contributors, duplicate
namespaces, invalid versions/names, and nondeterministic result shapes before generation. Framework
core receives the validated registry by injection and imports no product module.

Built-in declarations use `account`, `policyAcceptances`, and `activeSessions`. A fixture product
module in contract tests demonstrates user-provided, observed, and derived values. Derived
applications extend only the composition inventory and imports; they do not modify the orchestrator.

**Rationale**: Explicit registration is the only reliable boundary compatible with the non-goal of
database-table discovery. Separating the declared namespace inventory from the contributor list
makes a declared-but-unregistered domain fail contract validation. Dependency injection preserves
the framework-to-product direction and makes duplicate/omission tests deterministic.

**Alternatives considered**: Scanning database metadata or source directories was rejected as
fragile automatic discovery. Letting the core import product contributors was rejected as inverted
ownership. A mutable global registration API was rejected because import order can change behavior.
Silently keeping the first duplicate was rejected because it can hide personal data.

## Decision 9: Give empty, unavailable, and failed contributions disjoint results

**Decision**: A contributor returns either an included section or a declared unavailable result.
No records still returns an included section with its schema-defined empty object/array. Unavailable
is accepted only when the module declaration allowlists a fixed non-sensitive reason such as
`not_applicable` or `feature_disabled`; it has no payload. Throws, timeouts, invalid JSON values,
undeclared reasons, and validation failures abort the whole export generically.

**Rationale**: The manifest can be trusted only if runtime failures cannot masquerade as expected
absence. Fixed reason categories explain completeness without leaking operational detail. Explicit
empty sections keep registered domains visible and schema-stable.

**Alternatives considered**: Returning partial data with per-section errors was rejected because it
looks complete. Treating zero records as unavailable was rejected by the clarification. Including
exception text in the manifest was rejected because it can expose schema, infrastructure, or
personal data.

## Decision 10: Use a canonical versioned JSON envelope with independent section versions

**Decision**: Emit envelope version `1` with this stable top-level order:
`schemaVersion`, `generatedAt`, `manifest`, `sections`. The manifest contains lexicographically
ordered `includedSections` entries (`namespace`, `schemaVersion`) and `unavailableSections` entries
(`namespace`, `schemaVersion`, fixed `reason`). Each included namespace maps to
`{ schemaVersion, data }`. Sort namespaces lexicographically, recursively sort object keys, reject
non-JSON values, and require contributors to sort non-identical arrays by documented stable fields.
Use a small internal canonical serializer; add no dependency.

The envelope integer changes only for an incompatible envelope/manifest change. A section integer
changes whenever that section's shape or meaning changes. Adding or revising a section does not
change the envelope version.

**Rationale**: Explicit metadata lets recipients interpret independently evolving sections. A
canonical serializer makes byte ordering testable rather than relying on incidental object
construction order. Identical array items need no hidden-ID tie-break because swapping identical
serialized values does not alter the output.

**Alternatives considered**: A single global version was rejected because product sections evolve
independently. Semantic-version strings were rejected by the integer clarification and suggested
envelope. Native `JSON.stringify` over arbitrary contributor objects was rejected because key order
would depend on construction. A canonical-JSON package was rejected because the required subset is
small and adding a dependency is unnecessary.

## Decision 11: Export only explicit user-meaningful projections

**Decision**: The built-in sections project only these values:

- `account`: user-provided `name`, `email`, and `image`; observed `status`,
  `emailVerifiedAt`, `createdAt`, and `updatedAt`; linked provider connections containing only
  `provider` and `type`, sorted by those included fields;
- `policyAcceptances`: observed accepted terms/privacy versions and acceptance timestamp, or an
  explicit empty object when absent;
- `activeSessions`: observed `createdAt`, `expiresAt`, and `authenticatedAt` plus derived
  `current` and `recentlyAuthenticated`, sorted by the included timestamp tuple. Null legacy
  timestamps remain null.

Group fields by `userProvided`, `observed`, and `derived` where classification helps interpretation.
Exclude every database ID, normalized email, provider account ID, token/secret field, Session ID,
session token, verification credential, grant, rate-limit state, IP, user agent, geolocation,
request value, and diagnostic field.

**Rationale**: Explicit allowlisted projections are auditable and avoid leaking normalized or
internal duplicates. Existing Session data already provides meaningful timestamps and freshness
without collecting new device/network attributes. Provider name/type describes the connection
without exposing credentials or provider-side identifiers.

**Alternatives considered**: Serializing Prisma models was rejected because it exposes internal
fields and future schema additions. Exporting provider account IDs or scopes was rejected because
they are unnecessary to describe a connection. Deriving device/location labels was rejected by the
specification and would require new tracking.

## Decision 12: Buffer, validate, and size the complete export before sending any byte

**Decision**: Apply non-sensitive runtime settings
`ACCOUNT_DATA_EXPORT_MAX_BYTES` (default `26214400`) and
`ACCOUNT_DATA_EXPORT_TIMEOUT_MS` (default `30000`) through the existing validated environment
boundary and deployment Variables. The active timeout covers snapshot acquisition, contributors,
validation, and canonical serialization, but not client transfer. Check the monotonic deadline
between contributors and before response construction; combine it with Prisma transaction timeout,
transaction-local PostgreSQL statement timeout, and an abort signal in the contributor context.
Measure the final UTF-8 byte length and reject values over the active limit.

Only after the transaction succeeds and the complete payload passes validation and size checks does
the route return a buffered attachment with `Content-Type: application/json; charset=utf-8`, an
ASCII non-identifying filename, `Content-Length`, `Content-Disposition: attachment`,
`Cache-Control: no-store, private`, `Pragma: no-cache`, and
`X-Content-Type-Options: nosniff`.

**Rationale**: Sending only after complete validation is the only way to guarantee no apparently
successful partial attachment. At the default cap, bounded in-memory buffering is simpler and safer
than forbidden temporary storage. Database and application deadlines cover both query and
non-query work.

**Alternatives considered**: Streaming was rejected because a late contributor failure or size
breach would leave a partial download. Temporary files were rejected by retention requirements.
Relying only on `Promise.race` was rejected because it does not cancel database work. Relying only
on the Prisma timeout was rejected because it does not independently specify contributor
cooperation or response-size enforcement.

## Decision 13: Expose three strict same-origin route contracts and one accessible panel

**Decision**: Use:

1. `POST /api/account/data-export/request` with only `csrfToken` and `locale`;
2. `GET /api/account/data-export/verify` with one 43-character token and validated locale;
3. `POST /api/account/data-export/download` with only `csrfToken` and `locale`.

POST routes require canonical origin, strict Zod parsing, Auth.js CSRF proof, and the exact active
Session cookie. The request endpoint returns `202` only after provider acceptance. The callback
always redirects to a fixed clean localized Data & Privacy state. The download endpoint returns the
attachment only for the exact unexpired grant; otherwise it uses generic JSON states with no
account detail. The client fetches the attachment, derives the filename only from the allowlisted
header, triggers one browser download, and immediately revokes its temporary object URL.

Add an unframed `DataExportPanel` before the destructive deletion section. Its explicit state
machine covers idle, requesting, sent, generic callback failure, ready with countdown, downloading,
downloaded, expired, rate-limited, and generic failure. Pending actions reject duplicates; status
and errors use appropriate live regions and focus management. All copy comes from the English,
Spanish, and Catalan catalogs.

**Rationale**: Route handlers match current account-action conventions and provide explicit status,
retry, security-header, and attachment control. A separate download POST preserves CSRF protection
and the required second action. The panel fits the existing settings layout without a nested card or
new page.

**Alternatives considered**: A GET download was rejected because an authenticated link could be
prefetched and lacks the existing CSRF command contract. A Server Action was rejected because
attachment headers and failure statuses are clearer through a route. Encoding account identity or
authorization in the browser was rejected because all authority is server-derived.

## Decision 14: Use an additive forward-only migration and fail closed during rollback

**Decision**: Create one migration that adds `ACCOUNT_DATA_EXPORT`, creates
`DataExportAuthorization`, adds its Session foreign key with `ON DELETE CASCADE`, and indexes
`expiresAt` for bounded cleanup/diagnostics. Deploy migration before application code and regenerate
the canonical Prisma client. Previous application code may run against the additive enum/table; it
ignores both. Correct forward if a constraint or index is wrong. Do not down-migrate during normal
rollback.

Outstanding export tokens expire in 15 minutes. Authorization rows become unusable at `expiresAt`
and disappear when their Session is revoked; opportunistic bounded cleanup may remove expired rows
without a worker. Repository backup/restore continues to include the additive table, but no export
payload is ever present in a backup.

**Rationale**: The schema change is additive and preserves the constitution's compatibility and
recovery rules. Failing closed on stale grants is safer than attempting to reconstruct transient
authorization. The existing logical backup/restore path needs no feature-specific payload handling.

**Alternatives considered**: Storing grants in RateLimitBucket was rejected because counters are
not authorization records. A down migration was rejected because schema rollback is not the
project's recovery strategy. A scheduled cleanup worker was rejected because expiry checks and
cascade already enforce correctness.

## Decision 15: Verify database, provider, contract, security, and production behavior at their real boundaries

**Decision**: Use Vitest unit/component tests for token helpers, schemas, canonical serialization,
registry validation, built-in projections, response headers, UI states, accessibility, messages,
and log redaction. Use live PostgreSQL integration tests for provisional-delivery compensation,
supersession races, atomic consume/grant, Session cascade, shared multi-instance limits,
REPEATABLE READ consistency, contributor failure rollback, exact expiry, size/time boundaries, and
forbidden-field scans. Exercise provider acceptance/rejection through the existing real HTTP fixture.

Use Playwright against the standalone production artifact for all three locales, callback cleanup,
same-session and other-same-account-session confirmation, conflicting/signed-out/expired/replayed
links, explicit download, filename/headers/content, keyboard/screen-reader semantics, axe,
375 x 667 mobile and 1440 x 900 desktop, and zero overflow. Add an opt-in Raspberry Pi cohort for
the built-in framework dataset: 10 warm-ups and 100 measured generations, nearest-rank p95 below
2 seconds, while every attempt remains below the hard 30-second limit. Derived applications repeat
capacity validation when overriding size/time limits or adding material contributors.

**Rationale**: Authentication, email, concurrency, consistency, and sensitive output cannot be
proven by mocks alone. The repository already has deterministic provider, live-database, standalone
artifact, accessibility, and ARM64 performance patterns. The 2-second built-in p95 target leaves
substantial headroom under the hard safety limit.

**Alternatives considered**: Unit-only verification was rejected by the constitution. Snapshot-only
JSON tests were rejected because they do not prove transactional consistency or forbidden-data
absence. Manual-only download and accessibility checks were rejected because the journey is
security-critical and reproducible browser coverage is available.

## Decision 16: Emit only fixed non-identifying operational outcomes

**Decision**: Emit structured Pino events for fixed categories such as `export_request_sent`,
`export_request_failed`, `export_verify_completed`, `export_generate_completed`,
`export_generate_denied`, and `export_generate_failed`, with duration only where required to assess
reliability. Never log email, user/Session IDs, raw or hashed tokens, grant state, byte counts,
section counts, retry values, exact filename, contributor payload, namespace supplied by product
code, request body, URL/query, database exception detail, or export content. Keep the existing health
endpoint; no new public metrics endpoint or tracing backend is required.

**Rationale**: Fixed outcomes and aggregate timing support reliability and abuse diagnosis without
turning logs into another personal-data store. Existing Docker/Pino collection already supplies the
required operational path.

**Alternatives considered**: Audit rows were rejected because the specification adds no retained
export history. Logging contributor exceptions or namespaces was rejected because product modules
can embed sensitive or identifying context. Adding a new monitoring service was rejected as
unnecessary infrastructure.
