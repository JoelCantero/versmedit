# Contract: `POST /api/auth/login/code`

**Feature**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md)

Public, unauthenticated endpoint that redeems a login access code and creates the same session the
magic link would have created. It is the only new HTTP surface in this feature.

## Request

```http
POST /api/auth/login/code HTTP/1.1
Content-Type: application/x-www-form-urlencoded
Cookie: next-auth.csrf-token=...
```

| Field | Required | Notes |
|-------|----------|-------|
| `email` | yes | Address the challenge was requested for. Used only as a lookup key; no identity is inferred from it |
| `code` | yes | The access code as typed or pasted; normalized server-side |
| `csrfToken` | yes | The Auth.js CSRF token the login client already holds |
| `callbackUrl` | no | Validated against the existing localized allow-list; falls back to the locale home path |
| `locale` | no | `en` \| `es` \| `ca`; falls back to `en` |

The code MUST be sent in the request body. It MUST NOT appear in the URL, the query string, a header,
a referrer, an analytics payload or any log line.

## Responses

All responses are `application/json` and inherit `X-Robots-Tag: noindex, nofollow` from the existing
`/api/:path*` header rule.

| Status | Body | When |
|--------|------|------|
| 200 | `{ "status": "accepted", "redirectTo": "/es/account" }` plus `Set-Cookie` for the session | The code matched an unexpired challenge and was consumed |
| 400 | `{ "status": "invalid_code" }` | Wrong, malformed, expired, already consumed, superseded, unknown, or attempt-exhausted — indistinguishable from each other |
| 403 | `{ "status": "invalid_request" }` | CSRF validation failed |
| 421 | `{ "status": "misdirected_request" }` | Request origin is not the canonical origin |
| 429 | `{ "status": "rate_limited", "retryAfter": 42 }` with `Retry-After` | Client or address limit exceeded |
| 503 | `{ "status": "unavailable" }` | Email authentication is disabled |

`redirectTo` is always a validated, locale-aware application path produced by
`parseLoginCallbackPath`; it is never taken verbatim from the request.

### Timing

Every 200 and 400 response is held to the existing accepted-response envelope — a 500 ms floor plus
0-100 ms jitter measured from request start — so response time cannot reveal whether a pending
challenge exists for the submitted address. 403, 421, 429 and 503 short-circuit before any lookup and
therefore carry no such signal.

## Processing order

Order matters: each step is placed so that it cannot become an oracle for the next.

1. Reject if email authentication is disabled → 503.
2. Reject if the request origin is not canonical → 421.
3. Charge `auth:login-code:client:<trusted-client-id>` (10 per 5 min) → 429 if exceeded.
4. Validate the CSRF token → 403 if invalid.
5. Parse `email`; normalize `code`. Any failure → generic 400 (after the timing envelope).
6. Charge `auth:login-code:address:<sha256(normalized-email)>` (10 per 5 min) → 429 if exceeded.
7. Resolve the challenge for `(identifier, purpose = LOGIN, expires > now())`. No row → generic 400.
8. Compare `loginCodeHash` in constant time.
   - **No match**: increment `loginCodeAttempts` in a transaction; delete the row when it reaches 5;
     generic 400.
   - **Match**: continue.
9. Delegate to `GET /api/auth/callback/email` inside `runWithLoginCodeAuthorization(...)`, which lets
   the hardened adapter consume the row atomically by `loginCodeHash` and create the session.
10. Copy the delegated response's `Set-Cookie` headers onto the 200 JSON response. If delegation did
    not produce a session, return the generic 400.

## Invariants

- At most one session is ever created per challenge, including under concurrent submission, because
  consumption is a single `DELETE ... RETURNING`.
- Redeeming the code invalidates the magic link and vice versa: both resolve to the same row.
- A submitted code is never mapped onto a different code; normalization only removes formatting.
- No response, header, body or timing distinguishes "no account", "no challenge", "wrong code",
  "expired", "consumed", "superseded" or "attempts exhausted".

## Logging

One structured event per request via the existing request logger, containing only: route, outcome
class (`accepted` \| `rejected` \| `throttled`), and the correlation id. The code, the raw address,
the code hash and the placeholder token are never logged.
