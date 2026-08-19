# Data Model: Signup Page

## Overview

The feature extends the existing Auth.js account and verification-token models. `User` remains the
canonical identity, `VerificationToken` stores either a login credential or one immutable signup
candidate snapshot, and `PolicyAcceptance` records the snapshot that activated an account. Existing
`Session`, `Account`, and `RateLimitBucket` models retain their current ownership.

## Enumerations

### UserStatus

| Value | Meaning |
|-------|---------|
| `PENDING` | Explicitly registered but not mailbox-verified; never eligible for ordinary login or a session |
| `ACTIVE` | Existing or mailbox-verified account eligible for ordinary login |

Existing users are backfilled as `ACTIVE`. The default for compatibility during migration is
`ACTIVE`; the signup service explicitly writes `PENDING` for new registrations.

### VerificationPurpose

| Value | Meaning |
|-------|---------|
| `LOGIN` | Existing-user Auth.js magic-link token with no registration metadata |
| `SIGNUP` | Pending-account onboarding token carrying a complete candidate activation snapshot |

Existing verification-token rows are backfilled/defaulted to `LOGIN`.

## Entities

### User

Existing canonical Auth.js user, extended with lifecycle and normalized identity.

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `id` | String | Yes | Existing stable CUID primary key |
| `name` | String | No | Pending users keep `null`; a newly activated account receives the consumed token's valid trimmed name; legacy active users may remain null |
| `email` | String | Yes | Existing unique contact/display address; new signup values are stored normalized |
| `normalizedEmail` | String | Yes | `lower(trim(email input))`; maximum 254 characters; globally unique |
| `emailVerified` | DateTime | No | `null` while pending; activation records the verification time; legacy active users are not rewritten solely for this feature |
| `image` | String | No | Existing field; never changed by signup |
| `status` | UserStatus | Yes | Existing users `ACTIVE`; explicit signup users start `PENDING` |
| `createdAt` | DateTime | Yes | Existing server time |
| `updatedAt` | DateTime | Yes | Existing server-maintained update time |

**Relationships**:

- One user has zero or more existing Auth.js accounts and sessions.
- One user has zero or one authoritative `PolicyAcceptance` from this signup flow.
- Signup tokens resolve a user through `normalizedEmail`/`identifier`; they intentionally do not
  cascade with a mutable client identity.

**Validation and invariants**:

- `normalizedEmail` is unique at the database boundary, including case-only variants.
- A `PENDING` user is excluded by active-user lookup and hardened adapter lookup.
- Signup never writes `name`, `email`, `image`, lifecycle, or acceptance data on an `ACTIVE` user.
- A pending user is retained when a token expires or delivery fails and may be reused by a later
  valid signup.
- Signup does not create `Session` or `Account` rows before successful activation.

### VerificationToken

Existing Auth.js verification-token storage, extended to distinguish login from signup and carry the
candidate snapshot that is committed on activation.

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `identifier` | String | Yes | For signup, the user's normalized email; for login, the existing stored email contract |
| `token` | String | Yes | Auth.js-compatible salted SHA-256 hash; globally unique; raw token is never persisted |
| `expires` | DateTime | Yes | Exactly 15 minutes after issuance for signup and login |
| `purpose` | VerificationPurpose | Yes | Defaults to `LOGIN`; signup service explicitly writes `SIGNUP` |
| `proposedName` | String | Conditional | Required for `SIGNUP`; valid shared name contract; null for `LOGIN` |
| `locale` | String | Conditional | Required `en`, `es`, or `ca` for `SIGNUP`; null for `LOGIN` |
| `termsVersion` | String | Conditional | Required server-selected version for `SIGNUP`; null for `LOGIN` |
| `privacyVersion` | String | Conditional | Required server-selected version for `SIGNUP`; null for `LOGIN` |
| `acceptedAt` | DateTime | Conditional | Required server time for `SIGNUP`; null for `LOGIN` |
| `deliveredAt` | DateTime | Conditional | Null while a `SIGNUP` token is provisional; set only after SMTP accepts the exact token; null for `LOGIN` |
| `createdAt` | DateTime | Yes | Server issuance time |

**Keys and indexes**:

- Preserve the adapter-compatible unique key on `(identifier, token)`.
- Add global uniqueness on `token` so the activation wrapper can resolve a raw-token hash without
  putting an email address in the URL.
- Add a database partial unique index allowing at most one `SIGNUP` token per identifier.
- Index `(identifier, purpose, expires)` for replacement, cleanup, and verification checks.

**Validation and invariants**:

- A database check requires all candidate fields for `SIGNUP` and requires them, including
  `deliveredAt`, to be null for `LOGIN`.
- A valid pending signup commit deletes/supersedes every earlier signup token before inserting the
  next provisional token and snapshot.
- SMTP acceptance confirms only the exact current token under the identity lock. Delivery failure
  attempts to delete only that token and never restores a predecessor; if cleanup also fails, its
  null `deliveredAt` keeps it unusable.
- Provisional, expired, consumed, superseded, malformed, or active-account signup tokens cannot
  activate.
