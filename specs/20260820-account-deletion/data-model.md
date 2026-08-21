# Data Model: Permanent Account Deletion

## Overview

The account remains rooted in the existing `User` record. This feature adds no deletion ledger,
tombstone, recovery envelope, or persistent intent record. It makes two additive schema changes:

1. Add `ACCOUNT_DELETION` to `VerificationPurpose` so a fresh-authentication credential cannot be
   consumed as ordinary login or signup.
2. Add nullable `Session.authenticatedAt` so the exact session authorizing deletion can prove a
   successful authentication within the previous 10 minutes.

All other deletion behavior uses existing records and foreign keys. Browser intent and
lost-response recovery are transient, non-authoritative models.

## Schema Delta

```prisma
enum VerificationPurpose {
  LOGIN
  SIGNUP
  ACCOUNT_DELETION
}

model Session {
  // Existing fields remain unchanged.
  authenticatedAt DateTime?
}
```

### Migration compatibility

- The enum value and nullable column are additive.
- Existing sessions receive `authenticatedAt = null`; they cannot authorize deletion until fresh
  authentication succeeds.
- New Auth.js database sessions set `authenticatedAt` at creation time.
- No index is added because the session is selected by unique `sessionToken` before checking time.
- Previous compatible application code may run against the additive schema during a rollback, but
  deployed schema is corrected forward rather than migrated down.
- Prisma client output is regenerated from `prisma/schema.prisma`; existing generated files that
  mention undeclared deletion models are stale and are not migration input.

## Existing Entity: User

| Field | Existing type | Feature use | Rule |
|---|---|---|---|
| `id` | String, primary key | Server-only ownership and user-scoped lock key | Derived through the exact database session; never accepted from client input |
| `email` | String, unique | Auth.js provider recipient | Never returned by deletion endpoints or logged |
| `normalizedEmail` | String, unique | Verification-token identifier, email-scoped lock, and address-bucket derivation | Canonical lowercase/trimmed value loaded from the database |
| `status` | `PENDING` or `ACTIVE` | Eligibility boundary | Only `ACTIVE` users may request or complete self-deletion |
| `accounts` | `Account[]` | Linked authentication identities | Removed by existing `ON DELETE CASCADE` |
| `sessions` | `Session[]` | All device authorization grants | Removed by existing `ON DELETE CASCADE` |
| `policyAcceptance` | Optional `PolicyAcceptance` | Attributable policy record | Explicitly deleted before User because the relation is `ON DELETE RESTRICT` |

### User lifecycle

```text
ACTIVE
  -> deletion confirmation with missing/stale authentication -> ACTIVE (no data change)
  -> any transaction/delivery failure -> ACTIVE (no data change)
  -> successful atomic deletion -> absent

absent
  -> replay with revoked session -> unauthenticated (no state recreated)
  -> later normal signup with same email -> new independent User
```

There is no deleted state. Successful deletion removes the row.

## Existing Entity: Session (Modified)

| Field | Type | Feature use | Validation |
|---|---|---|---|
| `id` | String, primary key | Internal row identity and optional lock/debug correlation | Never exposed |
| `sessionToken` | String, unique | Exact cookie-to-session authorization lookup | Read only from trusted HTTP cookies; never accepted in body or logged |
| `userId` | String | Relationship to target User | Must match the User loaded through this exact session |
| `expires` | Date/time | Normal Auth.js validity | Must be later than the database/application current time |
| `authenticatedAt` | Nullable date/time, new | Recent-authentication evidence | Must be non-null and no earlier than 10 minutes before final confirmation |

### Session rules

- Hardened Auth.js session creation writes `authenticatedAt = now` and takes the user-scoped
  transaction lock before inserting the row.
- Existing null timestamps are deliberately stale.
- Final deletion re-reads the exact cookie session inside the transaction after locks are acquired.
- Deleting User cascades every session, including the session that authorized deletion and sessions
  on other devices.
- The HTTP success response expires supported Auth.js session-cookie variants in the initiating
  browser; database deletion remains authoritative if cookie expiry is not received.

## Existing Entity: VerificationToken (Reused)

| Field | Existing type | Feature use | Validation / mutation rule |
|---|---|---|---|
| `identifier` | String | Normalized account email | Derived from current User, never client supplied |
| `token` | String, unique | One-way digest of random raw credential | Raw value appears only in the delivered link; digest is used for exact consume/compensation |
| `expires` | Date/time | Link expiry | No later than 10 minutes after issuance |
| `purpose` | `VerificationPurpose` | `ACCOUNT_DELETION` isolation | Login/signup consumers must reject this purpose |
| `locale` | Nullable string | Cross-device localized return | Required and limited to `en`, `es`, or `ca` for deletion tokens |
| `deliveredAt` | Nullable date/time | Provider acceptance proof | Callback accepts only a delivered token |
| `createdAt` | Date/time | Issuance audit boundary | Never returned or logged with identity |

### Token lifecycle

```text
absent
  -> authenticated issuance request -> provisional (deliveredAt = null)
provisional
  -> provider accepts + exact row still current -> delivered
  -> provider rejects/throws -> deleted (compensated)
delivered
  -> valid guarded Auth.js callback -> consumed exactly once
  -> expiry/superseding issuance/final account deletion -> deleted
```

- Issuance holds the normalized-email advisory lock and replaces only earlier
  `ACCOUNT_DELETION` tokens for that identifier.
- Ordinary `LOGIN` and `SIGNUP` tokens remain purpose-isolated until final deletion, when every
  purpose for the normalized email is removed.
