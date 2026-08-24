# UI Contract: Personal Data Export

## Route Contract

| Locale | Protected Data & Privacy | Signed-out destination |
|---|---|---|
| English | `/account/data` | `/login?callbackUrl=%2Faccount%2Fdata` |
| Spanish | `/es/account/data` | `/es/login?callbackUrl=%2Fes%2Faccount%2Fdata` |
| Catalan | `/ca/account/data` | `/ca/login?callbackUrl=%2Fca%2Faccount%2Fdata` |

- Server authorization resolves the Auth.js identity plus exact active database Session before the
  export panel or deletion section renders.
- The unframed Download your data section appears after the page heading and before permanent
  account deletion in all locales.
- Signed-out/expired/revoked Sessions enter the existing localized login flow with only the fixed
  validated local callback.
- Callback query state is limited to `ready`, `invalid`, or `rate_limited` plus a bounded positive
  `retryAfter`. It contains no token, account/Session identity, grant, contributor, scope, filename,
  or export content.
- Query state is presentation only. The server rechecks the exact Session and grant before rendering
  Download data; `exportState=ready` cannot create or substitute authorization.
- Refresh/direct access never requests email, consumes a credential, generates data, or starts a
  download.

## Server Projection

The page passes the client panel only:

| Value | Rule |
|---|---|
| `locale` | Active validated locale |
| `authorizationState` | Server-derived `absent`, `ready`, or `expired` for exact Session |
| `expiresAt` | ISO timestamp only for ready state |
| `callbackNotice` | Generic allowlisted presentation state only |

It does not pass email, User ID, Session ID/token, credential, grant row, contributor list,
rate-limit key/count, or export fields.

## Panel State Machine

| State | Entry | Visible behavior/actions | Exit |
|---|---|---|---|
| `idle` | Authorized render without ready grant | Sensitivity warning; Request data export | Activate -> `requesting` |
| `requesting` | Request POST pending | Stable pending label/status; no duplicate request | Accepted -> `sent`; rate limit -> `rate_limited`; failure -> `request_error`; unauthenticated -> login |
| `sent` | Provider accepted email | Generic email-sent notice; no file/grant/download action | New manual request -> `requesting`; callback occurs through page navigation |
| `ready` | Server confirms exact unexpired Session grant | Download data; localized remaining window | Activate -> `downloading`; countdown reaches zero -> `expired` |
| `downloading` | Download POST pending | Stable pending label/status; request and duplicate download disabled | Attachment ready -> `downloaded`; not ready -> `expired`; rate limit -> `rate_limited`; failure -> `download_error`; unauthenticated -> login |
| `downloaded` | Complete response saved by browser action | Generic success and sensitivity reminder; Download data remains available while grant valid and under limit | Manual repeat -> `downloading`; expiry -> `expired` |
| `expired` | Server says no grant/expired, or countdown reaches zero | Download unavailable; Request new export confirmation | Activate -> `requesting` |
| `rate_limited` | Any operation exhausts its allowance | Generic wait message using validated remaining seconds; relevant manual retry disabled until local countdown ends | Manual retry after countdown -> prior applicable pending state |
| `request_error` | Definitive request/provider/internal failure | Generic assertive error; Request retry | Retry -> `requesting` |
| `download_error` | Snapshot/contributor/size/time/network failure | Generic assertive error; explicit Download retry only while grant may remain valid | Retry -> `downloading`; expiry/not-ready -> `expired` |
| `invalid_callback` | Generic malformed/expired/replayed/signed-out/conflicting callback return | Generic assertive invalid-confirmation notice; no account state reason | Dismiss -> server-derived `idle`/`ready`; manual request -> `requesting` |

The client countdown is presentation only. Request, confirmation, and generation all re-evaluate
authoritative database time. No state automatically retries email, confirmation, or generation.

## Request Contract

- The body contains CSRF proof and locale only; exact Session supplies account and recipient.
- First activation sends no export content and writes no grant.
- Provider acceptance enters `sent`; it does not claim inbox delivery.
- Provider rejection/timeout/error compensates only the provisional new credential. A prior
  delivered export link remains usable.
- The 5/client and 3/account limits return generic wait plus `Retry-After` before provider delivery.
- A successful later provider finalization supersedes older delivered export credentials for the
  account; other verification purposes remain unchanged.

## Confirmation Contract

- The raw credential necessarily appears only in the inbound email callback URL. Email copy warns
  that the action requires an already-active same-account Session and expires in 15 minutes.
- Top-level webmail navigation may omit `Origin`; the route validates effective canonical
  scheme/host/port and ignores arbitrary return destinations.
- The 5/client confirmation limit is consumed before token hashing/lookup. The validated link locale
  supplies only the clean localized rate-limit destination in that branch.
- A valid delivered credential plus exact active same-account Session atomically consumes the token
  and creates/replaces only that Session's grant until the token's original expiry.
- The callback creates no Session/cookie, changes no `authenticatedAt`, and grants no deletion,
  revocation, profile, login, signup, or other privilege.
