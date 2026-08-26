# Data Model: Unified Branded Transactional Emails

This feature adds no persisted entity and no Prisma migration. The models below are immutable
runtime values and TypeScript contracts. Recipient identity, credentials, account state, and
delivery results remain in their existing owners.

## EmailLocale

Supported locale selected by the owning business flow.

| Value | Meaning | URL prefix |
|-------|---------|------------|
| `en` | English and default locale | none |
| `es` | Spanish | `/es` |
| `ca` | Catalan | `/ca` |

**Validation**:

- Exactly one listed value is required.
- No locale fallback is allowed during presentation.

## EmailVariant

Stable presentation identifier. Classification and action mode are compile-time catalogue
metadata, not caller-controlled values.

| Identifier | Classification | Action mode | Dynamic presentation values |
|------------|----------------|-------------|-----------------------------|
| `loginMagicLink` | Operational | Credential-bearing | `actionUrl` |
| `signupActivation` | Operational | Credential-bearing | `actionUrl` |
| `existingAccountSignupNotice` | Operational | Credential-free login | `actionUrl` |
| `accountDeletionReauthentication` | Operational | Credential-bearing | `actionUrl` |
| `accountSecurityReauthentication` | Operational | Credential-bearing | `actionUrl` |
| `personalDataExportConfirmation` | Operational | Credential-bearing | `actionUrl` |
| `personalDataExportReady` | Preview-only | Fictional action | `actionUrl` |
| `accountDeleted` | Preview-only | None | none |
| `emailChangeRequested` | Preview-only | Fictional action | `actionUrl`, `newEmail` |
| `emailChanged` | Preview-only | None | `newEmail` |
| `securityAlert` | Preview-only | Fictional action | `actionUrl`, `occurredAt` |
| `genericConfirmation` | Preview-only | Fictional action | `actionUrl`, `reference` |

**Validation**:

- The union is closed to these 12 values.
- Operational and preview-only classification is fixed in source and cannot be overridden by input.
- `actionUrl` is required for every action mode except `None` and forbidden for `None`.
- An operational action URL is constructed by its existing domain flow before presentation.
- `existingAccountSignupNotice.actionUrl` must be the canonical locale-aware login URL and contain
  no token or credential-bearing query parameter.
- Preview-only action URLs must use reserved fictional domains.
- `newEmail` is a valid fictional email address of at most 320 characters.
- `occurredAt` is a valid timestamp rendered according to the selected locale; fixtures contain no
  device, network, session, or location data.
- `reference` is trimmed, contains no ASCII control characters, and is at most 80 characters.

## EmailBrand

One normalized deployment-wide identity shared by every operational render.

| Field | Type | Source | Validation |
|-------|------|--------|------------|
| `productName` | string | `PROJECT_NAME` | Trimmed safe sender name, 1-70 characters, no ASCII controls |
| `canonicalOrigin` | URL origin | `NEXTAUTH_URL` | HTTP(S), no path beyond `/`, query, fragment, or user information |
| `primaryColor` | string | `BRAND_COLOR` | Exactly `#RRGGBB`, normalized consistently |
| `actionForeground` | `#000000` or `#FFFFFF` | Derived | At least 4.5:1 contrast against `primaryColor` |
| `supportEmail` | string | `SUPPORT_EMAIL` | Trimmed bare email address, at most 320 characters |
| `logoUrl` | HTTPS URL or null | `MAIL_LOGO_URL` | Optional, absolute HTTPS, at most 2,048 characters, no user information or fragment |

**Derived values**:

- Terms and Privacy URLs are built from `canonicalOrigin`, the canonical policy paths, and locale.
- The logo alternative text is derived from `productName`.
- The logo URL is read only from this shared object; variant and recipient inputs cannot change it.
- The text product name is always rendered whether or not `logoUrl` is present.

## LocalizedEmailCopy

Catalogue-owned copy selected by `(EmailVariant, EmailLocale)`.

