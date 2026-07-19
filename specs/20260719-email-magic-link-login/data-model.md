# Data Model: Email Magic Link Login

## Schema Impact

No Prisma schema change or migration is required. The feature reuses `User`, `VerificationToken`,
and `RateLimitBucket`. Request state, locale, delivery coordination, and UI state are transient.

## Existing User

Represents a previously registered account that may authenticate.

| Field | Type | Rules used by this feature |
|---|---|---|
| `id` | String | Stable account identity; never accepted from the login client |
| `email` | String | Unique persisted address; compared case-insensitively to a validated normalized request on the server |
| `emailVerified` | DateTime? | Existing Auth.js account metadata; this feature does not create or mutate an account to satisfy login |

**Relationships**:

- May own database sessions through the existing Auth.js relationship.
- Is associated with at most one valid pending verification token by application invariant, not a
  new database constraint.

**Validation/invariants**:

- Login never creates a `User`.
- Unknown normalized emails produce no persistent authentication record.
- Account lookup happens after client-limit, CSRF, input, address-limit, and provider-state processing
  and only on the server.

## Verification Token

Existing Auth.js-compatible secret credential for one email callback.

| Field | Type | Rules used by this feature |
|---|---|---|
| `identifier` | String | Normalized email of an existing user; never written for an unknown address |
| `token` | String | One-way hash persisted by Auth.js; raw token appears only in the emailed callback URL |
| `expires` | DateTime | Exactly 15 minutes after issuance |
| `createdAt` | DateTime | Existing audit timestamp; never exposed publicly |
| `id`, `proposedName` | Existing fields | No schema or login-specific behavior added |

**Application invariants**:

- At most one pending token for an identifier is valid.
- Creation is serialized per identifier with a PostgreSQL transaction advisory lock.
- Within that transaction, every previous token for the identifier is deleted before the new hashed
  token is created.
- Callback use atomically deletes the matching hashed token before establishing a session.
- A failed delivery deletes the exact new `{identifier, hashedToken}` and never restores an older
  token.
- Token values, callback URLs, and identifiers are not logged.

### Token State Transitions

```text
None
  -> Pending                 new token issued for an existing user

Pending
  -> Consumed                valid callback atomically deletes token and creates session
  -> Expired                 callback/cleanup finds expires <= current time; token is unusable
  -> Superseded              newer issuance deletes previous pending token
  -> DeliveryFailed          isolated SMTP failure deletes exact newly created token

Consumed | Expired | Superseded | DeliveryFailed
  -> no transition back      a new request creates a different token
```

Concurrent callbacks for one token result in at most one `Consumed` transition because token use is
an atomic delete. Concurrent issuances for one identifier serialize: only the newest issued token can
remain pending, and if that issuance fails delivery, no older token is restored.

## Request Limit Bucket

Existing shared PostgreSQL row used for fixed-window counters and the provider cooldown marker.

| Field | Type | Rules used by this feature |
|---|---|---|
| `key` | String | Non-PII namespace key |
| `count` | Int | Counter for limit buckets; sentinel value for provider state |
| `resetAt` | DateTime | End of the 15-minute limit window or provider cooldown |
| `updatedAt` | DateTime | Existing maintenance timestamp |

### Key Namespaces

| Namespace | Input | Limit/lifetime |
|---|---|---|
| `auth:email:client:<trusted-id>` | Existing trusted-proxy client identity | 5 server-received requests / 15 minutes |
| `auth:email:address:<sha256>` | SHA-256 of validated normalized email | 3 valid requests / 15 minutes |
| `auth:email:provider:unavailable` | Fixed global key; contains no account/address data | 60-second cooldown after provider-wide transport/configuration failure |

**Validation/invariants**:

- Client counter is consumed before CSRF and email validation and on every request reaching the server.
- Address counter is consumed only after successful normalization/validation.
- Known and unknown valid addresses consume address buckets identically.
- Expired provider-state and limit rows are safe to delete through existing cleanup.
- Provider state is shared by every app replica; process-local state is not authoritative.

## Magic Link Request

Transient server-side command; not a database entity.

| Field | Type | Validation |
|---|---|---|
| `email` | String | Trim, lowercase, valid email shape, maximum 254 characters |
| `locale` | `en \| es \| ca` | Derived from the localized page/callback path; reject other values |
| `csrfToken` | String | Must match the signed double-submit cookie before account lookup |
| `callbackPath` | String | Constructed by the server from locale; same canonical origin only |
| `clientIdentity` | String | Derived only through existing trusted-proxy policy |

### Request State Transitions

```text
Received
  -> LimitedClient           sixth client request in active 15-minute window
  -> RejectedCsrf            client count consumed; invalid/missing double-submit token; no account lookup
  -> InvalidEmail            client count consumed; no address count
  -> LimitedAddress          fourth valid normalized-address request in active window
  -> ProviderUnavailable     shared provider cooldown active; no account lookup or token
  -> AcceptedUnknown         no account; no token or SMTP; canonical accepted response
  -> DelegatedKnown          Auth.js issues token and attempts SMTP

DelegatedKnown
  -> AcceptedDelivered       token remains pending; canonical accepted response
  -> AcceptedDeliveryFailed exact token removed; optional provider marker; same canonical response
```

`AcceptedUnknown`, `AcceptedDelivered`, and `AcceptedDeliveryFailed` are intentionally indistinguishable
in public HTTP status, body, and redirect behavior. Each waits for the same request-start-relative
500 ms floor plus 0–100 ms server-selected jitter before returning.

## Provider Availability

Transient logical state backed by the fixed `RateLimitBucket` key.

```text
Available
  -> Unavailable             provider-wide transport/config failure sets 60-second marker

Unavailable
  -> Available               resetAt passes; no explicit migration or operator action
```

Recipient-specific rejection is an isolated delivery failure: it removes the exact token but does
not change global provider state. The request that detects a provider-wide failure retains the
generic accepted response; only later requests observe the shared unavailable state.

## Locale Context

Transient route state with values `en`, `es`, or `ca`.

| Locale | Login | Successful home | Link error |
|---|---|---|---|
| `en` | `/login` | `/` | `/login/error` |
| `es` | `/es/login` | `/es` | `/es/login/error` |
| `ca` | `/ca/login` | `/ca` | `/ca/login/error` |

Only these server-constructed paths are accepted as callback destinations. Absolute client-provided
destinations and foreign origins are rejected/fallback to the canonical locale home.

## UI State

Transient client state: `initial`, `pending`, `accepted`, `invalidEmail`, `invalidRequest`,
`rateLimited`, `unavailable`, or `invalidLink`. `invalidLink` is one generic presentation for every
rejected callback reason; internal token states are not exposed. State transitions preserve stable
regions for field errors and status announcements. Submitting is permitted only from a non-pending
state; pending disables the primary action.