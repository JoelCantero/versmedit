# UI Contract: Account Security and Active Sessions

## Route Contract

| Locale | Protected Security route | Signed-out destination |
|---|---|---|
| English | `/account/security` | `/login?callbackUrl=%2Faccount%2Fsecurity` |
| Spanish | `/es/account/security` | `/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity` |
| Catalan | `/ca/account/security` | `/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity` |

- Server authorization completes before any account or session projection renders.
- Account navigation contains Profile, Data & Privacy, and Security; Security exposes
  `aria-current="page"` and every destination preserves the active locale.
- A return destination is accepted only after the existing application-local callback validator.
- Callback state is limited to `reauthenticated`, `invalid_link`, or `session_conflict`. It contains
  no identity, session selector, revocation action, return URL, or credential.
- Refreshing or directly opening a callback-state URL never starts reauthentication or revocation.

## Protected Render Contract

The server derives the exact current row from the trusted Auth.js session cookie and projects only:

| Value | Rendering and trust rule |
|---|---|
| `sessionId` | Opaque action value passed to the individual-revocation control; never visible, placed in a URL/data attribute, used as a React key visible to tests, or logged |
| `createdAt` | Localized immutable session-start date/time, or localized Unavailable when null |
| `expires` | Localized explicit date/time |
| `current` | Computed server-side; controls page presentation only and is never posted as authority |
| `ordinal` | Generic localized session number used to distinguish rows without inventing a device identity |

- Select only unexpired rows owned by the current account, up to the hard maximum of 20.
- Pin the exact current row first and mark it Current session; order all other rows by
  `createdAt DESC NULLS LAST`, then `id DESC`.
- Use a semantic list with one stable row per session. The generic row title, dates, current marker,
  and action form one accessible name/description even when two timestamps are identical.
- Do not render email, user/account ID, token, cookie, IP, location, browser, operating system,
  user agent, fingerprint, inferred device name, last-active claim, or session ID text.
- The current row exposes the existing Sign out command and no revoke command.
- Every other row exposes a Revoke session command. Revoke all other sessions is available only
  while at least one other row is active.
- The page does not infer success from local removal. It renders or retrieves the authoritative
  server projection after every mutation outcome.

## Page States

| State | Entry | Visible behavior | Exit |
|---|---|---|---|
| `ready_multiple` | Authorized render with 2-20 active rows | Current row first; individual commands; bulk command | Open an individual or bulk review |
| `current_only` | Authorized render with exactly one active row | Current marker and sign-out; localized only-current message; no bulk command | A later authoritative refresh may enter `ready_multiple` |
| `reauthenticated` | Valid callback refreshed the exact existing session in this browser | Generic localized success notice; unchanged session count; refreshed list; no selected action or open dialog | Dismiss notice or select a new action |
| `invalid_link` | Malformed, expired, consumed, superseded, wrong-purpose, signed-out, expired-session, or failed callback | Same generic localized invalid-link alert; sessions unchanged | Dismiss alert or request reauthentication from a newly selected action |
| `session_conflict` | Valid link opened while another account is signed in | Generic localized conflict alert without either identity | Existing safe authentication recovery only |
| `recovered` | A revocation response was lost and Security was refreshed | Authoritative list plus generic review-the-list announcement | Select a new action only after review |

## Confirmation and Reauthentication States

| State | Entry | Available actions | Exit |
|---|---|---|---|
| `closed` | Initial page, callback return, prior cancel, or completed refresh | Choose one listed action | Individual -> `review_individual`; bulk -> `review_bulk` |
| `review_individual` | Revoke command for one rendered non-current row | Cancel; confirm Revoke session | Cancel -> `closed`; confirm -> `revoking_individual` |
| `review_bulk` | Revoke all other sessions | Cancel; confirm Revoke all other sessions | Cancel -> `closed`; confirm -> `revoking_bulk` |
| `revoking_individual` | Strict individual POST pending | No duplicate submit or dismiss-as-cancel | Completed -> `refreshing`; stale -> `reauth_required`; definitive error -> `revocation_error`; lost response -> `recovering` |
| `revoking_bulk` | Strict bulk POST pending | No duplicate submit or dismiss-as-cancel | Same outcome mapping as individual |
| `reauth_required` | Server returns stale/unknown evidence before any mutation | Cancel; Send fresh link | Send -> `sending_reauth`; Cancel -> `closed` |
| `sending_reauth` | Reauthentication POST pending | No duplicate send or dismiss-as-cancel | Accepted -> `reauth_sent`; failure -> `reauth_error` |
| `reauth_sent` | Provider accepted the message | Close dialog | Link consumed in an active same-account session -> closed callback page state; no automatic return to this action |
| `reauth_error` | Invalid request, provider failure, or rate limit | Cancel; retry when allowed | Retry -> `sending_reauth`; Cancel -> `closed` |
| `revocation_error` | Transaction definitively rolled back | Close and review refreshed state | `refreshing`, then `closed` with generic alert |
| `refreshing` | Any received mutation outcome | No mutation; retrieve authoritative server render | Authorized -> `closed`; session invalid -> localized login |
| `recovering` | Mutation response not received | No automatic POST retry; navigate/refresh Security once | Authorized -> `recovered`; session invalid -> localized login |

The initial page may know that its current session appears fresh, but only the final locked server
check authorizes mutation. A `409` always discards the pending mutation. The callback starts a new
page state and deliberately cannot reopen either review.

## Fresh Authentication Contract

- Issuance derives recipient/account from the exact active session and sends one localized
  `ACCOUNT_SECURITY` link after shared client/address limits and provider acceptance.