- Signed-out, expired/revoked Session, conflicting account, malformed, expired, consumed,
  superseded, wrong-purpose, and internal failure all redirect to the same generic invalid state.
  They do not consume an otherwise valid token unless the complete grant transaction commits.
- Every redirect is allowlisted, credential-free, `no-store`, and `Referrer-Policy: no-referrer`.

## Download Contract

- Only explicit Download data activation sends the strict CSRF-protected POST. Confirmation and page
  render never generate or download a file.
- The 3/exact-Session limit rejects before contributor invocation.
- Server rechecks active Session/User, grant ownership, and original expiry inside the read-only
  snapshot transaction.
- The browser receives bytes only after complete generation, validation, canonical serialization,
  size check, and transaction success. It never receives a partial attachment.
- The client accepts the filename only when it matches the contract's ASCII pattern, reads the
  response as one Blob, triggers one download, and immediately revokes the temporary object URL.
- Network loss never automatically repeats the POST. The user may make a new explicit attempt while
  authorization/time/rate limits permit.
- Successful download does not consume the grant. Each manual retry/repeat generates a new
  point-in-time snapshot and counts toward the same Session limit.
- UI never renders export content or reports section-level/internal failure detail.

## Availability Countdown

- Ready state displays a localized remaining window derived from server `expiresAt`.
- Use an absolute expiry, not a decrementing authority value; recompute display from current client
  time so tab suspension does not extend it.
- At zero, disable/remove Download data and show Request new confirmation.
- Client clock skew can only disable early or display stale readiness; the server remains
  authoritative and maps any rejected download to `expired`/generic not-ready.
- Countdown announcement is not emitted every second. Announce initial availability, one final
  warning near expiry, and expiry to avoid screen-reader noise.

## Focus, Keyboard, and Announcement Contract

- Request data export and Download data are native buttons with visible focus and WCAG 2.2 target
  size. Download may include the existing Lucide download icon plus visible text; icon is hidden from
  assistive technology.
- Pending labels occupy stable dimensions and disable repeated activation without moving layout.
- `requesting` and `downloading` use one polite status region.
- `sent`, `ready`, and `downloaded` use concise polite announcements.
- Invalid callback, request error, download error, and rate limit use a generic assertive alert; on
  client-side transition, focus moves to the alert after controls become operable.
- When ready expires, focus remains coherent: if focused Download data disappears, move focus to the
  export section heading or replacement Request button.
- No state change steals focus during ordinary countdown updates.
- Keyboard order follows section heading/description, sensitivity warning, status, then current
  action. Meaning never depends only on color, icon, position, animation, or pointer hover.
- Automated axe checks report zero serious/critical violations in idle, sent, ready, expired,
  rate-limited, and error states.

## Responsive and Localization Contract

- Existing desktop account navigation remains beside unframed page content; mobile navigation
  remains above it.
- Export and deletion are sibling page sections, never nested cards. Export uses a neutral boundary;
  deletion retains its destructive visual treatment.
- Long English, Spanish, and Catalan warnings/statuses wrap within the content column. Actions use
  stable responsive dimensions and stack only when necessary.
- At 375 x 667 and 1440 x 900, all states have zero document horizontal overflow, clipped action,
  overlap, obscured focus, or content collision.
- Light/dark themes preserve contrast for warning, status, error, disabled, border, action, and
  focus states. Reduced-motion preference removes non-essential transitions.
- Every visible string, email string, status, countdown unit, error, and filename-adjacent label
  comes from the supported locale catalogs. The filename itself remains stable ASCII.

## Security and Privacy Presentation Contract

- Copy states that the JSON file may contain sensitive information and should be stored securely.
- UI never displays the authoritative account email as confirmation of request success, avoiding
  shoulder-surfing and account enumeration detail.
- Generic failures do not distinguish account status, Session conflict, token state, contributor,
  size/time breach, or database/provider error.
- URLs after callback contain only allowlisted generic state and bounded retry seconds.
- No analytics event, browser storage entry, DOM data attribute, error object, or console message
  contains credential, grant, export content, account/Session identity, or filename derived from a
  person.

## Test Hooks and Assertions

- Prefer role/name/status/alert and visible outcome locators; do not locate by CSS, hidden IDs, token,
  Session selector, or data attributes carrying authority.
- Use separate Playwright contexts for initiating Session, another active same-account Session,
  conflicting account, and signed-out browser.
- Capture provider messages through the existing HTTP fixture; never print links/tokens in test
  output or attachments.
- Assert callback `Location`, history/current URL, Referer policy, application logs, and browser
  console contain no raw credential after processing.
- Assert confirmation in one same-account context exposes Download data only there, not in the
  requesting or another Session.
- Intercept a download only after allowing server generation to complete; assert no automatic second
  POST after response loss.
- Parse attachment bytes and validate schema, canonical ordering, expected built-ins, same-account
  data, forbidden-field absence, filename, Content-Length, no-store, nosniff, and UTF-8.
- Assert request/confirmation/generation exact limits across two app instances and zero downstream
  protected work after exhaustion.
- Assert focus, pending lockout, expiry transition, announcement cadence, all locale copy, both
  themes, axe, and the two required viewports explicitly.