| Field | Required | Notes |
|-------|----------|-------|
| `subject` | yes | Human-readable, non-empty, no ASCII controls |
| `previewText` | yes | Inbox preview, non-empty |
| `heading` | yes | Primary message heading |
| `paragraphs` | yes | One or more ordered localized paragraphs |
| `actionLabel` | action variants only | Required exactly when catalogue action mode requires it |
| `fallbackInstruction` | action variants only | Introduces the explicit copy/paste URL |
| `supportLabel` | yes | Introduces the support address |
| `termsLabel` | yes | Terms of Use link label |
| `privacyLabel` | yes | Privacy Notice link label |
| `legalLabel` | yes | Introduces `productName` as the sender identity where grammar requires it |

**Validation**:

- All required strings are non-empty after trimming.
- Every entry is present in all three locale catalogues with the same field shape.
- Values may contain approved placeholders only for fields declared by that variant.
- Placeholder resolution must leave no braces, `undefined`, or missing value.
- Generic confirmation owns all listed copy; its input cannot replace any copy field.

## EmailPresentationRequest

Discriminated union combining:

- one `variant`;
- one `locale`;
- one validated `brand`;
- only the dynamic values permitted by the variant table.

It intentionally excludes:

- recipient address;
- provider or provider credentials;
- send options or retry state;
- raw account/session/token objects;
- arbitrary subject, body, HTML, or plain text;
- logger, database, authentication, or network clients.

## RenderedEmailContent

Pure presentation result consumed by an operational wrapper or local preview.

| Field | Type | Rules |
|-------|------|-------|
| `subject` | string | Non-empty, locale-pure, no ASCII controls |
| `html` | string | Complete document; escaped dynamic values; no script, tracking, or unresolved values |
| `text` | string | Non-empty semantic alternative generated from the same document |

**Invariants**:

- An action-bearing result contains one unique business-action destination. It may appear both as
  the primary action target and as the explicit fallback URL.
- An informational result contains no business-action destination.
- Support and policy URLs never contain action query parameters or credentials.
- HTML and text communicate the same purpose, next action, support contact, and legal destinations.
- The output contains no recipient because recipient ownership remains at delivery.
- Provider serialization of the completed `TransactionalEmail` remains below 1 MiB.

## PreviewFixture

One fictional input used by the local catalogue.

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | Unique `<locale>/<variant>` key |
| `locale` | `EmailLocale` | Must agree with the key and wrapper directory |
| `variant` | `EmailVariant` | Must agree with the key and wrapper file |
| `brand` | `EmailBrand` | Fixed fictional deployment brand |
| `values` | variant-specific | Reserved domains and obviously fictional values only |

**Cardinality and uniqueness**:

- Exactly 36 fixtures exist: the Cartesian product of 12 variants and 3 locales.
- Every `(variant, locale)` pair appears exactly once.
- No fixture contains a real recipient, token, provider, session, device, network, or production URL.

## Relationships

```text
EmailBrand --------------------------+
                                      |
EmailVariant + EmailLocale ----------+--> EmailPresentationRequest
                                      |            |
Variant-specific structured values --+            v
                                             LocalizedEmailCopy
                                                    |
                                                    v
                                         RenderedEmailContent
                                                    |
                           +------------------------+-----------------------+
                           |                                                |
                    Operational wrapper                              Preview wrapper
                           |                                                |
               + recipient + locale                                Display only
                           |                                                |
                 TransactionalEmail                              No send capability
                           |
                 Existing delivery boundary
```

## State Transitions

### Enabled configuration

```text
Raw environment
  -> validate provider and brand
  -> EnabledMailConfig with EmailBrand
  -> application serves requests
```

Any invalid required field transitions directly to startup failure. No partially available state
exists. When `MAIL_ENABLED=false`, brand fields are not required and configuration transitions to
`DisabledMailConfig`.

### Operational message

```text
Existing business event
  -> domain decides recipient, locale, action URL, and any credential
  -> presentation validates input and renders content
  -> wrapper adds recipient and locale
  -> existing delivery boundary makes one provider attempt
  -> existing business flow finalizes acceptance or compensates the exact credential
```

A validation or rendering exception skips delivery and transitions directly to the existing failed
submission/compensation branch. Presentation never mutates lifecycle state.

### Preview-only message

```text
Static fictional fixture
  -> pure presentation render
  -> isolated local catalogue display
  -> end
```

There is no transition from preview display to recipient selection, credential creation, provider
submission, persistence, or application logging.
