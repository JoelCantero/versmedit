# Contract: Provider HTTP Requests and Responses

## Shared Transport Rules

- Use Node.js native fetch through an injectable internal request function.
- Provider endpoints are source-code constants and cannot be supplied by environment, request, message, or client data.
- Use `redirect: "manual"`; any 3xx response is `unknown` and is never followed with credentials.
- Apply `AbortSignal.timeout(2500)` to the whole send operation, including bounded body consumption.
- Read at most 65,536 response bytes. An oversized send response is `unknown`.
- Send `accept: application/json` and `content-type: application/json`.
- Make exactly one outbound request and no retry.
- Never log request/response bodies, headers, credentials, endpoint URLs, recipients, or content.

## Brevo

### Request

```http
POST https://api.brevo.com/v3/smtp/email
api-key: <MAIL_API_KEY>
accept: application/json
content-type: application/json
```

Conceptual JSON shape:

```json
{
  "sender": { "email": "<MAIL_FROM>", "name": "<PROJECT_NAME>" },
  "to": [{ "email": "<recipient>" }],
  "subject": "<localized subject>",
  "textContent": "<localized plain text>",
  "htmlContent": "<localized HTML>"
}
```

Invariants:

- `to` has exactly one element.
- No template, scheduling, campaign, attachment, CC/BCC, tracking, endpoint, or credential field is sent.
- `/v3/emailCampaigns` and all marketing endpoints are forbidden.

### Acceptance

A Brevo response is accepted only when it is 2xx, JSON is structurally valid for a transactional send response, and it contains no contradictory multi-message result. A valid non-empty `messageId` is retained. Its absence or a malformed optional identifier produces `providerMessageId: null` without inventing a value.

If both singular and plural identifier fields disagree, or a single-message request returns multiple distinct identifiers, the response is contradictory and maps to `unknown`.

## Mailjet

### Request

```http
POST https://api.mailjet.com/v3.1/send
Authorization: Basic <base64(MAIL_API_KEY:MAIL_API_SECRET)>
accept: application/json
content-type: application/json
```

Conceptual JSON shape:

```json
{
  "Messages": [
    {
      "From": { "Email": "<MAIL_FROM>", "Name": "<PROJECT_NAME>" },
      "To": [{ "Email": "<recipient>" }],
      "Subject": "<localized subject>",
      "TextPart": "<localized plain text>",
      "HTMLPart": "<localized HTML>"
    }
  ]
}
```

Invariants:

- `Messages` has exactly one element and `To` has exactly one element.
- Basic credentials appear only in `Authorization`.
- No template, sandbox, campaign, attachment, CC/BCC, tracking, endpoint, or custom event payload is sent.

### Acceptance

A Mailjet response is accepted only when all are true:

- HTTP status is 2xx.
- JSON contains exactly one `Messages` result.
- That result has `Status: "success"`.
- It contains exactly one corresponding `To` result and no contradictory `Errors`.

Prefer a valid non-empty `MessageUUID`. Otherwise stringify a valid `MessageID`. If neither identifier is valid, return null while keeping a structurally valid success accepted. `MessageHref` is never retained.

A 2xx response with `Status: "error"`, mixed/duplicate message results, or contradictory success/error fields is not accepted. Classify a documented embedded `StatusCode` using the shared precedence below; otherwise use `unknown`.

## Classification Precedence

Classification is deterministic and applies to the HTTP status or a trusted Mailjet embedded status code after shape validation:

| Condition | Category | `accepted` |
|---|---|---:|
| Provider-specific valid acceptance | `accepted` | true |
| 401 or 403 | `authentication` | false |
| 429 | `rate_limited` | false |
| Explicit provider-documented destination rejection | `recipient_rejected` | false |
| 400 or 409 | `invalid_request` | false |
| 500-599 | `provider_unavailable` | false |
| Timeout, DNS, TLS, reset, refusal, other connection failure | `provider_unavailable` | false |
| Unmapped 3xx/4xx, malformed/oversized/contradictory response | `unknown` | false |

The explicit destination-rejection check precedes generic 400/409 only when an allowlisted provider code supplies reliable destination-specific evidence. The initial Brevo/Mailjet allowlist is empty: invalid email syntax is `invalid_request`, not `recipient_rejected`.

A safe retry interval from 429 may be used by internal observability/control but is not part of `NormalizedSendResult`, does not trigger a retry, and does not alter public account-private responses.

## Message Identifier Validation

A retained identifier must be a scalar string (or Mailjet numeric `MessageID`), normalize to 1-512 characters, and contain no ASCII control characters. Empty, oversized, composite, duplicated, or malformed identifiers become null unless they also make the response contradictory, in which case the category is `unknown`.

## Test Substitution

Unit and integration tests inject a `ProviderHttpClient` that sends to a controlled local fixture while receiving the original fixed logical URL as input. Production construction always binds native fetch.

For Playwright, the standalone app process is started with a test-only Node preload module. The module intercepts only these exact logical URLs and the two fixed health URLs, forwards them to the local fixture, and rejects every other attempted provider destination. The application still constructs official URLs and reads no test endpoint setting. The preload is not imported or enabled by production deployment configuration.
