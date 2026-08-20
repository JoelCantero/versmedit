# Quickstart: Validate Transactional Email HTTP Providers

## Prerequisites

- Node.js 24 LTS and pnpm 11
- Docker with Docker Compose
- PostgreSQL available through the repository Compose stack
- For real smoke checks only: one verified sender and valid credentials for the selected provider, plus controlled login/signup mailboxes

Read the contracts before implementation validation:

- [Runtime configuration](./contracts/configuration.md)
- [Transactional email boundary](./contracts/transactional-email-boundary.md)
- [Provider HTTP contracts](./contracts/provider-http.md)
- [Provider health](./contracts/provider-health.md)
- [Data model](./data-model.md)

## Local Setup

```bash
corepack enable
pnpm install
docker compose up -d --wait db
pnpm db:deploy
```

No new Prisma migration is expected for this feature.

Start with email disabled in local `.env`:

```dotenv
MAIL_ENABLED=false
```

For a controlled real Brevo check, use a verified sender and keep secrets local:

```dotenv
MAIL_ENABLED=true
MAIL_PROVIDER=brevo
MAIL_API_KEY=<local-secret>
MAIL_FROM=no-reply@example.test
```

For Mailjet:

```dotenv
MAIL_ENABLED=true
MAIL_PROVIDER=mailjet
MAIL_API_KEY=<local-public-key>
MAIL_API_SECRET=<local-secret-key>
MAIL_FROM=no-reply@example.test
```

`PROJECT_NAME` supplies the sender display name. Do not define `MAIL_API_BASE_URL`, `MAIL_FROM_NAME`, `AUTH_EMAIL_ENABLED`, or any `SMTP_*` variable for the completed migration.

## Automated Validation

Run the focused provider and flow tests introduced by the implementation, then the repository gates:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm audit:prod
pnpm build
docker build -f docker/Dockerfile .
```

Expected outcomes:

- Controlled integration/E2E runs make no external provider request.
- Both Brevo and Mailjet fixture modes capture the exact official logical endpoint, required auth scheme, sender, recipient, subject, text, and HTML.
- Each failure scenario captures exactly one send request and no alternate transport.
- Coverage, production build, and Docker build complete without Nodemailer or SMTP fixture packages after cleanup.

## Required Scenario Matrix

### 1. Global Gate

Run login and signup with `MAIL_ENABLED` absent and false. Assert zero account lookups, mutations, tokens, health probes, and provider sends. Set it to invalid text and assert startup fails with field-only redacted output.

Set `MAIL_ENABLED=true` with each missing/unsupported provider field. Assert startup fails before serving email-dependent flows. Confirm credentials alone never enable mail.

### 2. Brevo Contract

Using the controlled HTTP fixture:

- return a valid 201 JSON body with `messageId`;
- return a valid 2xx JSON body without an identifier;
- exercise 400, 401, 403, 409, 429, 5xx, malformed JSON, oversized response, timeout, DNS/TLS/connection equivalents, and redirect;
- assert the exact `POST https://api.brevo.com/v3/smtp/email` logical target and no campaign endpoint;
- assert one request, deterministic normalization, and null rather than invented identifiers.

### 3. Mailjet Contract

Using the controlled HTTP fixture:

- return one `Messages` entry with `Status: success` and `MessageUUID`;
- return valid success without an identifier;
- return HTTP 2xx with `Status: error` and embedded status codes;
- exercise duplicate/mixed message results and the same status/network matrix as Brevo;
- assert the exact `POST https://api.mailjet.com/v3.1/send` logical target and Basic authentication without snapshotting credentials.

### 4. Domain Security

For both providers compare:

- known versus unknown magic-link login;
- new, reusable pending, and active-account signup;
- provider acceptance, each normalized failure category, and indeterminate timeout/network outcomes.

Assert identical established public responses and timing floors. Failed known-user login/onboarding sends invalidate the new token and leave superseded tokens invalid. Unknown login creates or changes no product data. Existing-account notice failure creates no credential or mutation.

### 5. Shared Health

Prime available and unavailable states for each provider, expire them, and race concurrent requests. Assert:

- one probe claim per stale provider state;
- 60-second cached state and two-second self-expiring lock;
- no recipient/account data in probes;
- unavailable preflight stops before account lookup and send;
- every individual send outcome leaves shared health unchanged;
- `/api/health` stays healthy during a simulated provider outage.

### 6. Response-Time Sample

Use the immediate-accept controlled provider with application and provider-health state pre-warmed. For each of login with Brevo, login with Mailjet, signup with Brevo, and signup with Mailjet, run two unmeasured warm-ups followed by 20 sequential measured requests using fresh request data.

Assert at least 19 of 20 requests in every combination finish in under five seconds and every accepted valid-email response takes at least 500 ms from request start. Record every measured request; do not retry, discard, or exclude outliers.

### 7. Redaction and Acceptance Semantics

Capture structured logs and public bodies. Search for fixture credentials, recipients, names, account IDs, tokens, full links, subjects, message bodies, authorization values, endpoint URLs, and raw provider payloads; expect zero matches.

Accepted events may say `accepted` and include a safe provider message identifier. They must never say delivered. No webhook route, delivery model, or admin delivery view should exist.

## Migration Verification

### Development

1. Deploy/run the HTTP-capable artifact while old SMTP values remain provisioned only for rollback.
2. Select one provider with valid HTTP configuration.
3. Send a known-user login link and a new signup activation link to controlled mailboxes.
4. Confirm the application records provider acceptance, the provider dashboard shows the submission, and the controlled mailboxes receive usable localized links.
5. Confirm the application made no SMTP connection and did not log secret/content values.
6. Repeat the controlled contract suite for the other provider using the local fixture; use real credentials only where the release policy requires a second live smoke.

### Production

1. Store `MAIL_API_KEY` and Mailjet-only `MAIL_API_SECRET` as GitHub Repository Secrets.
2. Store `MAIL_ENABLED`, `MAIL_PROVIDER`, `MAIL_FROM`, and `PROJECT_NAME` as Repository Variables.
3. Deploy with legacy SMTP secrets still provisioned but absent from application runtime wiring.
4. Perform controlled known-user login and signup sends for the active provider.
5. Verify accepted submission and usable mailbox links without printing credentials or message content.
6. After successful verification, remove legacy SMTP secrets/variables, Nodemailer, SMTP fixtures, and related types; redeploy and repeat login/signup smoke checks.

Provider dashboard/mailbox evidence is an external smoke observation. The application itself continues to record acceptance only, not delivery.

## Rollback

Before SMTP cleanup, redeploy the last known SMTP-capable artifact with the still-provisioned legacy credentials. Do not add runtime fallback to the HTTP artifact.

After cleanup, rotate/correct `MAIL_*` configuration or deploy a forward fix. No database restore or reverse migration is needed because this feature adds no schema or delivery data.
