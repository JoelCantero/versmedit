# Data Model: Personal Data Export

## Data model overview

The account remains rooted in the existing `User` and exact database `Session`. This feature adds
one verification-purpose value and one narrow authorization table. It creates no export file,
archive, request history, audit ledger, background job, account-wide freshness state, device
fingerprint, network record, or product-domain table.

Persistent changes:

1. Add `ACCOUNT_DATA_EXPORT` to `VerificationPurpose`.
2. Add `DataExportAuthorization`, keyed one-to-one by `Session.id` and deleted with that Session.

`VerificationToken` stores only a delivered credential digest and its locale/expiry.
`DataExportAuthorization` stores only exact-session scope and expiry. The generated export,
contributor registry, manifest, and download command are transient application models.

## Schema Delta

```prisma
enum VerificationPurpose {
  LOGIN
  SIGNUP
  ACCOUNT_DELETION
  ACCOUNT_SECURITY
  ACCOUNT_DATA_EXPORT
}

model Session {
  // Existing fields and indexes remain unchanged.
  dataExportAuthorization DataExportAuthorization?
}

model DataExportAuthorization {
  sessionId   String   @id
  confirmedAt DateTime
  expiresAt   DateTime
  session     Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([expiresAt])
}
```

### Migration compatibility

- The enum value, table, relation, and index are additive.
- Existing Users, Sessions, Accounts, tokens, policy acceptances, and rate-limit buckets are not
  rewritten or backfilled.
- Existing Sessions start with no export authorization and remain unchanged for every other
  authentication/account behavior.
- The migration is deployed before application code and the generated Prisma client is rebuilt from
  `prisma/schema.prisma`.
- Previous compatible application code may run against the additive schema during application
  rollback; it ignores the new enum value and table.
- A faulty constraint/index is corrected forward. Normal rollback does not drop the enum value or
  table and never claims to reverse data.
- Logical backup/restore automatically includes authorization rows but never includes generated
  export payloads because no payload is persisted.

## Existing Entity: User

| Field | Existing type | Export use | Rule |
|---|---|---|---|
| `id` | String, primary key | Server-only ownership, snapshot selector, and advisory-lock key | Derived through exact active Session; never accepted from client or exported |
| `name` | Nullable string | User-provided profile value | Export unchanged; null remains null |
| `email` | String, unique | Authoritative confirmation recipient and user-facing profile value | Recipient is server-derived; exported email is never logged |
| `normalizedEmail` | String, unique | Token identifier, account rate-limit input, and advisory-lock key | Never exported because `email` is the meaningful value |
| `emailVerified` | Nullable date/time | Observed verification timestamp | Export as `emailVerifiedAt`; null remains null |
| `image` | Nullable string | User-provided profile image value | Export value only; do not fetch or embed remote content |
| `status` | `PENDING` or `ACTIVE` | Eligibility and observed status | Only `ACTIVE` owners with an active Session may request, confirm, or download |
| `createdAt`, `updatedAt` | Date/time | Observed account timestamps | ISO 8601 UTC strings in export |
| `accounts` | `Account[]` | Linked provider connection summaries | Selected through the same snapshot; credentials/IDs excluded |
| `sessions` | `Session[]` | Active-session summary | Only rows with `expires > generatedAt` are included |
| `policyAcceptance` | Optional record | Accepted policy summary | Explicit empty section when absent |

### User eligibility lifecycle

```text
ACTIVE + unexpired exact Session
  -> request allowed subject to limits/provider
  -> confirmation allowed only for same account
  -> generation allowed only with exact unexpired grant

PENDING, absent User, expired/revoked Session, or mismatched account
  -> generic denial
  -> no token consumption, grant, or export
```

No account status changes during this feature.

## Existing Entity: Account (Provider Connection Projection)

The schema does not change. The `account` contributor selects only:

| Existing field | Exported name | Classification | Rule |
|---|---|---|---|
| `provider` | `provider` | Observed | Export unchanged |
| `type` | `type` | Observed | Export unchanged |

The contributor excludes `id`, `userId`, `providerAccountId`, `refresh_token`, `access_token`,
`expires_at`, `token_type`, `scope`, `id_token`, `session_state`, and future fields unless a later
section-version review explicitly allowlists them. Connections sort by `provider`, then `type`.
Duplicate projected values serialize identically and therefore do not need a hidden-ID tie-break.

## Existing Entity: Session (Related, Not Modified Otherwise)

