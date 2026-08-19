# Contract: Recipient-Independent Provider Health

## Purpose

Provider health is an account-independent preflight for email-dependent public routes. It prevents a known provider-wide outage from causing account-dependent work or timing while keeping individual send outcomes private.

It is separate from Docker/application liveness and from normalized send results.

## Fixed Probe Requests

### Brevo

```http
GET https://api.brevo.com/v3/account
api-key: <MAIL_API_KEY>
accept: application/json
```

### Mailjet

```http
GET https://api.mailjet.com/v3/REST/sender?Limit=1
Authorization: Basic <base64(MAIL_API_KEY:MAIL_API_SECRET)>
accept: application/json
```

Both requests:

- contain no recipient, account lookup result, message, subject, body, or authentication URL;
- use `redirect: "manual"`, `cache: "no-store"`, and a 1,500 ms timeout;
- make one attempt;
- treat an authenticated 2xx with the expected JSON content type as available, including an empty Mailjet sender list;
- treat any non-2xx, redirect, timeout, connection failure, or unexpected content type as unavailable;
- cancel/discard response content without parsing, retaining, or logging account/sender metadata.

## Shared State Encoding

Use the existing `RateLimitBucket` table; add no model or migration.

| Key | `count` | `resetAt` | `updatedAt` |
|---|---|---|---|
| `mail:provider-health:<provider>` | 0 available, 1 unavailable | next refresh/retry time | probe observation time |
| `mail:provider-health-lock:<provider>` | 1 | two-second claim expiry | last claim time |

State is provider-scoped so a Brevo observation never gates Mailjet after a configuration change.

## Cache and Single-Flight Algorithm

1. If `MAIL_ENABLED` is false, return the existing disabled/unavailable route behavior without a database lookup or probe.
2. Read the selected provider state row.
3. If `resetAt` is in the future, return that snapshot immediately.
4. If missing or stale, atomically insert/renew the lock only when its current `resetAt` has expired.
5. The lock winner performs one probe, upserts state with a 60-second freshness interval, expires/releases the lock, and returns the new snapshot.
6. A lock loser does not probe or wait on a process-local promise. It uses the last cached state; if no prior state exists, it fails closed as unavailable for the current request.
7. A database coordination failure fails closed as the existing account-independent unavailable response and does not send a probe.

The two-second lock outlives the 1.5-second probe timeout and self-recovers if an app process terminates.

## Route Ordering and Snapshot Semantics

For login and signup:

1. Complete request-level anti-forgery and shared rate-limit checks already required before provider work.
2. Evaluate the global mail gate.
3. Capture provider availability.
4. If unavailable, return the existing generic unavailable response with a safe `Retry-After` derived from state.
5. If available, continue with account lookup, mutation/token logic, and at most one send.

The captured snapshot governs that request even if another instance refreshes health concurrently.

## Transition Authority

Only the probe may create, extend, clear, or replace provider health state. These send categories are explicitly forbidden from writing health state:

- `accepted`
- `authentication`
- `rate_limited`
- `recipient_rejected`
- `provider_unavailable`
- `invalid_request`
- `unknown`

Current `markProviderUnavailable()` calls and provider-wide failure inference from individual sends are removed.

## Liveness Isolation

- `/api/health` continues to represent application/database readiness only.
- Docker healthchecks do not call Brevo or Mailjet.
- No provider probe runs at build time or startup.
- No failed probe restarts the container.

## Observability

Log only provider, available/unavailable transition, safe HTTP status class, duration, and non-personal correlation. Never log probe URLs, headers, credentials, response bodies, account metadata, sender metadata, or exception objects that may contain request details.

## Verification Contract

Tests must prove:

- fresh cache avoids a network request;
- stale/missing state produces at most one cross-instance probe claim;
- lock losers use cached state or fail closed without probing;
- successful and failed probes are the only state writers;
- every individual send category leaves both health and lock rows unchanged;
- unavailable state stops all account lookup, token issuance, mutation, and sends equally for known/unknown login and new/pending/active signup;
- provider health never changes `/api/health` or container readiness.
