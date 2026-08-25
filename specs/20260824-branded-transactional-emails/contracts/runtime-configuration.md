# Contract: Runtime Email Brand Configuration

**Interface kind**: Process environment and deployment contract

**Owner**: `src/lib/env.ts`, with startup invocation from `src/instrumentation.ts`

**Deployment consumers**: `.env.example`, `docker-compose.prod.yml`, and
`.github/workflows/deploy.yml`

This extends the existing discriminated `MAIL` configuration. Provider secrets, provider selection,
fixed endpoints, and delivery behavior remain unchanged.

## Variables

| Variable | GitHub source | Required when `MAIL_ENABLED=true` | Validation | Normalized `EmailBrand` field |
|----------|---------------|-----------------------------------|------------|-------------------------------|
| `PROJECT_NAME` | Existing Variable | Existing global requirement | Trimmed safe sender/product name, 1-70 characters, no ASCII controls | `productName` |
| `NEXTAUTH_URL` | Existing value derived from `APP_DOMAIN` | Existing global requirement | Absolute HTTP(S) origin; no path beyond `/`, query, fragment, or user information | `canonicalOrigin` |
| `MAIL_BRAND_COLOR` | New Variable | yes | `/^#[0-9A-Fa-f]{6}$/` | `primaryColor`, uppercase |
| `MAIL_SUPPORT_EMAIL` | New Variable | yes | Trimmed bare email address, 1-320 characters | `supportEmail` |
| `MAIL_LEGAL_NAME` | New Variable | yes | Trimmed single line, 1-200 characters, no ASCII controls | `legalName` |
| `MAIL_LEGAL_ADDRESS` | New Variable | yes | Trimmed single line, 1-500 characters, no ASCII controls | `legalAddress` |
| `MAIL_LOGO_URL` | New Variable | no | Empty means absent; otherwise absolute HTTPS, at most 2,048 characters, no user information or fragment | `logoUrl` or `null` |

The five `MAIL_*` brand values are non-secret because they are intentionally visible to recipients.
They are GitHub Actions Variables, not Secrets. None is prefixed with `NEXT_PUBLIC_`, exposed through
an application endpoint, or read by browser code.

Static logo query parameters are permitted, but the configured URL is shared deployment-wide and
must not contain a recipient, credential, or per-message identifier. Presentation never appends one.

## Runtime Shape

The enabled branch gains one immutable field while retaining every existing provider field:

```ts
interface EnabledMailConfigBase {
  readonly enabled: true;
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly senderName: string;
  readonly sendTimeoutMs: typeof EMAIL_SEND_TIMEOUT_MS;
  readonly healthTimeoutMs: typeof EMAIL_HEALTH_TIMEOUT_MS;
  readonly responseLimitBytes: typeof EMAIL_RESPONSE_LIMIT_BYTES;
  readonly brand: EmailBrand;
}

interface DisabledMailConfig {
  readonly enabled: false;
}
```

`BrevoMailConfig` and `MailjetMailConfig` continue to extend the enabled base exactly as today. The
disabled branch has no `brand`, provider, or credential field.

The normalized brand guarantees:

- `productName` equals the existing normalized sender name;
- `canonicalOrigin` is `new URL(NEXTAUTH_URL).origin` and contains no credentials;
- `primaryColor` uses uppercase hex digits;
- `actionForeground` is the black or white value with the greater WCAG contrast ratio and passes
  4.5:1;
- support/legal strings contain no leading/trailing whitespace or line break;
- `logoUrl` is one normalized HTTPS string or `null`.

Only `src/lib/env.ts` reads these environment variables. Presentation receives `EmailBrand` as a
value and never reads process state.

## Conditional Validation

| `MAIL_ENABLED` | Brand inputs | Result |
|----------------|--------------|--------|
| unset or `false` | absent | Startup succeeds with `{ MAIL: { enabled: false } }` |
| unset or `false` | present, including malformed values | Values are discarded; startup still succeeds |
| `true` | all required values valid, optional logo absent or valid | Startup succeeds with normalized `MAIL.brand` |
| `true` | any required value absent/empty | Entire application startup fails |
| `true` | any supplied brand value malformed | Entire application startup fails |
| any other value | any | Existing `MAIL_ENABLED` validation fails startup |