| Field | Existing type | Export/authorization use | Rule |
|---|---|---|---|
| `id` | String, primary key | Grant foreign key, current-session comparison, generation rate-limit input | Never exported, sent to browser, or logged |
| `sessionToken` | String, unique | Exact cookie authorization lookup | Server-only credential; never exported or accepted in body |
| `userId` | String | Ownership relation | Must match the active User at every protected boundary |
| `expires` | Date/time | Session eligibility and observed export value | Must be later than checked/snapshot time |
| `createdAt` | Nullable date/time | Observed session-start evidence | Export null when legacy value is unavailable |
| `authenticatedAt` | Nullable date/time | Observed freshness evidence | Read only; export confirmation never updates it |
| `dataExportAuthorization` | Optional relation, new | Exact-session export grant | Cascade-deleted with Session |

### Active-session projection

Each exported element contains no selector or device inference:

```json
{
  "observed": {
    "createdAt": null,
    "expiresAt": "2026-08-23T12:00:00.000Z",
    "authenticatedAt": "2026-08-23T10:00:00.000Z"
  },
  "derived": {
    "current": true,
    "recentlyAuthenticated": true
  }
}
```

- `current` compares the snapshot row to the exact confirming Session server-side.
- `recentlyAuthenticated` uses the existing 10-minute rule at `generatedAt`; it is descriptive and
  grants no export or other privilege.
- Sort by included `createdAt` (null last), `expiresAt`, `authenticatedAt` (null last), `current`,
  then canonical serialized value. Equal projected values are byte-identical.
- IP, geolocation, user agent, fingerprint, device/browser/OS labels, Session ID, and token are not
  selected.

## Existing Entity: VerificationToken (Reused)

| Field | Existing type | Export-confirmation use | Validation/mutation rule |
|---|---|---|---|
| `identifier` | String | Normalized account email | Derived from exact Session owner; never client-supplied |
| `token` | String, unique | SHA-256 digest of 32 random bytes plus runtime secret | Raw 43-character Base64URL value exists only in email/callback request |
| `expires` | Date/time | Credential and grant ceiling | Exactly 15 minutes after issuance; never extended |
| `purpose` | Enum | `ACCOUNT_DATA_EXPORT` | Every other consumer rejects this purpose |
| `locale` | Nullable string | Localized email and clean return | Required for export token; exactly `en`, `es`, or `ca` |
| `deliveredAt` | Nullable date/time | Provider-acceptance proof | Callback rejects null; set only after accepted delivery |
| `createdAt` | Date/time | Internal issuance ordering/diagnostics | Not exported or logged with identity |

### Credential derived states

```text
absent
  -> authenticated request + limits pass -> provisional (deliveredAt = null)

provisional
  -> provider rejects/times out/throws -> deleted; prior delivered token remains
  -> provider accepts + finalization wins -> delivered; other delivered export tokens deleted
  -> process interruption -> remains unusable and expires

delivered
  -> exact active same-account confirmation -> deleted exactly once + grant committed
  -> later accepted issuance finalizes -> deleted as superseded
  -> expires -> invalid (bounded cleanup may delete later)

deleted/expired
  -> replay -> generic invalid outcome; no grant
```

- Provisional creation, delivery, and finalization are separate because no database transaction is
  held across the provider request.
- Provider finalizations serialize under the normalized-email advisory lock. The last accepted
  finalization leaves one delivered token; it deletes only other delivered export tokens, not
  unrelated purposes.
- Failed delivery compensates only the exact provisional token and cannot invalidate a prior usable
  export link.
- A delivered token presented by a signed-out, expired, revoked, or conflicting Session is not
  consumed and remains usable by an eligible same-account Session until expiry or supersession.

## New Entity: DataExportAuthorization

| Field | Type | Required | Rule |
|---|---|---|---|
| `sessionId` | String, primary/foreign key | Yes | Exact consuming Session; one grant per Session; server-only |
| `confirmedAt` | Date/time | Yes | Successful atomic confirmation time; must be no later than `expiresAt` |
| `expiresAt` | Date/time | Yes | Copied unchanged from consumed token; cannot exceed 15 minutes after token issuance |
| `session` | Relation | Yes | `ON DELETE CASCADE`; owner is derived through Session -> User |

### Authorization derived states

```text
absent
  -> valid token consumed by exact same-account active Session -> ready

ready (Session active and checkedAt < expiresAt)
  -> explicit generation -> ready (grant is reusable; generation rate limit still applies)
  -> later valid confirmation in same Session -> ready with replacement credential expiry
  -> expiresAt reached -> expired
  -> Session expires/revoked/deleted -> absent by authorization check/cascade

expired
  -> request/generation -> generic not-ready; no contributor invoked
  -> bounded opportunistic cleanup -> absent
```

### Invariants

- The row contains no raw/digested credential, email, User ID, export content, filename, locale,
  contributor list, general freshness marker, or rate-limit state.
- `sessionId` is never accepted from the browser. It comes only from the exact supported Session
  cookie lookup.
- Eligibility always joins/rechecks Session expiry, User ownership, and `User.status = ACTIVE`; the
  presence of a row alone is insufficient.
