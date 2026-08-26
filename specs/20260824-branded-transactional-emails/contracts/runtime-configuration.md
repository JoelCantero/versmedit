# Contract: Runtime Application Brand Configuration

**Interface kind**: Process environment and deployment contract

**Owner**: `src/lib/env.ts`, with startup invocation from `src/instrumentation.ts`

**Deployment consumers**: `.env.example`, `docker-compose.prod.yml`, and
`.github/workflows/deploy.yml`

This adds one global `BRAND` configuration shared by the web experience and the existing
discriminated `MAIL` configuration. Provider secrets, provider selection, fixed endpoints, and
delivery behavior remain unchanged.

## Variables

| Variable | GitHub source | Required at startup | Validation | Normalized `EmailBrand` field |
|----------|---------------|---------------------|------------|-------------------------------|
| `PROJECT_NAME` | Existing Variable | yes | Trimmed safe sender/product name, 1-70 characters, no ASCII controls | `productName` |
| `NEXTAUTH_URL` | Existing value derived from `APP_DOMAIN` | yes | Absolute HTTP(S) origin; no path beyond `/`, query, fragment, or user information | `canonicalOrigin` |
| `BRAND_COLOR` | New Variable | yes | `/^#[0-9A-Fa-f]{6}$/` | `primaryColor`, uppercase |
| `SUPPORT_EMAIL` | New Variable | yes | Trimmed bare email address, 1-320 characters | `supportEmail` |
| `MAIL_LOGO_URL` | New Variable | no | Ignored when mail is disabled; otherwise empty means absent or the value must be absolute HTTPS, at most 2,048 characters, with no user information or fragment | `logoUrl` or `null` |

`BRAND_COLOR`, `SUPPORT_EMAIL`, and `MAIL_LOGO_URL` are non-secret because they are intentionally
visible to site visitors or recipients. They are GitHub Actions Variables, not Secrets. None is
prefixed with `NEXT_PUBLIC_` or exposed through an application endpoint; the server layout applies
the validated color and support contact directly.

Static logo query parameters are permitted, but the configured URL is shared deployment-wide and
must not contain a recipient, credential, or per-message identifier. Presentation never appends one.

## Runtime Shape

The normalized environment gains one immutable global field. The enabled mail branch references
that same object while retaining every existing provider field:

```ts
interface Env {
  readonly BRAND: EmailBrand;
  readonly MAIL: MailConfig;
}

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
disabled `MAIL` branch has no provider or credential field; global `Env.BRAND` remains available.

The normalized brand guarantees:

- `productName` equals the existing normalized sender name;
- `canonicalOrigin` is `new URL(NEXTAUTH_URL).origin` and contains no credentials;
- `primaryColor` uses uppercase hex digits;
- `actionForeground` is the black or white value with the greater WCAG contrast ratio and passes
  4.5:1;
- `supportEmail` contains no leading/trailing whitespace and is one bare address;
- `logoUrl` is one normalized HTTPS string or `null`.

The email footer renders `productName` as its identity and accepts no separate legal name or postal
address.

Only `src/lib/env.ts` reads these environment variables. Presentation receives `EmailBrand` as a
value and never reads process state.

## Validation

| `MAIL_ENABLED` | Global brand inputs | Result |
|----------------|---------------------|--------|
| unset or `false` | required values valid, logo absent, valid, or malformed | Startup succeeds with normalized `BRAND.logoUrl = null` and `{ MAIL: { enabled: false } }` |
| unset or `false` | required global value absent/empty or malformed | Entire application startup fails |
| `true` | required values valid, optional logo absent or valid | Startup succeeds and `MAIL.brand` references normalized `BRAND` |
| `true` | required value absent/empty or any supplied value malformed | Entire application startup fails |
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

`.env.example` documents the two required global values beside `PROJECT_NAME` and the optional email
logo beside provider settings. A representative non-secret setup is:

```dotenv
BRAND_COLOR="#0E79B2"
SUPPORT_EMAIL=login@versmedit.com
MAIL_LOGO_URL=
```

`pnpm email:dev` reads only these public brand values plus `PROJECT_NAME` from the repository
`.env`; all other configuration, including provider and application secrets, remains unavailable to
the preview. Without `.env`, direct preview execution uses its deterministic fictional fallback.
Normal application development requires the global values even when `MAIL_ENABLED=false`.

## Docker Build and Runtime

- The Docker build uses fixed non-secret `BRAND_COLOR` and `SUPPORT_EMAIL` placeholders while
  collecting Next.js metadata; production values are not accepted as build arguments.
- Both React Email runtime packages are installed in the dependency stage and included by the
  application standalone build.
- `docker-compose.prod.yml` forwards the two global variables and optional email logo to `app` only.
- The `migrate` and `db` services receive none of them.
- No value is written to a host `.env` file, image layer, build argument, Compose label, healthcheck,
  or command line.
- No new service, port, volume, network, or restart policy is introduced.

The app runner reads the values only when its Node process starts. Correcting variables requires an
ordinary app container recreation/restart; there is no data rollback.

## GitHub Actions Propagation

The deploy workflow performs two distinct duties.

### Preflight

The existing `Validate required variables and secrets` step maps all three GitHub Variables into its
step environment. It always reports an empty `BRAND_COLOR` or `SUPPORT_EMAIL` by name.
`MAIL_LOGO_URL` may be empty. The application schema remains authoritative for complete format and
normalization checks at container startup.

Mail state affects only provider requirements; it never weakens the global brand gate.

### Deployment environment

The `Build and deploy with Docker Compose` step maps all three Variables into its environment, and
Compose forwards them to `app`. `NEXTAUTH_URL` continues to be derived from `APP_DOMAIN`; no new
origin setting is introduced. Workflow commands never echo the values.

Required repository configuration before any rollout:

```text
BRAND_COLOR
SUPPORT_EMAIL
MAIL_LOGO_URL (optional)
```

Extra Variables are harmless to the previous image, enabling configure-before-deploy rollout and
ordinary image rollback.

## Verification Contract

Automated checks cover:

1. Every missing required global brand field and representative malformed value in both mail states.
2. Valid brands with no logo, a valid logo, long allowed values, very light color, and very dark
   color.
3. Disabled mail with valid global branding and a malformed logo, proving the web identity remains
  available and the email-only setting is discarded without enabling delivery.
4. Safe error messages by asserting forbidden supplied values never occur in errors or logs.
5. `instrumentation.register()` startup of the standalone artifact: valid configuration becomes
  ready in both mail states; invalid global configuration exits before a health request can succeed.
6. Compose interpolation showing all three values on `app` and none on `migrate` or `db`, without
   printing values in test output.
7. Workflow structure showing unconditional global preflight and deployment mapping for all three Variables.
8. Docker build with fixed public brand placeholders and no production brand build arguments.
