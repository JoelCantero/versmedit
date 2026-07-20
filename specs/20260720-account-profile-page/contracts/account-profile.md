# Contract: Localized Account Profile

## Interface Scope

This contract covers the user-facing account route, authenticated page access, the profile form Server Action, safe login return behavior, and the future registration-name invariant. It does not define a public REST API.

## Localized Page Contract

| Locale | Account route | Login route |
|---|---|---|
| English | `/account` | `/login` |
| Spanish | `/es/account` | `/es/login` |
| Catalan | `/ca/account` | `/ca/login` |

### Authenticated request

- Render only the current server-session user's `name`, `email`, and `image`.
- Display Profile as the only settings navigation item.
- Expose the active item with `aria-current="page"`.
- Desktop: navigation column beside form content.
- Mobile: compact navigation above form content.
- Render image avatar when usable; otherwise render accessible derived initials.
- Render `name` as editable and `email` as semantically and visually read-only.
- Include localized explanation that email is used to access the account.

### Unauthenticated request

Redirect without rendering profile data:

```text
/account    -> /login?callbackUrl=%2Faccount
/es/account -> /es/login?callbackUrl=%2Fes%2Faccount
/ca/account -> /ca/login?callbackUrl=%2Fca%2Faccount
```

The callback is application-local, locale-matched, and server validated.

## Login Return Contract

The login page may receive a callback query value. It validates that value before passing it to the existing login form.

Accepted callback values:

- `/account` for English
- `/es/account` for Spanish
- `/ca/account` for Catalan

Rejected values include absolute URLs, protocol-relative URLs, encoded external URLs, a different locale's account path, unknown application paths, and malformed values. Rejected or absent callbacks use the active locale home path. Email magic-link request, anti-enumeration response, SMTP provider, CSRF validation, and existing-user-only behavior remain unchanged.

## Profile Form Contract

### Display fields

| Field | Control | Semantics |
|---|---|---|
| Avatar | Image or initials | Accessible name identifies it as the current user's profile image; no upload/remove controls |
| Name | Text input | Explicit label, required, `maxLength=80`, appropriate autocomplete, error association |
| Email | Read-only email input | Explicit label, `readOnly` semantics, visible read-only styling, explanatory description |
| Save changes | Submit button | Disabled/pending state and pending label during submission |

All visible strings and assistive messages come from `Account` entries in the `en`, `es`, and `ca` message catalogs.

## Server Action Contract: `updateProfile`

### Trusted context

- Active locale validated from bound route context and never accepted as a mutation entry.
- Current user resolved exclusively by `getServerSession(authOptions)` at invocation time.
- No trusted identity or ownership value comes from the form.

### Client adapter and input

The profile form uses a client action-state adapter. The adapter enumerates all successful form
controls and sends an ordered entry list to the Server Action. This keeps Next.js action transport
metadata outside the domain payload while preserving duplicate and unknown controls for
authoritative rejection.

The resulting domain payload MUST contain exactly one entry:

```text
name=<string>
```

Strict validation order:

1. Confirm an authenticated server session. If absent/invalid, write nothing and redirect to localized login with localized account callback.
2. Validate the serialized form-entry list without dropping duplicate or unknown controls.
3. Require exactly one string `name` tuple and reject any duplicate/extra field, including locale.
4. Trim surrounding whitespace.
5. Require 1–80 characters.
6. Accept only Unicode letters, spaces, `'`, `’`, and `-`.
7. Update the session-associated existing User with explicit data `{ name: normalizedName }`.

### Serializable outcomes

```ts
type ProfileActionState =
  | { status: "idle"; name: string }
  | { status: "success"; name: string; message: "saved" }
  | {
      status: "validation_error";
      name: string;
      field: "name" | "form";
      message: "required" | "too_long" | "invalid_characters" | "invalid_submission";
    }
  | { status: "persistence_error"; name: string; message: "save_failed" };
```

Authentication failure redirects and does not return an action state.

### Outcome behavior

| Outcome | Persistence | Value | Focus | Announcement |
|---|---|---|---|---|
| Success | Only normalized `User.name` | Persisted normalized name | Remains predictable on submit action | Polite success status |
| Validation error | None | Attempted value retained | Move to name input | Assertive associated error |
| Extra/duplicate field | None | Submitted name retained when safely available | Move to name input | Generic invalid-submission error |
| Persistence error | None/transaction fails atomically | Attempted valid value retained | Remain on Save changes | Assertive generic failure |
| Invalid session | None | N/A | Navigation to login | Standard login page behavior |

Failures never reveal another account's existence or include PII, tokens, stack traces, or database details in logs or responses.

## Replay and Concurrency Contract

- Replaying the same valid action is idempotent with respect to record count and fields other than `name`.
- The client prevents a second submission while pending, but the server remains safe if requests are replayed.
- Concurrent valid updates for the same authenticated user follow last server-accepted write wins.
- No update operation uses `create`, `upsert`, or a client-provided selector.

## Future Registration-Name Invariant

No registration route is enabled or changed by this feature. The shared required name schema is the reusable contract that any separately specified future registration boundary MUST consume; it may not introduce optional or weaker name validation. Existing users with null names remain valid and use email-based initials until they save a valid name.