- Callback authorization is held only in request-local AsyncLocalStorage while delegating to
  Auth.js; direct provider callbacks cannot consume the token.

## Existing Entity: PolicyAcceptance

| Field | Existing type | Feature use |
|---|---|---|
| `userId` | String, unique | Exact explicit deletion selector |
| Policy versions and timestamps | Existing fields | Removed with the record; never returned |

The foreign key intentionally remains `ON DELETE RESTRICT`. The privileged deletion transaction
must delete this row before `User`. Any failure rolls the deletion back.

## Existing Entities: Account and Authentication Identity

`Account.userId` already has `ON DELETE CASCADE`. No field or relation changes. Deleting User removes
all provider identities atomically. The implementation verifies postconditions in integration tests
instead of issuing redundant application deletes.

## Existing Entity: RateLimitBucket

| Field | Existing type | Feature use | Rule |
|---|---|---|---|
| `key` | String, primary key | Exact email-address bucket selector | `auth:email:address:` plus SHA-256 of normalized email |
| `key` | String, primary key | Operation-specific client bucket selector | `account:deletion:reauth:client:` or `account:deletion:final:client:` plus the existing non-identifying client key |
| `count`, `resetAt`, `updatedAt` | Existing counter fields | No feature-specific interpretation | Removed only for the exact address key |

Reauthentication consumes its client bucket at 5 requests per 15 minutes and its address bucket at
3 requests per 15 minutes. Final deletion consumes only its client bucket at 5 requests per 15
minutes. Exhaustion returns before email delivery or the deletion transaction. Client-derived and
global/provider buckets are retained; only the exact address bucket is removed by successful
deletion. One shared address-key helper is used by login, signup, deletion verification issuance,
and final cleanup to prevent hash drift.

## Transient Model: Deletion Intent

Deletion intent is represented by the valid, single-use verification credential plus its stored
locale and fixed callback; it is not a table.

| Attribute | Source | Rule |
|---|---|---|
| Locale | Persisted token | Exactly `en`, `es`, or `ca` |
| Destination | Server generated | Exactly localized `/account/data?intent=delete` |
| Target identity | Current token/User lookup | Never encoded into the intent callback |
| Authority | None | Restores dialog context only; never authorizes deletion |

A browser already authenticated as a different User receives a generic localized conflict result
rather than silently switching accounts.

## Transient Model: Pending Deletion Signal

Stored in the initiating tab's `sessionStorage` immediately before final POST.

| Field | Type | Required | Rule |
|---|---|---|---|
| `locale` | `en`, `es`, or `ca` | Yes | Used only to choose the generic public confirmation route |
| `expiresAt` | Integer epoch milliseconds | Yes | At most 10 minutes after creation |

Strict rules:

- Contains no email, user ID, session token, deletion token, or server outcome.
- Grants no identity, target, authorization, or deletion capability.
- Clears on a definitive response, expiry, or one recovery check.
- After network loss, a valid signal plus an invalid former session permits only navigation to the
  generic public completion page; a still-valid session produces a retryable error.
- Recovery never resubmits the deletion mutation.

## Transient Model: Deletion Command

| Field | Type | Required | Rule |
|---|---|---|---|
| `csrfToken` | String | Yes | Must match the signed Auth.js CSRF cookie |
| `locale` | `en`, `es`, or `ca` | Yes | Controls only localized result paths/messages |
| `confirmation` | Literal `permanently_delete` | Yes | Exact final action marker; no typed identity |

Unknown or duplicate fields reject the command. User ID, email, session token, policy choice,
retention choice, and authorization state are not valid fields.

## Atomic Deletion Transaction

1. Read and validate the exact database session from a supported Auth.js cookie inside the
   transaction; require active User, unexpired session, and recent `authenticatedAt`.
2. Acquire advisory locks in stable order: normalized email, then User ID.
3. Re-read the session and User after lock acquisition.
4. If an initially authorized concurrent request now finds the User/session absent, return
   `completed` without creating a record. If the request began after revocation, return
   `unauthenticated` before reaching this branch.
5. Delete `PolicyAcceptance` by User ID.
6. Delete every `VerificationToken` by normalized email, regardless of purpose.
7. Delete the one exact email-address `RateLimitBucket` key.
8. Delete User; database cascades remove Account and every Session.
9. Commit. Any exception rolls back steps 5-8 together.

The transaction performs no email call, remote request, unbounded scan, protected-schema write, or
log containing identity.

## Deletion Outcome State

```text
request
  -> invalid CSRF/origin/payload -> invalid_request (no transaction)
  -> client/address rate limit exhausted -> rate_limited (no email/transaction)
  -> missing/expired session -> unauthenticated (no data change)
  -> null/stale authenticatedAt -> reauthentication_required (no data change)
  -> transaction failure -> deletion_failed (full rollback)
  -> concurrent already-authorized deletion won -> completed
  -> transaction committed -> completed
```

Only `completed` expires local session cookies and directs the UI to the localized public result.
Responses contain no account attributes and do not reveal whether a later unauthenticated replay
once belonged to a deleted account.

## Data Invariants

- There is no `User` tombstone or deletion status.
- A successful commit leaves zero Account, Session, PolicyAcceptance, and attributable
  VerificationToken rows for the deleted User/email.
- A successful commit leaves zero exact email-address rate-limit bucket and preserves all shared
  client/global buckets, including both operation-specific deletion client buckets.
- A failed transaction leaves every pre-existing targeted row unchanged.
- At most one concurrent request performs physical deletion; already-authorized peers converge on
  the same generic completion result.
- A pending or delivered deletion token cannot create a User and cannot be consumed through normal
  login/signup callbacks.