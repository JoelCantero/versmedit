# Data Model: Active Session Management

## Overview

This feature reuses the existing `User`, `Session`, `VerificationToken`, and `RateLimitBucket`
records. It adds one verification-purpose enum value, one nullable immutable session-start field,
and one session lookup index; it adds no audit table, device fingerprint, IP address, user-agent,
geolocation, intent row, worker record, or recovery ledger.

`Session.id` is the existing noncredential action selector. `Session.sessionToken` remains the only
session credential and never crosses the server/browser data boundary. New `Session.createdAt`
provides immutable display/ordering age, while `Session.authenticatedAt` remains mutable freshness
evidence. Both remain nullable where legacy facts are genuinely unknown.

## Enumeration Delta

### VerificationPurpose

| Value | Ownership | Usage |
|---|---|---|
| `LOGIN` | Existing login flow | Ordinary existing-account sign-in |
| `SIGNUP` | Existing signup flow | Pending-account activation |
| `ACCOUNT_DELETION` | Existing deletion flow | Fresh authentication before permanent deletion |
| `ACCOUNT_SECURITY` | This feature | Fresh authentication before individual or bulk session revocation |

Purpose checks are exact. An `ACCOUNT_SECURITY` credential cannot be consumed by login, signup, or
deletion, and none of those credentials can authorize account-security reauthentication.

## Existing Entity: User

No schema change.

| Field | Role in this feature |
|---|---|
| `id` | Server-derived account ownership key and advisory-lock key |
| `email` | Server-derived reauthentication recipient; never accepted from the browser |
| `normalizedEmail` | Exact verification-token and shared address-rate-limit key input |
| `status` | Must be `ACTIVE` for listing, reauthentication, or revocation |
| `sessions` | One-to-many authorization grants; at most 20 may be active |

The account holder is resolved through the exact current database session. A request body never
supplies `User.id`, email, normalized email, status, ownership, or permission.

## Existing Entity: Session

### Canonical fields

| Field | Type | Rules and feature usage |
|---|---|---|
| `id` | String, primary key | Stable opaque noncredential selector and deterministic tie-breaker; sent only as an untrusted individual-action value, never rendered or logged |
| `sessionToken` | String, unique | Secret Auth.js credential read only from supported server cookies; never selected into list output or accepted in JSON |
| `userId` | String, foreign key | Ownership relation to `User`; rechecked under the user advisory lock before mutation |
| `expires` | DateTime | A session is active only when `expires > checkedAt`; expiry is displayed in the active locale |
| `createdAt` | Nullable DateTime | Immutable reliable session-start time; initialized for every new session, backfilled only from trustworthy pre-feature creation-stamped evidence, null renders as unavailable and ranks oldest |
| `authenticatedAt` | Nullable DateTime | Latest successful authentication time and recent-auth evidence; initialized at creation and refreshed in place after valid security email proof; never used as session age |

### Schema delta

Add the nullable field and canonical index equivalent to:

```prisma
createdAt DateTime?

@@index([userId, expires])
```

The user prefix bounds list, active-count, and eviction candidate queries. Ordering the maximum 20
matching rows by immutable creation time and ID is deliberately kept simple rather than adding a
larger metadata-oriented index.

### Derived states

| State | Derivation | Behavior |
|---|---|---|
| Active | Owning user is active and `expires > checkedAt` | Listed and counted toward the cap |
| Expired | `expires <= checkedAt` | Not listed, not counted, and cannot authorize |
| Current | Active row whose `sessionToken` equals the single trusted account cookie | Pinned first; preserved by bulk action; unavailable for individual revocation |
| Other | Active owned row that is not current | Eligible for individual or bulk revocation |
| Recently authenticated | `authenticatedAt` is not null, not future-dated, and no more than 10 minutes before `checkedAt` | May confirm revocation |
| Stale | Authentication time is null, future-dated, or older than 10 minutes | Must complete fresh email authentication before selecting and confirming again |
| Revoked | Row deleted | Fails the next protected authorization check; no tombstone is retained |

