# Data Model: Separate Application Layers

## Overview

This feature changes ownership of reads and decisions but changes no persisted model. The canonical
schema, migrations, generated client, relationships, indexes, token purposes, and state transitions
remain unchanged. Existing account records continue to be mutated only by the hardened Auth.js
adapter and existing domain transactions.

The design introduces transient server-only verification candidates and discriminated results. They
carry the minimum data needed to orchestrate the existing Auth.js callback and never become HTTP
payloads, client contracts, logs, or stored rows.

## Schema Delta

None.

- Do not modify `prisma/schema.prisma` or any migration.
- Do not regenerate and commit `src/generated/prisma` as a design artifact.
- Do not add a repository, DAO, table, relation, index, token purpose, or status.
- Existing backup, restore, migration, and deployment procedures remain unchanged.

## Existing Entity: User

| Field | Existing type | Verification use | Invariant |
|---|---|---|---|
| `id` | String, primary key | Identifies the candidate account and detects a conflicting active session | Loaded server-side and never accepted from request data |
| `normalizedEmail` | String, unique | Joins a verification token to its account and keys the adapter lock | Loaded from the token and database; never returned publicly |
| `status` | `PENDING` or `ACTIVE` | Signup requires `PENDING`; deletion verification requires `ACTIVE` | Status rules remain domain-owned and are rechecked by the adapter transaction |
| `name` | Nullable string | Updated from the signup token snapshot on activation | Mutation remains in the existing adapter transaction |
| `emailVerified` | Nullable timestamp | Set when signup activation commits | Mutation remains in the existing adapter transaction |

### User state transitions

```text
Signup verification:
PENDING -- valid guarded Auth.js callback --> ACTIVE
PENDING -- invalid/conflicting/failed preflight --> PENDING
ACTIVE  -- signup activation link -----------> invalid_link

Deletion verification:
ACTIVE  -- valid guarded Auth.js callback --> ACTIVE with a fresh Session
ACTIVE  -- invalid/conflicting callback -----> ACTIVE with no new Session
PENDING/absent ------------------------------> invalid_link
```

Account deletion verification does not delete an account. It establishes the fresh session used by
the separate final deletion flow.

## Existing Entity: VerificationToken

| Field | Existing type | Verification use | Validation rule |
|---|---|---|---|
| `identifier` | String | Normalized account email | Must resolve to the eligible User state for the token's domain |
| `token` | String, unique | One-way digest of the raw 43-character Base64URL value | Raw input is hashed before lookup and never logged |
| `expires` | Timestamp | Link validity boundary | Must be strictly later than the captured verification time |
| `purpose` | `VerificationPurpose` | Isolates `SIGNUP` from `ACCOUNT_DELETION` and other flows | A wrong purpose always maps to the generic invalid result |
| `locale` | Nullable string | Selects the existing localized redirect | Only `en`, `es`, or `ca` is accepted; otherwise the route-compatible fallback is `en` |
| `deliveredAt` | Nullable timestamp | Proves provider acceptance | Null is provisional and ineligible |
| Signup snapshot fields | Nullable values | Name and policy evidence consumed by the adapter | Existing adapter validation and mutation remain unchanged |

### Token lifecycle

```text
provisional (deliveredAt = null)
  -> delivery confirmed -> delivered
  -> preflight ----------> invalid_link

delivered and unexpired
  -> wrong purpose/user state -> invalid_link
  -> conflicting session ----> session_conflict without consumption
  -> guarded Auth.js callback -> adapter revalidates under lock and consumes once
  -> expiry/supersession -----> invalid_link
```

The new preflight performs read-only eligibility checks. It does not reserve or consume a token.
The Auth.js adapter remains the race-safe authority and repeats mutable checks inside its existing
normalized-email advisory-lock transaction.

## Existing Entity: Session

| Field | Existing type | Verification use | Invariant |
|---|---|---|---|
| `id` | String, primary key | Internal Auth.js session identity | Not exposed by this feature |
| `sessionToken` | String, unique | Read by the existing Auth.js session endpoint | Remains cookie-derived and transport-owned |
| `userId` | String | Detects a session for another account | Current user ID is passed to a pure domain decision; it is never client supplied |
| `expires` | Timestamp | Existing Auth.js validity | Validation remains in existing Auth.js behavior |
| `authenticatedAt` | Nullable timestamp | Existing fresh-auth evidence for deletion | Session creation behavior remains unchanged |

