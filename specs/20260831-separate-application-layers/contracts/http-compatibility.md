# Contract: HTTP Compatibility

## Purpose

This feature changes internal ownership only. The HTTP contracts below are compatibility assertions,
not new endpoints or versions. The authoritative historical definitions remain:

- `specs/20260818-signup-page/contracts/openapi.yaml`
- `specs/20260820-account-deletion/contracts/account-deletion.openapi.yaml`

No request shape, status, payload, header, cookie, redirect, locale, callback destination, rate
limit, timing defense, or public failure disclosure changes.

## `POST /api/signup`

The route continues to own canonical-origin validation, mail availability, client and address rate
limits, JSON/CSRF/schema validation, request logging, and the accepted HTTP response.

| Condition | Required result |
|---|---|
| Canonical valid submission reaches private processing, regardless of new/pending/active account or isolated processing outcome | `200` with exactly `{ "status": "accepted" }` after the existing timing floor and jitter |
| Invalid request or field | Existing `400` result and field disclosure only |
| Invalid CSRF | Existing `403` generic invalid-request result |
| Rate limited | Existing `429`, `Retry-After`, and `X-RateLimit-Remaining` behavior |
| Provider unavailable before private processing | Existing `503` and `Retry-After` behavior |
| Non-canonical origin | Existing `421` misdirected-request behavior |

The domain service performs the wait but returns no HTTP object. The route constructs the exact
accepted JSON after the wait.

## `POST /api/auth/signin/email`

The Auth.js route retains the existing public login submission contract. Both the unknown-user path
and the post-provider path await the same timing-only login helper and then construct the exact
`200 { "status": "accepted" }` response. Existing CSRF, validation, provider availability, rate
limits, logs, and delegated provider behavior are unchanged.

## `GET /api/signup/activate`

### Request

- Query parameter `token` remains required.
- Syntax remains exactly 43 Base64URL characters matching `^[A-Za-z0-9_-]{43}$`.
- Request origin must match the canonical configured authentication origin.
- Client-supplied callback destinations and account identifiers remain ignored.

### Response matrix

| Condition | Status | Required outcome |
|---|---:|---|
| Non-canonical origin | 421 | Existing `{ "status": "misdirected_request" }` JSON |
| Missing or malformed token | 302 | English `/signup?state=invalid_link` |
| Unknown, wrong-purpose, unconfirmed, expired, or ineligible-user token | 302 | Existing localized `signup?state=invalid_link` destination |
| Valid token with another account active in the browser | 302 | Existing localized `signup?state=session_conflict`; no callback delegation or token consumption |
| Eligible token and accepted exact Auth.js callback redirect | Auth.js response | Preserve status, `Location`, session `Set-Cookie`, and all other Auth.js response headers exactly |
| Durable activation followed by failed session establishment | 302 | Existing localized `signup?state=session_failed`, with no new cookie |
| Any other callback exception or redirect mismatch | 302 | Existing localized `signup?state=invalid_link` |

### Internal Auth.js delegation

- Path remains `/api/auth/callback/signup`.
- Query values remain the raw token, stored normalized email, and server-built localized home path.
- Request headers remain forwarded as today.
- The call remains wrapped by `runWithSignupActivation` with exact
  `{ identifier, token: tokenHash }` request-local authorization.
- Success is accepted only when `Location` has the canonical origin, exact localized home pathname,
  and no search or hash.

## `GET /api/account/deletion/verify`

### Request

- Query parameter `token` retains the same 43-character Base64URL syntax.
- Request origin must match the canonical configured authentication origin.
- Client-supplied callback destinations and account identifiers remain ignored.

### Response matrix

| Condition | Status | Required outcome |
|---|---:|---|
| Non-canonical origin | 421 | Existing `{ "status": "misdirected_request" }` JSON |
| Missing or malformed token | 302 | English `/account/data?state=invalid_link` |
| Unknown, wrong-purpose, unconfirmed, expired, or ineligible-user token | 302 | Existing localized `account/data?state=invalid_link` destination |
| Valid token with another account active in the browser | 302 | Existing localized `account/data?state=session_conflict`; no callback delegation or token consumption |
| Eligible token and accepted exact Auth.js callback redirect | Auth.js response | Preserve status, `Location`, fresh-session `Set-Cookie`, and all other Auth.js response headers exactly |
| Callback exception, missing response, or redirect mismatch | 302 | Existing localized `account/data?state=invalid_link` |

### Internal Auth.js delegation

- Path remains `/api/auth/callback/account-deletion`.
- Query values remain the raw token, stored normalized email, and exact server-built localized
  `/account/data?intent=delete` destination.
- Request headers remain forwarded as today.
- The call remains wrapped by `runWithAccountDeletionVerification` with exact
  `{ identifier, token: tokenHash }` request-local authorization.
- Success is accepted only when `Location` matches the canonical origin, localized deletion-intent
  pathname and query, and has no hash.

## Timing Compatibility

- Login and signup accepted responses retain a 500 ms floor measured from the current request start.
- Jitter remains an inclusive integer from 0 through 100 ms.
- The wait recalculates remaining time after each sleep to resist early wakeups.
- Both HTTP routes construct the accepted response only after the wait resolves.
- Existing integration sampling remains the behavioral authority; this feature introduces no new
  latency target for activation or deletion callbacks.

## Security and Disclosure Invariants

- Invalid token classes remain indistinguishable in public responses.
- Raw tokens, hashes, account identifiers, email addresses, session material, provider errors, and
  persistence errors never enter responses or logs.
- Auth.js remains the only session-cookie creator.
- Direct calls to internal signup and deletion Auth.js providers remain rejected without the exact
  request-local verification context.
- Existing origin, CSRF, rate-limit, transaction, advisory-lock, replay, and redirect protections
  remain at their current boundaries.
