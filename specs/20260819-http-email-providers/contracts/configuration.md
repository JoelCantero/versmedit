# Contract: Runtime Email Configuration

## Provider configuration boundary

This is a server-only startup contract. No browser bundle, public request, route parameter, or message input may select a provider, endpoint, sender, or credential.

## Environment Matrix

| Variable | Production source | Disabled | Brevo enabled | Mailjet enabled |
|---|---|---|---|---|
| `MAIL_ENABLED` | GitHub Variable | Absent or exact `false` | Exact `true` | Exact `true` |
| `MAIL_PROVIDER` | GitHub Variable | Ignored for activation | Required exact `brevo` | Required exact `mailjet` |
| `MAIL_API_KEY` | GitHub Secret | Ignored for activation | Required non-empty | Required non-empty |
| `MAIL_API_SECRET` | GitHub Secret | Ignored for activation | Not used or sent | Required non-empty |
| `MAIL_FROM` | GitHub Variable | Ignored for activation | Required bare email | Required bare email |
| `PROJECT_NAME` | Existing GitHub Variable | Remains globally required | Sender display name | Sender display name |

`MAIL_API_BASE_URL` and `MAIL_FROM_NAME` do not exist in the schema. Legacy `AUTH_EMAIL_ENABLED` and every `SMTP_*` value are removed from the completed application.

## Normalization

### Disabled

- `MAIL_ENABLED` absent or `false` normalizes to `{ enabled: false }`.
- Provider values and credentials, if provisioned temporarily, do not enable health probes, account lookups, mutations, token creation, or sends.
- Invalid boolean text such as `1`, `yes`, `TRUE`, or whitespace fails startup validation.

### Brevo

- Normalized provider is `brevo`.
- `MAIL_API_KEY`, `MAIL_FROM`, and `PROJECT_NAME` are required.
- `MAIL_API_SECRET` is not part of normalized Brevo configuration and cannot be placed in a Brevo request.
- Endpoint is the source-code constant `https://api.brevo.com/v3/smtp/email`.

### Mailjet

- Normalized provider is `mailjet`.
- `MAIL_API_KEY`, `MAIL_API_SECRET`, `MAIL_FROM`, and `PROJECT_NAME` are required.
- Endpoint is the source-code constant `https://api.mailjet.com/v3.1/send`.

## Field Validation

- `MAIL_PROVIDER` is case-sensitive and supports only `brevo` and `mailjet` when enabled.
- `MAIL_FROM` must be exactly one syntactically valid bare mailbox. Display-name forms and CR/LF are rejected.
- `PROJECT_NAME` is trimmed, 1-70 characters, and contains no ASCII control characters or line breaks.
- Secrets are non-empty after empty-string normalization. They are not trimmed into error output.
- Startup errors identify only invalid field names and safe requirements. They never include received values.

Provider-side sender verification cannot be proven by syntax validation. It is an operator prerequisite and is verified by the real-provider smoke procedure.

## Activation Sequence

1. Parse `MAIL_ENABLED`.
2. If disabled, produce the disabled configuration and stop provider parsing for activation purposes.
3. If enabled, parse the discriminated provider configuration.
4. Construct the adapter only from normalized fields and source-code endpoint constants.
5. Make provider availability visible to email-dependent routes only after validation succeeds.

Reachability is not a startup gate. Runtime health probes own third-party availability, so a temporary provider outage cannot prevent unrelated routes or container startup.

## Deployment Contract

- Repository Variables: `MAIL_ENABLED`, `MAIL_PROVIDER`, `MAIL_FROM`, existing `PROJECT_NAME`.
- Repository Secrets: `MAIL_API_KEY`, and `MAIL_API_SECRET` only for Mailjet.
- Compose passes these values directly at runtime and writes no production `.env` file.
- Docker build stages use non-secret placeholders only where framework collection requires them; real provider credentials are never build arguments or image layers.
- Deployment output must not print secret values.

## Test Contract

Configuration tests must cover disabled/absent/invalid gates, both complete providers, missing required fields, unsupported/case-mismatched providers, invalid sender/project values, credentials with the gate disabled, and a Brevo selection with a provisioned but unused Mailjet secret. Tests must also prove that no endpoint variable or legacy SMTP value is read.