### Canonical ordering

- **Oldest first**: `createdAt ASC NULLS FIRST`, then `id ASC`.
- **Newest first**: `createdAt DESC NULLS LAST`, then `id DESC`.
- **Page order**: exact current row first, then all other active rows newest first.

The ID tie-breaker is stable but has no temporal or user-visible meaning.

### Account-wide invariants

1. No account has more than 20 active sessions after rollout.
2. The session being newly established is never selected as its own cap victim.
3. Individual revocation never removes the exact current session.
4. Bulk revocation leaves exactly the current session row for that account.
5. All creation and revocation transactions use the same user-scoped advisory lock.
6. Expired retained rows do not consume an active-session slot.

## Existing Entity: VerificationToken

No new column. An account-security credential uses the existing fields as follows:

| Field | ACCOUNT_SECURITY rule |
|---|---|
| `identifier` | Normalized email derived from the exact active session |
| `token` | Persisted one-way digest of a 32-byte random browser/email credential; globally unique |
| `expires` | Ten minutes after issuance |
| `purpose` | Exactly `ACCOUNT_SECURITY` |
| `locale` | Exactly one of `en`, `es`, or `ca` |
| `deliveredAt` | Null while provisional; set only after provider acceptance; required for callback consumption |
| `createdAt` | Server issuance time |
| Signup snapshot fields | All null |

The existing verification-token check constraint gains an `ACCOUNT_SECURITY` branch requiring the
localized, non-signup shape. Only the newest security credential for a normalized address remains;
provider failure compensates that exact provisional row without restoring a predecessor.

### Verification lifecycle

```text
absent
  -> provisional (stored digest, deliveredAt null)
  -> delivered (provider accepted, deliveredAt set)
   -> consumed (deleted atomically while one existing same-account session is refreshed)
```

Failure, expiry, supersession, wrong purpose, missing/expired current session, conflicting account,
or replay creates no session and changes no freshness evidence. Successful consumption updates the
exact active session represented by the callback browser's trusted cookie. It creates no custom
authorization row, `Session`, or cookie and cannot invoke cap eviction.

## Existing Entity: RateLimitBucket

No schema change.

| Bucket | Limit | Scope and lifecycle |
|---|---|---|
| `account:security:reauth:client:<trusted-client-key>` | 5 per 15 minutes | Shared across replicas; retained after successful reauthentication/revocation |
| Existing hashed normalized-address bucket | 3 per 15 minutes | Shared with login/signup/deletion email issuance; contains no raw address |

Revocation confirmations add no bucket because they are authenticated, same-origin, recently
authenticated, bounded to at most 20 rows, user-lock serialized, duplicate-disabled in flight, and
idempotent on replay.

## Transient Contract: SessionListItem

Not persisted.

| Field | Type | Rules |
|---|---|---|
| `sessionId` | String | `Session.id`; action selector only, never rendered or logged |
| `createdAt` | ISO timestamp or null | Immutable start projected for localized presentation; null means unavailable |
| `expires` | ISO timestamp | Localized only at presentation |
| `current` | Boolean | Computed by exact trusted cookie/session match; never accepted back as authority |
| `ordinal` | Positive integer | Presentation-only accessible distinction; carries no device inference |

The server selects no token, email, user ID, network value, or device value into this contract.

## Transient Contract: RevocationCommand

Not persisted.

| Field | Individual | Bulk | Trust rule |
|---|---|---|---|
| `csrfToken` | Required | Required | Must match the signed Auth.js CSRF cookie |
| `locale` | Required | Required | Must be `en`, `es`, or `ca`; affects copy/redirect only |
| `confirmation` | `revoke_session` | `revoke_other_sessions` | Exact allowlisted action marker |
| `sessionId` | Required opaque string | Forbidden | Untrusted selector; ownership/current checks happen under lock |