- The consuming browser must already hold an unexpired active session for the credential's same
  account. It may be the initiating browser or another browser already signed in to that account.
- Under normalized-address then user advisory locks, callback consumption rechecks the delivered
  unexpired credential, active account, and exact cookie session; token deletion and updating only
  that row's `authenticatedAt` commit together.
- Consumption creates no `Session` or cookie, deletes no session, and keeps the active count and row
  identities unchanged, including when the account already has 20 sessions.
- Signed-out, expired-session, conflicting-account, malformed, expired, consumed, superseded, and
  wrong-purpose callbacks update nothing. A valid credential presented without an eligible session
  is not consumed and remains usable by an eligible browser until expiry or supersession.
- The raw token necessarily appears in the intended recipient's inbound email URL. The callback
  never renders, logs, reflects, or carries it into `Location`; every resulting page URL is
  credential-free.
- Clicking from webmail is an expected top-level cross-site navigation. The callback accepts a
  missing HTTP `Origin` header and ignores `Referer`; it validates the externally effective request
  scheme/host/port against the configured canonical origin using trusted ingress semantics.
- Success returns to the exact localized Security page with a refreshed list and generic notice.
  No target/action survives, so the person must select and confirm again from that browser.

## Individual Review Contract

- The dialog names the generic session ordinal and repeats its localized authentication/unavailable
  and expiry values so the person can verify the selected row.
- Copy states that only that session will end, it will fail its next protected request, and the
  current and other sessions will remain active.
- The submitted body contains CSRF proof, locale, `revoke_session`, and the opaque `sessionId`.
- If the selector became expired, missing, current, foreign, or already revoked, the server returns
  the same completed shape, and the authoritative refresh is the only resulting evidence.

## Bulk Review Contract

- The dialog states that every session except the one confirming now will end and that newly
  created sessions existing at confirmation time are included.
- It does not state a precomputed count as an authoritative outcome.
- The submitted body contains CSRF proof, locale, and `revoke_other_sessions`; it contains no target.
- A completed operation leaves the exact confirming session as the sole session for the account,
  even if the displayed list changed while the dialog was open.

## Focus, Keyboard, and Announcement Contract

- Base UI Dialog provides modal role, labelled title/description, focus containment, Escape and
  overlay cancellation before pending work, and focus restoration.
- Opening either review places initial focus on Cancel, not the destructive confirmation.
- Keyboard order follows title and consequences, Cancel, then the destructive action.
- Cancel, Escape, close control, and overlay are equivalent before a request starts; cancellation
  changes no session and restores focus to the exact initiating command.
- During `sending_reauth`, `revoking_individual`, or `revoking_bulk`, duplicate controls and dialog
  dismissal are disabled. Pending text uses a polite status region and a stable button footprint.
- Provider, rate-limit, callback, and revocation failures use a generic assertive alert and move
  programmatic focus to it after controls are restored.
- Successful or recovered refresh announces the resulting list state politely. If an individually
  revoked row and its initiating control disappear, focus moves to the session-list heading rather
  than attempting to restore a removed node.
- Native buttons/links expose visible focus and WCAG 2.2 target size. Meaning never depends only on
  color, icon, position, animation, or pointer hover.
- Automated axe checks report zero serious or critical violations in page, review, pending, reauth,
  error, recovered, and current-only states.

## Responsive and Localization Contract

- Desktop keeps the existing unframed account navigation beside the content; mobile places it above.
- The 20-row list uses bounded tracks; date text wraps and action controls never resize a row on
  pending-label changes. No session label uses viewport-scaled type.
- Confirmation width respects viewport padding; its body scrolls internally and actions stack when
  needed without hiding Cancel or confirm.
- At 320 x 900 and supported desktop sizes, longest English, Spanish, and Catalan strings produce no
  horizontal document overflow, overlap, clipped action, hidden timestamp, or obscured focus.
- Dates use the active locale and an explicit date plus time; machine-readable values use the
  corresponding `time` element `dateTime` attribute.
- Light/dark themes meet contrast for text, borders, current state, destructive action, errors,
  disabled controls, and focus. Reduced-motion preference removes non-essential transitions.

## Lost-Response and Replay Contract

1. Disable a second activation while a POST is in flight.
2. When any HTTP response arrives, do not optimistically edit the list; refresh the protected route.
3. On a network exception or aborted response, do not repeat the POST through fetch retries, query
   libraries, service workers, effects, browser recovery, or form resubmission.
4. Navigate or refresh the canonical localized Security route once, clearing action/dialog state.
5. Show the authoritative rows and a generic recovered announcement; do not claim whether the
   prior request committed.
6. A later manual action starts from a newly selected row and a new explicit confirmation.
7. Server replay remains convergent: individual missing targets are completed no-ops, and bulk
   preserves the current session observed by each authorized locked request.

## Test Hooks and Assertions

- Prefer role/name/text locators and visible outcomes; never expose or locate by `Session.id` or CSS.
- Use separate Playwright browser contexts for current, selected-other, and additional sessions;
  pre-authenticate any second context used to consume a valid security link.
- Intercept only a revocation response after allowing the server request to complete; assert no
  second POST and verify the refreshed authoritative list plus access from each context.
- While a dialog remains open, establish another session in a separate context before bulk confirm;
  assert only the confirming context remains authorized.
- Verify malformed/foreign/current selectors at the HTTP/integration boundary, not through hidden UI.
- Consume a valid link while exactly 20 sessions are active and assert the same row identities/count
  remain, only the consuming row's authentication time changes, and no context loses access.
- Assert focus target, restoration, pending lockout, Escape, live-region announcements, localized
  date/unavailable copy, all three locales, 20 rows, both themes, and 320 px overflow explicitly.
