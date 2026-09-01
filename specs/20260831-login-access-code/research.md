# Phase 0 Research: Login Access Code

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-31

All spec-level unknowns were closed in the clarification session. The open items carried into
planning were the two the spec explicitly deferred — how the code is bound to the existing challenge,
and the contract and route for validation — plus the mechanical questions raised by the existing
implementation. Each is resolved below. No `NEEDS CLARIFICATION` remains.

## R1. Binding the code to the existing challenge

**Decision**: Keep exactly one `VerificationToken` row per login challenge and add two columns to it:
`loginCodeHash String?` and `loginCodeAttempts Int @default(0)`. The stored hash is
`sha256("login-code:" + normalizedIdentifier + ":" + code + AUTH_SECRET)`, mirroring the keyed hashing
scheme Auth.js already uses for the link token (`hashSignupToken` in
[src/modules/signup/token.ts](../../src/modules/signup/token.ts)) and additionally binding the code to
its address.

**Rationale**:

- Every invariant the spec demands is already enforced on that row and is inherited for free:
  `createVerificationToken` in [src/lib/auth-adapter.ts](../../src/lib/auth-adapter.ts) takes a
  per-identifier advisory lock and deletes prior `LOGIN` tokens (newest-only, FR-004); `expires` is a
  single column (shared expiry, FR-005); consumption is a single `DELETE ... RETURNING` (single use
  and atomicity, FR-003 and FR-013); the delivery-failure compensation in
  [src/lib/auth.ts](../../src/lib/auth.ts) deletes that row (FR-008 and the isolated-failure rule).
  A second row or table would require re-deriving all four properties and keeping them in sync.
- The address binding means a code issued for one identifier can never validate against another, even
  if lookups were ever loosened.
- Keying with `AUTH_SECRET` is what makes the stored value satisfy "non-reversible" in practice: the
  code carries 50 bits, so an unkeyed SHA-256 digest would be brute-forceable offline by anyone who
  obtained a database dump. With the secret as key, a dump alone yields nothing.
- Nullable column means pre-deploy challenges keep working through the link and simply have no code.

**Alternatives considered**:

- *Derive the code from the raw link token* (`code = f(rawToken)`). Rejected: validation only ever
  receives the code, and `f` must be one-way, so the server could not recompute the link token to
  find the row. A stored derived value is unavoidable.
- *Make the code the link token* (put the 10-character code in the magic link URL). Rejected twice
  over: it would place the code in a URL, which the spec forbids, and it would drop the link token
  from 256 bits to 50.
- *Separate `LoginCode` table keyed to the token*. Rejected: adds a table and a second lifecycle to
  keep atomically consistent with the token row, for no behavioral gain.
- *Store the code encrypted rather than hashed*. Rejected: reversible by definition, and the spec
  requires that no second plaintext-equivalent copy exists.

## R2. Delivering the plaintext code to the email

**Decision**: Extend the existing AsyncLocalStorage publication channel in
[src/modules/login/verification-context.ts](../../src/modules/login/verification-context.ts) so the
adapter publishes `{ identifier, token, code }`, and have `sendVerificationRequest` await
`getPublishedVerificationToken()` before rendering the email.

**Rationale**: Auth.js calls `adapter.createVerificationToken` before `provider.sendVerificationRequest`
within the same request, and the channel already exists for exactly this hand-off (it is how delivery
failures currently find the just-created token to delete). The promise is already resolved by the time
the provider runs, so no extra latency is introduced. The plaintext code lives only in memory for the
duration of one request and is never persisted or logged.

**Alternatives considered**: generating the code inside `sendVerificationRequest` and writing it back
to the row — rejected because it would split issuance across two writes outside the advisory-locked
transaction, opening a window where a challenge exists without a code.

## R3. Validation route and session creation

**Decision**: Add `POST /api/auth/login/code`. After validation it delegates to the native Auth.js
email callback (`GET /api/auth/callback/email`) inside a new `runWithLoginCodeAuthorization(...)`
AsyncLocalStorage scope, and the hardened adapter's `useVerificationToken` recognizes that
authorization and consumes the row by `loginCodeHash`. The delegated response's `Set-Cookie` headers
are copied onto a JSON response of the shape `{ status: "accepted", redirectTo }`.

