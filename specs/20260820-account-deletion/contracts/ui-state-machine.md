# UI Contract: Permanent Account Deletion

## Route Contract

| Locale | Protected Data & Privacy | Public completion | Signed-out destination |
|---|---|---|---|
| English | `/account/data` | `/account-deleted` | `/login?callbackUrl=%2Faccount%2Fdata` |
| Spanish | `/es/account/data` | `/es/account-deleted` | `/es/login?callbackUrl=%2Fes%2Faccount%2Fdata` |
| Catalan | `/ca/account/data` | `/ca/account-deleted` | `/ca/login?callbackUrl=%2Fca%2Faccount%2Fdata` |

- Protected routes render no account data before server-side session authorization.
- Account navigation contains Profile and Data & Privacy with the active item exposed through
  `aria-current="page"`.
- `/account/data?intent=delete` and localized equivalents are accepted only as the fixed return from
  a valid deletion verification link. The query carries no identity and opens the review dialog;
  it never starts deletion.
- The public completion route is generic, contains no account data, and links to localized home.

## Dialog States

| State | Entry | Available actions | Exit |
|---|---|---|---|
| `closed` | Page rendered or prior cancel | Delete account | Open -> `reviewing` |
| `reviewing` | First Delete account activation | Cancel; continue according to session freshness | Cancel -> `closed`; stale -> `reauth_required`; recent -> `final_ready` |
| `reauth_required` | Session timestamp null/older than 10 minutes | Cancel; Send fresh link | Send -> `sending_reauth` |
| `sending_reauth` | Reauthentication POST pending | No duplicate submit; no destructive action | Accepted -> `reauth_sent`; failure -> `reauth_error` |
| `reauth_sent` | Provider accepted message | Close dialog | Link callback in any eligible browser -> `final_ready` on localized Data & Privacy |
| `reauth_error` | Provider/rate-limit/request failure | Cancel; retry when allowed | Retry -> `sending_reauth`; Cancel -> `closed` |
| `final_ready` | Exact session authenticated within 10 minutes | Cancel; Permanently delete account | Confirm -> `deleting`; Cancel -> `closed` |
| `deleting` | Final POST pending | No duplicate submit or dismiss-as-cancel | Completed -> public route; stale -> `reauth_required`; rate-limited/failure -> `deletion_error`; network loss -> `recovering` |
| `deletion_error` | Definitive rate-limit, rollback, or generic failure | Cancel; retry when allowed while session remains recent | Retry -> `deleting`; Cancel -> `closed` |
| `recovering` | Final response was not received | No automatic POST retry; wait for connectivity and check session once | Invalid former session -> public route; valid session -> `deletion_error` |

Every transition preserves the active locale. No state displays email, account ID, token, cookie,
record count, provider internals, database details, or whether another account exists.

## Required Consequence Copy

Before `final_ready` can submit, the dialog communicates in the active locale that deletion:

1. Is permanent and irreversible.
2. Signs the person out on this and every other device.
3. Invalidates pending sign-in and signup links.
4. Removes profile, authentication identities, sessions, and policy acceptances.
5. Prevents access to the deleted account.

Cancel and Permanently delete account must be named by outcome; color is not the only distinction.

## Focus and Keyboard Contract

- Opening places initial focus on Cancel, not the destructive action.
- Base UI Dialog supplies modal semantics, title/description association, focus containment, Escape,
  overlay dismissal, and restoration to Delete account.
- Cancel, Escape, and close affordance are equivalent before `deleting`.
- During `deleting`, dismissal is blocked and the progress state is announced politely; this cannot
  be represented as cancellation.
- `reauth_error` and `deletion_error` use an assertive alert and receive programmatic focus after
  controls are restored.
- `sending_reauth` and `deleting` expose stable pending labels and prevent repeated activation.
- All controls are native buttons/links with visible focus and at least WCAG 2.2 minimum target size.
- Keyboard order follows title/description, Cancel, then the current primary action.
- On cancel, focus returns to Delete account. On navigation to public completion, focus starts at the
  page heading through normal route focus behavior.

## Responsive Contract

- On desktop, shared account navigation remains beside unframed page content.
- On mobile, navigation appears above content; the dialog body scrolls internally when required.
- The dialog width is constrained by viewport padding; actions wrap or stack without clipping.
- At 320 x 900 and desktop verification sizes, longest English/Spanish/Catalan content has no
  horizontal document overflow, hidden action, overlap, or obscured focus.
- Light and dark themes preserve text, destructive control, border, focus, error, and overlay
  contrast. Reduced-motion preference disables non-essential transitions.

## Fresh Authentication Contract

- The request sends CSRF proof and locale only; server session supplies identity and recipient.
- Delivery failure leaves the dialog open, account/session unchanged, controls restored, generic
  error announced, and retry available.
- A valid single-use link may be opened in another browser/device unless that browser is currently
  authenticated as a different account.
- Valid callback creates a normal Auth.js database session with fresh authentication time, returns
  to localized Data & Privacy, reopens the review dialog, and still requires final confirmation.
- Expired, consumed, superseded, wrong-purpose, malformed, or conflicting-session links show the
  same generic localized invalid result and never delete data.

## Abuse-Control Contract

- Reauthentication and final deletion use separate client-scoped shared database buckets, each
  limited to 5 requests per 15 minutes.
- Reauthentication additionally uses the shared exact-address bucket limited to 3 requests per 15
  minutes, so requests from different clients cannot bypass email-delivery protection.
- Exhaustion returns a generic rate-limited result with `Retry-After` before email delivery or the
  deletion transaction. The dialog keeps no automatic retry timer and permits retry when allowed.
- Successful deletion removes the exact address bucket and retains operation-specific client and
  global/provider buckets.

## Pending Deletion Signal Contract

Immediately before final POST, write this non-authoritative value to `sessionStorage`:

```json
{
  "locale": "en",
  "expiresAt": 0
}
```

`expiresAt` is a real epoch timestamp no more than 10 minutes ahead; zero above is illustrative.
The key and value contain no account identity or credential.

- Definitive `completed`, `reauthentication_required`, `rate_limited`, `deletion_failed`, invalid
  request, or authenticated error clears the signal.
- A network exception retains the signal until connectivity returns or it expires.
- Recovery checks the existing Auth.js session endpoint once and never resubmits final deletion.
- Valid signal + no authorized session -> clear signal and navigate to localized public completion.
- Valid signal + authorized session -> clear signal, keep/reopen dialog, and announce retryable error.
- Missing/expired/malformed signal -> clear it and follow ordinary authentication behavior; never
  infer deletion.

## Public Completion Contract

- Heading and brief text state only that the account was permanently deleted.
- One localized link returns to public home.
- URL, title, body, metadata, analytics payloads, and logs contain no account attributes.
- Refresh and direct access render the same generic public page.

## Test Hooks and Assertions

- Prefer role/name locators and visible user outcomes; do not couple E2E tests to CSS classes.
- Use separate Playwright browser contexts for cross-device link consumption and other-device
  session revocation.
- Intercept/abort only the final response for lost-response recovery; allow the server request to
  complete, then assert no second POST occurs.
- Run axe checks in closed, reviewing, reauth error, final-ready, deletion error, and public states.
- Assert focus target, Escape behavior, restoration, pending lockout, live-region text, cookie
  removal, all-locale copy, and 320 px overflow explicitly.