Unknown fields, duplicate JSON fields, user IDs, emails, session tokens, ownership flags, and
authorization claims are rejected before domain work.

## Transaction and State Transitions

### Establish a session at the cap

1. Start one transaction and acquire the user advisory lock.
2. Capture one `checkedAt` value and count prior rows with `expires > checkedAt`.
3. If the prior count is 20, select and delete exactly the oldest prior active row.
4. If defensive cleanup finds a pre-existing over-cap state, delete enough oldest prior rows to
   leave 19 active slots.
5. Create the new Auth.js row with `createdAt = authenticatedAt = checkedAt`.
6. Commit; any failure restores every evicted row and creates no session.

### Revoke one other session

1. Resolve current token/account preflight from the cookie.
2. Start one transaction and acquire the user advisory lock.
3. Re-read current session, active user, expiry, and recent-auth evidence.
4. Delete only a row matching the untrusted `sessionId`, current `userId`, and not-current `id`.
5. Return the same completed outcome for one deletion or a missing/foreign/current no-op.
6. Refresh the authoritative server-rendered list; never replay automatically after network loss.

### Revoke all other sessions

1. Perform the same locked current-session and recent-auth revalidation.
2. Delete every `Session` for the current `userId` except the exact current `id` in one operation.
3. Commit with the current row as the sole remaining session for that account.

### Refresh authentication evidence

1. Resolve the raw credential and trusted session cookie preflight without consuming either.
2. Require an existing unexpired session whose active account matches the credential identifier.
3. Start one transaction; acquire the normalized-address lock, then the same user lock used by
   session creation/revocation.
4. Re-read the exact session, active account, and delivered unexpired `ACCOUNT_SECURITY` token.
5. Delete that exact token and update only that session's `authenticatedAt` to one captured time.
6. Commit with the session row/token/cookie count unchanged and no revocation. Any failure rolls
   back both token consumption and freshness update; a valid token presented without an eligible
   session remains available for an eligible browser until expiry or supersession.

### Rollout normalization

The forward migration first copies non-null pre-feature `authenticatedAt` into nullable `createdAt`;
those values are reliable because the old adapter wrote them only during creation. Null legacy
starts remain null. It then ranks only unexpired rows per `userId` by immutable newest-first order
and deletes rows with rank greater than 20 in one set-based statement. Accounts at/below 20 and
expired rows are unchanged. The statement is safe to retry in outcome and fabricates no timestamp.

## Migration and Recovery

1. Add `ACCOUNT_SECURITY` outside the explicit transaction using PostgreSQL `IF NOT EXISTS`, so the
   new enum value is committed and visible before a check constraint references it.
2. Build the new app and migrator images, then stop and wait for the legacy app before applying the
   data migration so a legacy session writer cannot race normalization.
3. In a transaction, add nullable `Session.createdAt`, backfill only known pre-feature creation
   values, update the token check constraint, add the session lookup index, and execute normalization
   while no application writer is running.
4. Start the new app only after the one-shot migrator succeeds, then complete the existing health
   check. This is an intentional brief maintenance window on the single-replica deployment.
5. Regenerate the Prisma client from `prisma/schema.prisma`.
6. Verify a schema-isolated upgrade with accounts above, at, and below 20 plus null/equal times.
7. If the transactional portion fails after the enum commit, the constraint, index, and all session
   rows remain unchanged and the app remains stopped. After verifying rollback, a transient failure
   may be marked rolled back through Prisma and safely rerun because the enum addition is idempotent;
   defective SQL uses a versioned corrective forward migration before traffic resumes.
8. If normalization succeeds, neither code rollback nor backup restore recreates revoked sessions.
   A disaster restore reapplies all migrations and normalization before traffic resumes.

No down migration is defined. The additive enum/nullable field/index remain compatible with prior
application code, but production fixes move forward.