**Rationale**:

- [src/app/api/signup/activate/route.ts](../../src/app/api/signup/activate/route.ts) is the same
  pattern already in production: a custom route holds the credential, delegates internally to the
  Auth.js callback under an authorization scope, and passes the resulting response through. Reusing it
  keeps session creation, session eviction, `authenticatedAt`, cookie naming and the `__Secure-` prefix
  on the verified Auth.js path instead of hand-rolling a session cookie.
- The delegated URL carries an opaque single-use placeholder as its `token` parameter, never the code,
  so the code cannot reach a URL, a log line or an error trace. The authorization object carries both
  `hashToken(placeholder)` — matching what Auth.js will pass to the adapter — and the real
  `loginCodeHash` used for the actual lookup.
- Returning JSON rather than the raw 302 keeps the client contract identical in shape to the existing
  `/api/auth/signin/email` response the login form already consumes, and lets the client navigate with
  a validated path.

**Alternatives considered**:

- *Create the session directly through the adapter and set the cookie manually.* Rejected: duplicates
  cookie naming, security attributes and expiry rules that Auth.js already owns, and would drift.
- *Reuse `GET /api/auth/callback/email` directly with the code as `token`.* Rejected: puts the code in
  a URL and in browser history.
- *A Server Action instead of a route handler.* Rejected: the existing login client is a `fetch`-based
  state machine against `/api/auth/*`, and the CSRF token it already holds is the Auth.js one.

## R4. Code alphabet, generation and normalization

**Decision**: Alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (32 symbols, Crockford-style, excluding
`I`, `L`, `O`, `U`). Ten characters drawn with `crypto.randomInt(0, 32)` per position, giving exactly
50 bits with no modulo bias. Normalization before validation: trim, upper-case, remove internal
whitespace and hyphens; anything left outside the alphabet, or a length other than 10, is rejected.

**Rationale**: matches the spec's clarified decision. `randomInt` is the Node primitive that avoids the
modulo bias a naive `randomBytes % 32` would introduce. Rejecting rather than mapping stray characters
preserves the rule that two different sequences are never equivalent — Crockford's own `I→1`, `O→0`
decode aliases are deliberately not implemented.

**Alternatives considered**: full 36-symbol alphanumeric (rejected: keeps `0`/`O` and `1`/`I`/`L`
confusable when transcribing from a phone); alias decoding (rejected by clarification).

## R5. Reducing the login challenge TTL to 5 minutes

**Decision**: Parameterize `maxAge` in `createInternalEmailProvider`
([src/lib/auth.ts](../../src/lib/auth.ts)) and pass `5 * 60` for the `email` provider only. The
`signup` and `account-deletion` providers keep `15 * 60`, and `SIGNUP_TOKEN_TTL_MS` in
[src/modules/signup/token.ts](../../src/modules/signup/token.ts) is untouched.

**Rationale**: the helper is shared by three providers today, so a naive edit would silently shorten
sign-up activation and account-deletion re-authentication, both of which are Non-Goals. Auth.js derives
`expires` from `maxAge`, so this single value governs both the link and the code and keeps FR-005 and
FR-006 true by construction. The English, Spanish and Catalan `Email.loginMagicLink` copy must change
from 15 to 5 minutes in the same commit so the stated validity never drifts from the enforced one.

## R6. Rate limiting and the attempt budget

**Decision**: Reuse `consumeSharedRateLimit` ([src/lib/shared-rate-limit.ts](../../src/lib/shared-rate-limit.ts))
with two new key families in a 5-minute window, limit 10 each:
`auth:login-code:client:<trusted-client-id>` and `auth:login-code:address:<sha256(normalized-email)>`,
the address key produced by the same helper shape as
[src/lib/auth-email-rate-limit.ts](../../src/lib/auth-email-rate-limit.ts). Separately, the
per-challenge budget is the `loginCodeAttempts` column: a failed attempt against an existing challenge
increments it inside a transaction, and the row is deleted once it reaches 5.

