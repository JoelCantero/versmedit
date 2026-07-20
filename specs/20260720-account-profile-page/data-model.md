# Data Model: Account Profile Page

## Overview

This feature reuses the existing Auth.js `User` and `Session` records. It adds no table, column, relation, index, or migration. `ProfileUpdate`, `ProfileActionState`, and `LocalizedReturnDestination` are transient application contracts, not persisted entities.

## Existing Entity: User

| Field | Existing type | Feature use | Validation / mutation rule |
|---|---|---|---|
| `id` | String | Server-only ownership key resolved through the authenticated session | Never accepted from the client and never changed |
| `name` | Nullable string | Editable display name and preferred initials source | A submitted value is required, trimmed, 1–80 characters, and limited to Unicode letters, spaces, straight/typographic apostrophes, and hyphens; only mutable field |
| `email` | String, unique | Read-only access address and fallback initials source | Displayed only to the authenticated user; never accepted or changed by this feature |
| `image` | Nullable string | Avatar source | Read-only; never accepted or changed; unusable images fall back to initials |
| `updatedAt` | Date/time | Existing automatic update timestamp | Updated by Prisma when the name changes; not client controlled |

### Relationships

- One User has zero or more Sessions.
- The authenticated Session identifies exactly one User.
- Profile updates target only that session-associated User.

### Compatibility

- Legacy `name = null` remains valid.
- A legacy nameless user sees initials derived from email and must submit a valid non-empty name to update the profile.
- No data backfill is required.

## Existing Entity: Session

| Field | Existing type | Feature use |
|---|---|---|
| `sessionToken` | String, unique | Auth.js cookie resolves the server-side session; never logged or submitted in form data |
| `userId` | String | Server-side ownership link to User |
| `expires` | Date/time | Expired sessions cannot render or mutate profile data |

### Session rules

- Resolve the session for every protected page render and every mutation.
- Missing, stale, expired, or invalid sessions cause no write.
- Mutation-time authentication failure redirects to localized login with a validated localized account return path.

## Transient Model: ProfileUpdate

| Field | Type | Required | Rule |
|---|---|---|---|
| `name` | String | Yes | Exactly one submitted control entry; trim surrounding whitespace; 1–80 characters; allowed character set only |

### Strict payload rules

- The client adapter forwards an ordered list of all successful form-control entries; the domain payload must contain exactly one tuple with key `name`.
- Duplicate `name` entries, non-string values, or any extra key reject the entire update.
- Next.js Server Action transport metadata is not part of the adapter's domain entry list and is never persisted.
- User ID, email, image, role, ownership, authorization, locale, and callback path are not mutation payload fields.
- The locale is validated from trusted route context, not used as identity.

## Transient Model: ProfileActionState

The action returns serializable UI state except when authentication redirects.

| State | Fields | UI behavior |
|---|---|---|
| `idle` | Initial current `name` | No announcement |
| `pending` | Managed by form submission state | Disable Save changes and expose pending label |
| `success` | Persisted `name`, localized message key | Announce politely; show persisted value |
| `validation_error` | Attempted `name`, field/form message key | Persist nothing; retain value; focus name input; announce error assertively |
| `persistence_error` | Attempted `name`, generic message key | Persist nothing; retain value; retain focus on Save changes; announce error assertively |

No state includes email, image, user ID, session token, stack trace, or database details.

## Transient Model: LocalizedReturnDestination

Allowed values are limited to the account route in a supported locale:

| Locale | Account destination | Login destination |
|---|---|---|
| English (`en`) | `/account` | `/login?callbackUrl=%2Faccount` |
| Spanish (`es`) | `/es/account` | `/es/login?callbackUrl=%2Fes%2Faccount` |
| Catalan (`ca`) | `/ca/account` | `/ca/login?callbackUrl=%2Fca%2Faccount` |

Any absent, malformed, cross-origin, protocol-relative, or unsupported callback value falls back to the active locale home path rather than being forwarded.

## Derived Value: Avatar Initials

1. Trim the display name and split it into non-empty whitespace-delimited words.
2. If one name word exists, use its first Unicode letter.
3. If two or more name words exist, use the first Unicode letter of the first and last words, capped at two initials.
4. If no usable name exists, use the first usable Unicode letter before or within the email address.
5. Present initials as text with an accessible avatar label; do not expose a broken image.

## State Transitions

```text
page request
  -> unauthenticated -> localized login redirect
  -> authenticated -> profile rendered

idle
  -> submit -> pending
pending
  -> session invalid -> localized login redirect (no write)
  -> strict validation fails -> validation_error (no write)
  -> database update fails -> persistence_error (no partial write)
  -> database update succeeds -> success
validation_error -> corrected submit -> pending
persistence_error -> retry -> pending
success -> subsequent submit -> pending
```

## Concurrency and Replay

- Repeating the same valid update changes no fields beyond `name` and creates no record.
- Concurrent valid updates serialize through the existing User row; the last server-accepted update determines the persisted name.
- Client-side pending state suppresses accidental duplicate clicks, but correctness does not depend on that suppression.