- A signup token can be consumed only while a server-only activation context is active; direct use
  through the generic Auth.js callback returns the generic invalid-link result.
- Token rows remain short-lived credentials, not a history table. The authoritative accepted
  snapshot moves to `PolicyAcceptance` when activation succeeds.

### PolicyAcceptance

Immutable authoritative record created only by successful signup activation.

| Field | Type | Required | Rules |
|-------|------|----------|-------|
| `id` | String | Yes | Stable CUID primary key |
| `userId` | String | Yes | Unique foreign key to `User`; at most one authoritative signup acceptance |
| `termsVersion` | String | Yes | Copied from the consumed signup token |
| `privacyVersion` | String | Yes | Copied from the consumed signup token |
| `acceptedAt` | DateTime | Yes | Copied from the consumed signup token, not activation time |
| `createdAt` | DateTime | Yes | Server persistence/audit time |

**Relationships and invariants**:

- One-to-one optional relation from `User`; legacy active and pending users may have no row.
- Deletion of a user is restricted while an acceptance exists; future account-deletion policy must
  decide retention explicitly.
- No update operation is exposed. Signup activation inserts once in the same transaction as the
  `PENDING` to `ACTIVE` transition.
- Active-account signup cannot insert, replace, or update this row.
- A unique `userId` constraint and activation transaction make retries idempotent.

### Session

Existing Auth.js database session. No schema change.

**Signup-specific invariants**:

- Only NextAuth creates the session and secure session cookie after adapter activation succeeds.
- A different current session prevents delegation, token consumption, activation, and account
  switching.
- If session creation fails after activation, no session exists, while the account and acceptance
  remain active/durable and the signup token remains consumed.

### RateLimitBucket

Existing shared PostgreSQL counter. No schema change.

**Signup-specific invariants**:

- Signup and login use the same `auth:email:client:*` and `auth:email:address:*` key families.
- Every server-received request consumes the client bucket first.
- The address bucket is consumed only after CSRF and the complete normalized signup body are valid.
- Account status never changes key choice or consumption.

## State Transitions

| Current State | Event | Next State | Atomic Effects |
|---------------|-------|------------|----------------|
| No user | Valid signup, provider globally available | `PENDING` | Insert normalized user and one signup token/candidate snapshot |
| `PENDING` | Later valid signup commits first | `PENDING` | Keep same user; replace all signup tokens with latest name, locale, versions, and acceptance time |
| `PENDING` | Onboarding delivery fails | `PENDING` | Keep the failed new token unusable, attempt exact-token cleanup, never restore a predecessor, and retain the user without a valid link |
| `PENDING` | Current valid token consumed in activation context | `ACTIVE` | Consume token, set name and verification time, insert acceptance, invalidate remaining signup tokens |
| `PENDING` | Expired, superseded, malformed, direct-callback, or replayed token | `PENDING` | No account, acceptance, or session change; generic invalid result |
| `PENDING` | Valid token opened during a different session | `PENDING` | Preserve session and token; show sign-out/reopen guidance |
| `ACTIVE` | Signup submitted | `ACTIVE` | No account, acceptance, token, or session mutation; send private login notice only |
| `ACTIVE` after activation | Session creation fails | `ACTIVE` | Acceptance and consumed token remain durable; localized login recovery |

## Commit-Order Arbitration

Signup issuance and activation use the same transaction-scoped advisory lock derived from
`normalizedEmail`.

1. Each operation acquires the identity lock.
2. It re-reads `User.status` and the current signup token while holding the lock.
3. If signup commits first, it replaces the token; activation of the old token subsequently fails.
4. If activation commits first, it marks the user active; the later signup sends the active-account
   notice and cannot alter the account.
5. Concurrent first signups are also serialized before a row exists; normalized-email uniqueness is
   the final database guard.
6. Concurrent consumption of one token can return one successful activation at most.

## Migration and Backfill

1. Preflight `lower(trim(email))` groups and abort with a non-sensitive count if any collision exists;
   collision resolution requires a separately reviewed data correction.
2. Add `UserStatus` and `VerificationPurpose` enums.
3. Add nullable `User.normalizedEmail` and `User.status` with compatibility default `ACTIVE`.
4. Backfill normalized addresses and active status for every existing user.
5. Make `normalizedEmail` required and unique.
6. Reconcile `VerificationToken` schema drift: remove the unused schema-only `id`, add the currently
   un-migrated `proposedName` and `createdAt`, then add purpose and candidate fields/defaults.
7. Add token uniqueness, signup partial uniqueness, lookup index, and purpose/metadata check.
8. Create `PolicyAcceptance` with a unique/restricted `userId` relationship.
9. Add the nullable delivery-confirmation timestamp in a forward migration; pre-existing signup
  rows remain unconfirmed and therefore unusable until replaced by a new delivered link.
10. Regenerate Prisma Client and run login plus signup integration tests against a freshly migrated
   database and an existing-data fixture.

No legacy acceptance is fabricated, no pending row is deleted, and rollback documentation does not
claim that reverting application code reverses these schema changes.