**Rationale**: the shared PostgreSQL bucket is already the project's multi-instance-safe limiter, so no
cache or new service is needed (Principle VII). Client and address keys are charged before the database
lookup so an attacker cannot use the limiter itself as an oracle. Keeping the per-challenge budget on
the row makes it atomic with consumption and automatically disappears when the challenge does.

**Alternatives considered**: a third `auth:login-code:challenge:*` bucket — rejected as redundant with
a column that is already transactional with the challenge and cleaned up with it; progressive backoff —
rejected by clarification.

## R7. Placing the code in the email

**Decision**: Add `verificationCode` to `EMAIL_VARIANT_DEFINITIONS.loginMagicLink.valueKeys` and to
`EmailVariantValues.loginMagicLink`, validate it in `validateEmailPresentationRequest` against the
exact alphabet and length, and render it as a dedicated high-contrast monospace block beneath the
existing action button. The catalog keys stay exactly as they are; only the `loginMagicLink` strings
change, with `fallbackInstruction` carrying the reference sentence about the 5-minute validity and the
code.

**Rationale**: the presentation layer rejects unknown request fields and enforces an exact copy-key set
per variant, so the code has to be introduced through the variant contract; doing so also gets it into
the plain-text body automatically because both bodies render from the same document. Not adding copy
keys avoids touching the shared `BASE_COPY_KEYS`/`ACTION_COPY_KEYS` validation that every other variant
depends on. The renderer's existing guards — no leftover `{...}` placeholders, no literal `undefined`,
no `<script>` — apply unchanged to the new block.

**Alternatives considered**: interpolating `{verificationCode}` into a paragraph (the placeholder
mechanism already supports it) — rejected because the issue requires the code to be visually prominent
and easy to copy, which inline body text does not achieve; a new `codeLabel` copy key — rejected as an
avoidable change to a validator shared by twelve variants.

## R8. Login UI state model and accessibility

**Decision**: `login-form.tsx` becomes a three-step orchestrator (`email` → `checkEmail` → `code`) on
the single `/[locale]/login` URL, holding the submitted address, locale and callback path in React
state. Each step renders its own heading with `tabIndex={-1}` and receives focus on entry. The code
input is one semantic `<input>` with `autoComplete="one-time-code"`, an accessible label and
description, and an `aria-live` status region reused from the existing form.

**Rationale**: satisfies the clarified single-URL model (no address in the URL, no new history entries,
reload returns to the email step) and keeps the brand lock-up already rendered by
[src/app/[locale]/login/page.tsx](../../src/app/[locale]/login/page.tsx) above the card, so FR-015's
logo and brand requirement is met without duplicating chrome. A single input rather than ten segmented
inputs is what makes paste, screen-reader labelling and keyboard navigation work without custom
key-handling.

**Alternatives considered**: separate routes per step (rejected by clarification — new history entries
and an address in the URL); ten segmented inputs (rejected: hostile to paste and assistive technology,
and the spec explicitly permits a segmented appearance over a single semantic field).

## R9. Response uniformity and timing

**Decision**: Every `POST /api/auth/login/code` response — accepted, rejected, and attempt-exhausted —
passes through the existing `waitForAcceptedLogin` envelope (500 ms floor plus 0-100 ms jitter) from
[src/modules/login/service.ts](../../src/modules/login/service.ts), and every non-throttled failure
returns the identical `{ status: "invalid_code" }` body with HTTP 400.

**Rationale**: without a floor, "a pending challenge exists for this address" would be observable from
response time — a pending challenge implies an active account, which would reopen the enumeration hole
the current design closes. Reusing the existing helper keeps one envelope definition and one place to
test it. Malformed input is mapped to the same generic failure rather than a field error so the code
format is not confirmed to an attacker.

**Alternatives considered**: no delay on failures (rejected: timing oracle); a distinct
`invalid_format` response (rejected: leaks structure and breaks the uniform-error requirement).
