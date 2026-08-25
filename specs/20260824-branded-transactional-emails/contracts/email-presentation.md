# Contract: Email Presentation

**Interface kind**: Internal TypeScript module

**Owner**: `src/lib/email/presentation/`

**Consumers**: Existing operational email wrappers and the isolated local catalogue

This contract creates no HTTP endpoint and does not replace `sendTransactionalEmail`. It turns one
fully decided presentation request into provider-neutral content. See [data-model.md](../data-model.md)
for field validation and relationships.

## Public Surface

```ts
type EmailLocale = "en" | "es" | "ca";

interface RenderedEmailContent {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

declare function renderEmailPresentation(
  request: EmailPresentationRequest,
): Promise<RenderedEmailContent>;
```

The module also exports the `EmailBrand`, `EmailVariant`, and `EmailPresentationRequest` types plus
pure brand/copy validators needed by `src/lib/env.ts` and tests. It exports no recipient-aware or
send-named function.

## Request Union

Every member contains exactly:

- `variant`: the discriminant;
- `locale`: one supported locale;
- `brand`: one already validated deployment or fictional preview brand;
- the structured values listed below, with no extra properties.

| `variant` | Status | Required variant values | Action contract |
|-----------|--------|-------------------------|-----------------|
| `loginMagicLink` | Operational | `actionUrl` | Absolute credential-bearing URL decided by Auth.js flow |
| `signupActivation` | Operational | `actionUrl` | Absolute credential-bearing activation URL decided by signup flow |
| `existingAccountSignupNotice` | Operational | `actionUrl` | Canonical locale-aware login URL; no query, fragment, token, or credential |
| `accountDeletionReauthentication` | Operational | `actionUrl` | Absolute credential-bearing URL decided by deletion flow |
| `accountSecurityReauthentication` | Operational | `actionUrl` | Absolute credential-bearing URL decided by security flow |
| `personalDataExportConfirmation` | Operational | `actionUrl` | Absolute credential-bearing URL decided by export flow |
| `personalDataExportReady` | Preview-only | `actionUrl` | Absolute fictional URL on a reserved host |
| `accountDeleted` | Preview-only | none | Informational; action input is forbidden |
| `emailChangeRequested` | Preview-only | `actionUrl`, `newEmail` | Absolute fictional URL on a reserved host |
| `emailChanged` | Preview-only | `newEmail` | Informational; action input is forbidden |
| `securityAlert` | Preview-only | `actionUrl`, `occurredAt` | Absolute fictional URL on a reserved host |
| `genericConfirmation` | Preview-only | `actionUrl`, `reference` | Absolute fictional URL on a reserved host; all message copy remains catalogue-owned |

`newEmail`, `occurredAt`, and `reference` are escaped display values, never authorities or lookup
keys. The renderer accepts no caller-provided subject, preview text, heading, paragraph, action
label, HTML, or plain text for any variant.

## URL Contract

- The renderer accepts a complete action URL and never creates, signs, extends, decodes, or stores a
  credential.
- It validates an absolute `http:` or `https:` URL before rendering. Executable and non-web schemes
  are rejected.
- Operational URLs must preserve the string decided by the owning flow. Presentation may HTML-escape
  it for an attribute or text node but must not parse and reserialize it into a different destination.
- The existing-account notice URL must equal the canonical origin plus the locale-aware `/login`
  route and contain no query string, fragment, or user information.
- Preview-only action URLs must use `example.com`, `example.org`, `example.net`, or a `.test` host and
  contain no user information.
- Terms and Privacy URLs are derived separately from `brand.canonicalOrigin`, locale, and the existing
  canonical `/terms` and `/privacy` paths. Support uses `brand.supportEmail`. None may inherit any
  action URL component.
- An action-bearing message has one unique business-action destination. HTML may reference it in the
  primary control and visible fallback, and plain text may show it once; those repeated references
  are one destination, not additional actions.