Provider and brand issues are accumulated into one validation result so an operator can correct all
named fields in one pass. No partially enabled mail configuration is returned.

## Startup Contract

`src/instrumentation.ts` exports `register()`. In the Node.js runtime used by the standalone server,
it calls `getEnv()` synchronously and allows any validation error to terminate startup.

Next.js 16.3 defines `register()` to run once when a server instance is initiated and to complete
before that server is ready for requests. Therefore an invalid enabled-email configuration:

- serves no page, route, health response, or partially available application;
- creates no provider client or request;
- renders no message and issues no credential as a consequence of this feature;
- leaves the container unready/unhealthy and causes deployment health verification to fail.

Existing route/module calls to `getEnv()` remain defense in depth. They consume the same schema and
cannot construct a weaker configuration.

## Error Contract

Startup errors may contain only:

- the fixed prefix `Invalid environment configuration`;
- one or more allowlisted environment field names;
- fixed validation rules such as `must be an absolute HTTPS URL`.

They must not contain supplied values, parsed URL components, provider identifiers beyond the
already public provider enum, brand content, credentials, or a serialized Zod input. Workflow
preflight follows the same field-name-only rule. Neither path enables shell tracing.

## Local Development

`.env.example` documents all five new values beside the existing mail settings and states their
conditional requirement. A representative non-secret setup is:

```dotenv
MAIL_BRAND_COLOR=#0F766E
MAIL_SUPPORT_EMAIL=support@example.com
MAIL_LEGAL_NAME=Example Organization
MAIL_LEGAL_ADDRESS=123 Example Street, Example City
MAIL_LOGO_URL=
```

These examples are documentation only. The local preview project ignores `.env` and uses its own
fictional brand. Normal application development with `MAIL_ENABLED=false` requires no brand values.

## Docker Build and Runtime

- The existing Docker build continues without `MAIL_ENABLED=true`; therefore its explicit non-secret
  placeholders do not need brand placeholders.
- Both React Email runtime packages are installed in the dependency stage and included by the
  application standalone build.
- `docker-compose.prod.yml` forwards all five new variables to the `app` service only.
- The `migrate` and `db` services receive none of them.
- No value is written to a host `.env` file, image layer, build argument, Compose label, healthcheck,
  or command line.
- No new service, port, volume, network, or restart policy is introduced.

The app runner reads the values only when its Node process starts. Correcting variables requires an
ordinary app container recreation/restart; there is no data rollback.

## GitHub Actions Propagation

The deploy workflow performs two distinct duties.

### Preflight

The existing `Validate required variables and secrets` step maps all five GitHub Variables into its
step environment. When `MAIL_ENABLED=true`, it reports each empty required brand field by name.
`MAIL_LOGO_URL` may be empty. The application schema remains authoritative for complete format and
normalization checks at container startup.

When mail is disabled, preflight does not require or validate the brand fields. It still validates
the existing global and provider gates exactly as before.

### Deployment environment

The `Build and deploy with Docker Compose` step maps all five Variables into its environment, and
Compose forwards them to `app`. `NEXTAUTH_URL` continues to be derived from `APP_DOMAIN`; no new
origin setting is introduced. Workflow commands never echo the values.

Required repository configuration before an enabled-email rollout:

```text
MAIL_BRAND_COLOR
MAIL_SUPPORT_EMAIL
MAIL_LEGAL_NAME
MAIL_LEGAL_ADDRESS
MAIL_LOGO_URL (optional)
```

Extra Variables are harmless to the previous image, enabling configure-before-deploy rollout and
ordinary image rollback.

## Verification Contract

Automated checks cover:

1. Every missing required brand field and representative malformed value with mail enabled.
2. Valid brands with no logo, a valid logo, long allowed values, very light color, and very dark
   color.
3. Disabled mail with absent and malformed brand fields, proving the values are discarded.
4. Safe error messages by asserting forbidden supplied values never occur in errors or logs.
5. `instrumentation.register()` startup of the standalone artifact: valid enabled configuration
   becomes ready; invalid enabled configuration exits before a health request can succeed; disabled
   configuration starts without brand values.
6. Compose interpolation showing all five values on `app` and none on `migrate` or `db`, without
   printing values in test output.
7. Workflow structure showing conditional preflight and deployment mapping for all five Variables.
8. Docker build with mail disabled and no brand placeholders.