- Confirmation never inserts/updates Session, sets a cookie, or changes `authenticatedAt`.
- Grant expiry is the consumed token's original expiry, not confirmation time plus 15 minutes.
- A successful download does not consume the grant. Up to the three permitted generation attempts
  may produce independent snapshots before expiry.

## Existing Entity: PolicyAcceptance

No schema change. The `policyAcceptances` section contains one included object or its explicit empty
shape:

```json
{
  "observed": {
    "termsVersion": "...",
    "privacyVersion": "...",
    "acceptedAt": "2026-08-23T10:00:00.000Z"
  }
}
```

The contributor excludes `id`, `userId`, and duplicate `createdAt` when `acceptedAt` is the
meaningful acceptance time.

## Existing Entity: RateLimitBucket

The schema does not change. All windows are 15 minutes and use the existing atomic PostgreSQL
upsert.

| Scope | Key prefix and irreversible input | Limit | Must reject before |
|---|---|---:|---|
| Request client | `account:data-export:request:client:` + trusted-client key | 5 | Body/session/provider work beyond standard route checks |
| Request account | `account:data-export:request:account:` + SHA-256 normalized email | 3 | Credential creation and provider delivery |
| Confirmation client | `account:data-export:verify:client:` + trusted-client key | 5 | Token hash/lookup/consume |
| Generation Session | `account:data-export:generate:session:` + SHA-256 Session ID | 3 | Grant lookup that invokes contributors and snapshot generation |

- An exhausted bucket returns a generic localized wait state and `Retry-After`.
- Export-specific buckets do not consume or delete login, signup, deletion, security, provider, or
  global buckets.
- Keys/counters are never included in the export or application logs.
- Cleanup remains the existing probabilistic bounded expiry cleanup; correctness never depends on
  immediate deletion.

## Transient Model: PersonalDataModuleDeclaration

| Field | Type | Required | Rule |
|---|---|---|---|
| `namespace` | Stable namespaced string | Yes | Unique, validated, and immutable within a section version |
| `schemaVersion` | Positive integer | Yes | Increment whenever shape or meaning changes |
| `classifications` | Array of fixed values | Yes | Subset of `user_provided`, `observed`, `derived` |
| `unavailableReasons` | Array of fixed values | Yes | Expected non-error categories only; may be empty |

The application composition root supplies a declared namespace inventory and matching contributor
list. Registry construction rejects missing declaration/contributor pairs, extras, duplicates,
invalid names/versions, or mutable global registration. Framework built-ins are:

| Namespace | Version | Data owner |
|---|---:|---|
| `account` | 1 | Profile plus linked authentication-provider summaries |
| `policyAcceptances` | 1 | Accepted terms/privacy versions and time |
| `activeSessions` | 1 | Active session timestamps and derived current/freshness evidence |

Product modules add declarations only at the composition root; the orchestrator imports none of
them.

## Transient Model: PersonalDataExportContributor

```text
contribute(readContext)
  -> included { data }
  -> unavailable { reason }
  -> throws/rejects/invalid output (whole export fails)
```

The read context contains only:

| Value | Rule |
|---|---|
| `userId` | Exact active owner selector; server-only |
| `currentSessionId` | Exact current Session for derived `current`; never exported |
| `generatedAt` | Database transaction timestamp shared by all sections |
| `transaction` | The one read-only REPEATABLE READ transaction client; global DB client forbidden |
| `signal` | Shared generation deadline signal; contributors must fail on cancellation |

Contributor rules:

- Query only account-attributable committed data through `transaction`.
- Do not call remote services, write state, log payloads, or open a nested transaction.
- Return JSON-compatible structured data; no Date, bigint, undefined, function, symbol, non-finite
  number, prototype-bearing class instance, or cyclic value crosses the boundary.
- Sort every non-identical array by documented stable included fields.
- No-record results are included empty sections, never unavailable.
- Unavailable requires an allowlisted declaration reason and no payload.
- Any exception, timeout, invalid value, undeclared reason, or version/namespace mismatch aborts the
  complete export generically.