## Catalogue Contract

The renderer selects copy by the exact tuple `(locale, variant)` from the `Email` namespace in the
three existing locale JSON files.

- The catalogue is total for 12 variants and 3 locales.
- Each locale has an identical compile-time field shape.
- Each action-bearing entry has an action label and fallback instruction; informational entries have
  neither.
- Approved placeholders are declared per variant and can reference only its structured values or
  shared brand fields.
- Lookup never falls back to another locale.
- Rendering fails if an entry is absent, empty, has an unknown placeholder, or leaves a placeholder
  unresolved.
- Operational copy may change wording only while retaining the prior purpose, next action, expiry
  statement, session requirement, and other security-relevant meaning documented by existing tests.

## Rendering Contract

For one valid request, `renderEmailPresentation`:

1. Runtime-validates the discriminated request without mutating it.
2. Selects exactly one localized catalogue entry.
3. Builds one shared React Email document tree with product identity, preview text, body, support,
   legal identity/address, and localized policy links.
4. Renders that same tree once as complete HTML and once with React Email plain-text rendering.
5. Returns only `subject`, `html`, and `text`.

Successful output guarantees:

- all three fields are non-empty;
- dynamic values are represented as text/attributes through React escaping;
- no `dangerouslySetInnerHTML`, script, executable content, tracking element, or recipient-specific
  remote resource exists;
- the optional logo has product-name alternative text and constrained dimensions, while the product
  name remains visible independently;
- action foreground is either black or white and has at least 4.5:1 contrast against the validated
  primary color;
- HTML and text preserve the same purpose, action destination if present, support contact, and legal
  destinations;
- no `undefined`, unresolved placeholder, empty required copy, or mixed-locale fallback remains.

The renderer creates no separate HTML-only size rule. Final request-size enforcement remains in the
unchanged HTTP boundary after an operational wrapper adds `recipient` and `locale` and the selected
provider adapter serializes its request body. Catalogue tests combine every render and representative
long values with a fictional recipient and locale, serialize both existing provider request shapes,
and measure each UTF-8 body against the existing 1 MiB bound. Operational integration tests prove an
oversize request fails before network submission and without content logging.

## Failure Contract

The renderer rejects with an `EmailPresentationError` whose public data is limited to:

| Field | Values |
|-------|--------|
| `code` | `INVALID_INPUT`, `INVALID_BRAND`, `INVALID_CATALOGUE`, or `RENDER_FAILED` |
| `field` | Optional allowlisted schema path containing names only |

The error contains no request value, URL, subject, body, HTML, plain text, recipient, credential, or
raw validation issue. The module does not log. An operational caller treats the rejection exactly as
an unaccepted delivery attempt, makes no provider request, and follows its existing exact-credential
compensation path.

## Side-Effect Boundary

Code under `src/lib/email/presentation/` must not:

- import `server-only`, `src/lib/env.ts`, database/Prisma modules, Auth.js configuration, business
  modules, provider adapters, `src/lib/email/index.ts`, logging modules, or request/session APIs;
- read `process.env`, cookies, headers, filesystem state, the network, a clock, randomness, or a
  database;
- accept a recipient, provider, credential object, logger, callback, or arbitrary rendered content;
- persist, submit, retry, enqueue, schedule, mutate account state, or emit an operational event.

Architecture tests enforce these import and identifier restrictions. Existing operational wrappers
may import both presentation and delivery, but preview-only variants have no wrapper or export from a
production send module.

## Compatibility

This is an additive internal boundary. The existing delivery input remains:

```ts
interface TransactionalEmail {
  recipient: string;
  locale: "en" | "es" | "ca";
  subject: string;
  html: string;
  text: string;
}
```

Operational wrappers combine `recipient` and `locale` with the three rendered fields and call the
same delivery function with the same per-flow options. Provider selection, endpoints, timeout,
one-attempt behavior, result classification, acceptance semantics, and safe logging do not change.