The route asks Auth.js for the current user only after token/user preflight succeeds. No session
lookup occurs for malformed or domain-invalid links, matching current behavior.

## Existing Entity: PolicyAcceptance

Signup activation continues to create the existing policy-acceptance row in the same adapter
transaction that changes User from `PENDING` to `ACTIVE` and consumes the signup token. This feature
neither reads nor writes the entity in its new preflight and changes no policy version or relation.

## Transient Model: Activation Candidate

An activation candidate is a server-only value produced after token and user preflight succeeds.
Signup and deletion use domain-local types with the same minimal shape rather than a generic shared
framework.

| Field | Type | Rule |
|---|---|---|
| `userId` | String | Exact target User loaded by the domain service |
| `identifier` | String | Exact normalized email from the stored token |
| `tokenHash` | String | Persisted digest used only for request-local Auth.js authorization |
| `locale` | `en`, `es`, or `ca` | Existing localized response destination |

Strict rules:

- It is not serializable public output and remains in a server-only module.
- It contains no raw token, Request, Response, cookie, URL, logger, or Prisma record.
- It is short-lived within one request and is never cached or persisted.
- The route may use it only to evaluate the session rule, construct the fixed Auth.js callback, and
  establish request-local verification authorization.

## Transient Results: Signup Activation

### Preflight result

```text
invalid_link { locale }
eligible_candidate { candidate }
```

`invalid_link` covers unknown token, wrong purpose, unconfirmed delivery, expiry, invalid locale as
currently interpreted, missing user, and any user status other than `PENDING`.

### Session result

```text
eligible { candidate }
session_conflict { locale }
```

No current session or a session for `candidate.userId` is eligible. Any other current user ID is a
conflict. The pure decision performs no I/O.

### Post-callback failure result

```text
session_failed { locale }
invalid_link { locale }
```

`session_failed` requires both conditions after an unsuccessful delegated response: the exact token
is absent and the target User is now `ACTIVE`. The service performs the two existing reads in
parallel. Every other state is `invalid_link`.

## Transient Results: Account Deletion Verification

### Preflight result

```text
invalid_link { locale }
eligible_candidate { candidate }
```

`invalid_link` covers unknown token, wrong purpose, unconfirmed delivery, expiry, missing user, and
any user status other than `ACTIVE`.

### Session result

```text
eligible { candidate }
session_conflict { locale }
```

The rule matches signup session handling. If delegated Auth.js processing throws, returns no
response, or redirects away from the fixed localized deletion intent, the route preserves the
existing `invalid_link` outcome without a new persistence read.

## Server-Internal Export Context

The personal-data export model is unchanged at runtime. Its contributor execution contracts move
from the client-safe `types.ts` module to a server-only `internal-types.ts` module:

- `PersonalDataModuleDeclaration`
- `PersonalDataExportReadContext`
- `PersonalDataContribution`
- `PersonalDataExportContributor`
- `PersonalDataExportRegistry`

`PersonalDataExportReadContext.transaction` remains the same `Prisma.TransactionClient`. Public
JSON/envelope, command, result, and UI contracts remain in `types.ts` and gain no persistence import.
No exported payload, registry behavior, snapshot, or transaction changes.

## Transaction and Concurrency Invariants

- New preflight and reconciliation operations are reads only and open no transaction or lock.
- Auth.js adapter verification retains the normalized-email advisory lock, in-transaction token and
  user revalidation, exact token consumption, and session creation.
- Signup activation retains atomic User activation and PolicyAcceptance creation in that adapter
  transaction.
- Existing issuance, compensation, deletion, export, and rate-limit transactions are untouched.
- A preflight race can only cause the adapter to reject generically; it cannot bypass locked
  revalidation or create partial state.
- Callback authorization remains request-local through the existing AsyncLocalStorage contexts.

## Data Volume and Query Bounds

Each verification preflight reads at most one token by unique digest and one User by unique
normalized email. Signup post-callback reconciliation reads at most one token by unique digest and
one User by primary key in parallel. The feature adds no list query, scan, batch operation, retained
record, or background work.

## Migration and Recovery

No migration or data recovery action applies. If the refactor fails validation, revert the route,
service, type-import, and test changes together. Persisted state and deployed schema remain
compatible because neither changes.