## Transient Model: PersonalDataExportEnvelope Version 1

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-23T10:00:00.000Z",
  "manifest": {
    "includedSections": [
      { "namespace": "account", "schemaVersion": 1 }
    ],
    "unavailableSections": []
  },
  "sections": {
    "account": {
      "schemaVersion": 1,
      "data": {}
    }
  }
}
```

### Canonical ordering and version rules

1. Top-level keys: `schemaVersion`, `generatedAt`, `manifest`, `sections`.
2. Manifest keys: `includedSections`, then `unavailableSections`.
3. Both manifest arrays sort lexicographically by namespace.
4. Section object keys sort lexicographically by namespace.
5. Each section wrapper orders `schemaVersion`, then `data`.
6. Nested object keys sort lexicographically; contributor arrays obey their section contract.
7. Included manifest entries exist for explicit empty sections. Unavailable namespaces have no
   `sections` entry.
8. Envelope version changes only for incompatible envelope/manifest shape or meaning. Adding or
   revising an independent section leaves envelope version unchanged.
9. Section version changes whenever that section's shape or meaning changes.

The completed canonical string must encode to no more than the active byte limit (default
26,214,400 bytes) in UTF-8.

## Transient Model: Export Commands and UI Projection

### Request command

| Field | Type | Required | Rule |
|---|---|---|---|
| `csrfToken` | String | Yes | Must match signed Auth.js CSRF cookie |
| `locale` | `en`, `es`, `ca` | Yes | Email/presentation only; grants no identity |

### Download command

Same fields and validation as request. It contains no user ID, Session ID/token, grant, scope,
contributors, filename, size/time limit, or authorization claim.

### Server-rendered panel projection

| Field | Type | Rule |
|---|---|---|
| `authorizationState` | `absent`, `ready`, `expired` | Derived from exact Session relation and checked time |
| `expiresAt` | Nullable ISO timestamp | Present only when ready; used for localized countdown |
| `locale` | Supported locale | Derived from route |

The projection includes no email, identity, credential, or export content.

## Atomic Issuance Finalization

1. Request route validates canonical request URL, strict body, CSRF, and 5/client limit.
2. Service resolves exact active Session/User, then consumes 3/account limit.
3. Under normalized-email and User advisory locks, revalidate Session/User and create one
   provisional digest without deleting a prior delivered export token.
4. Call the existing provider once outside the transaction.
5. On rejection/timeout/error, delete only the exact provisional token under the same locks.
6. On acceptance, under the same locks, require the exact provisional row, set `deliveredAt`, then
   delete every other delivered `ACCOUNT_DATA_EXPORT` token for that identifier.
7. Commit and return `sent`. A concurrent later accepted finalization becomes the sole delivered
   credential.

No provider call occurs while a transaction or advisory lock is held.

## Atomic Confirmation Transaction

1. Callback validates canonical request URL, locale shape, token shape, and 5/client limit.
2. Hash token; preflight exact purpose/identifier/locale without mutation.
3. Begin transaction and acquire normalized-email then User advisory locks.
4. Re-read exact delivered, unexpired `ACCOUNT_DATA_EXPORT` token.
5. Resolve exact supported Session cookie; require unexpired Session, ACTIVE User, and owner match.
6. Delete exact token with all purpose/identifier predicates; require count 1.
7. Upsert `DataExportAuthorization` for exact `Session.id` with `confirmedAt = checkedAt` and
   `expiresAt = storedToken.expires`.
8. Commit and redirect to credential-free localized ready state.

Every failure before commit leaves an otherwise valid credential usable until expiry/supersession.
A conflicting account receives the same generic page outcome as other invalid attempts.

## Read-Only Snapshot Transaction

1. Download route validates canonical request URL, strict body, CSRF, active Session, and
   3/Session generation limit.
2. Begin an interactive Prisma transaction with REPEATABLE READ, bounded `maxWait`, and active
   generation timeout.
3. Make the transaction read-only; set transaction-local statement timeout.
4. Re-read ACTIVE User, exact unexpired Session, and authorization with
   `checkedAt < expiresAt`; contributors have not run before this point.
5. Read the database transaction timestamp as the one `generatedAt`.
6. Invoke validated contributors sequentially in lexicographic namespace order through the
   transaction client and shared deadline signal.
7. Validate results, build manifest/envelope, canonicalize, and measure UTF-8 bytes inside the
   transaction callback.
8. If time, size, contributor, or validation fails, roll back/read-end and return generic failure
   with no response attachment.
9. Commit the read-only transaction. Only then construct the buffered attachment response.

The default timeout is 30,000 ms and default completed payload cap is 26,214,400 bytes. Client
transfer time is outside generation time. No export bytes are sent before step 9 succeeds.

## Data Invariants

- Every successful file represents one committed database snapshot for one ACTIVE account.
- No successful export contains data selected with another User ID.
- Token consume and exact-session grant creation either both commit or neither does.
- Revoking/deleting/expiring a Session immediately makes its grant unusable; database deletion
  cascades the grant.
- Expired grants may remain physically until cleanup but never authorize generation.
- Export confirmation does not create a Session/cookie or alter general freshness.
- A newer credential expiry never extends from confirmation time.
- One delivered export credential per normalized email is the steady state; provisional rows are
  unusable.
- Every declared domain is included empty, included with data, or declared unavailable; runtime
  failure never becomes unavailable.
- No export payload, partial payload, or filename is persisted, queued, emailed, backed up, or
  logged.
- No response/log reveals token, account/session selector, contributor payload, internal error,
  forbidden field, or whether a conflicting account exists.
