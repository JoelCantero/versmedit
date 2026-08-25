# Contract: Local Preview Catalogue

**Interface kind**: Local development UI and package command

**Owner**: `emails/`

**Availability**: Developer workstation only; absent from application routes and production runner

The catalogue presents rendered output from the pure
[email presentation contract](./email-presentation.md). It has no relationship to the existing
delivery boundary.

## Command

`package.json` exposes exactly this preview command:

```json
{
  "email:dev": "NEXT_TELEMETRY_DISABLED=1 next dev emails --hostname 127.0.0.1 --port 3001"
}
```

Expected behavior:

- starts the separate `emails/` Next.js project, not the application project;
- listens on loopback only at `http://127.0.0.1:3001`;
- requires no `.env`, Docker service, database, authentication, provider credential, or Internet
  connection;
- performs no seed, migration, application startup, or production build step;
- supports ordinary development refresh when presentation or fixture source changes.

The project uses the repository's existing Next.js and React dependencies. It does not install or
invoke `react-email`, `@react-email/ui`, Resend, Brevo, Mailjet, or a general-purpose email preview
service.

## Manifest Interface

```ts
type PreviewKey = `${EmailLocale}/${EmailVariant}`;

interface PreviewManifestEntry {
  readonly key: PreviewKey;
  readonly locale: EmailLocale;
  readonly variant: EmailVariant;
  readonly slug: string;
  readonly href: `/${EmailLocale}/${string}`;
  readonly request: EmailPresentationRequest;
}

declare const previewManifest: readonly PreviewManifestEntry[];
declare const previewFixtures: Readonly<Record<PreviewKey, EmailPresentationRequest>>;
```

The manifest is generated from closed `EMAIL_LOCALES` and `EMAIL_VARIANTS` constants and is ordered
deterministically by locale, then catalogue order. Compile-time `satisfies` checks and runtime tests
prove unique keys, slugs, and hrefs.

## Route Catalogue

The root page lists every path below. The detail route
`/[locale]/[variant]` obtains its static parameters only from `previewManifest` and returns not found
for every other value. It accepts no query-string override or request body.

| Variant | English | Spanish | Catalan |
|---------|---------|---------|---------|
| Login magic link | `/en/login-magic-link` | `/es/login-magic-link` | `/ca/login-magic-link` |
| Signup activation | `/en/signup-activation` | `/es/signup-activation` | `/ca/signup-activation` |
| Existing-account signup notice | `/en/existing-account-signup-notice` | `/es/existing-account-signup-notice` | `/ca/existing-account-signup-notice` |
| Account-deletion reauthentication | `/en/account-deletion-reauthentication` | `/es/account-deletion-reauthentication` | `/ca/account-deletion-reauthentication` |
| Account-security reauthentication | `/en/account-security-reauthentication` | `/es/account-security-reauthentication` | `/ca/account-security-reauthentication` |
| Personal-data-export confirmation | `/en/personal-data-export-confirmation` | `/es/personal-data-export-confirmation` | `/ca/personal-data-export-confirmation` |
| Personal-data-export ready | `/en/personal-data-export-ready` | `/es/personal-data-export-ready` | `/ca/personal-data-export-ready` |
| Account deleted | `/en/account-deleted` | `/es/account-deleted` | `/ca/account-deleted` |
| Email change requested | `/en/email-change-requested` | `/es/email-change-requested` | `/ca/email-change-requested` |
| Email changed | `/en/email-changed` | `/es/email-changed` | `/ca/email-changed` |
| Security alert | `/en/security-alert` | `/es/security-alert` | `/ca/security-alert` |
| Generic confirmation | `/en/generic-confirmation` | `/es/generic-confirmation` | `/ca/generic-confirmation` |

This table is normative: 12 rows multiplied by 3 locale columns yields exactly 36 entries. No
additional example, draft, folder, or hidden template is counted.

## Fixture Contract

All 36 requests share one immutable fictional brand:

| Field | Fixture rule |
|-------|--------------|
| Product | Clearly fictional name, never copied from deployment configuration |
| Canonical origin | HTTPS URL under a `.test` host |
| Primary color | Fixed valid color whose selected foreground passes 4.5:1 contrast |
| Support address | Address under `example.com`, `example.org`, or `example.net` |
| Legal identity/address | Clearly fictional organization and postal address |
| Logo | `null`, so offline review makes no asset request; logo cases remain automated render tests |

Variant values obey these rules:

- every email address uses an IANA-reserved example domain;
- every action URL uses `example.com`, `example.org`, `example.net`, or a `.test` host;
- credential-shaped values literally identify themselves as non-real, such as
  `not-a-real-login-token`;
- the existing-account login fixture has no query or fragment;
- `newEmail`, `occurredAt`, and `reference` are fixed, obviously fictional display values;
- no fixture contains production copy, a real person or organization, a deliverable address, an IP
  address, device metadata, session identifier, provider value, environment value, or secret;
- fixture construction never reads a clock, random source, process environment, file, network, or
  application state.

Locale-specific action paths preserve the requested locale where the corresponding operational
destination does. The manifest does not imply that a fictional preview URL is a valid application
route.

## UI Contract

The catalogue index:

- groups all 36 links by locale and labels each with the localized variant name;
- shows the operational or preview-only classification and action/informational status;
- provides no editable value, recipient, or provider field.

Each detail page:

- displays locale, variant, classification, and subject;
- provides display, HTML source, and plain-text views of one manifest-owned render;
- renders HTML in a constrained `srcDoc` frame at selectable representative desktop and mobile
  widths;
- disables link navigation inside the display frame while leaving destinations inspectable in
  source and plain text;
- provides catalogue navigation only.

The UI contains no form submission, server action, route handler, API endpoint, upload, download-to-
provider, credential setup, recipient input, send/test-send control, or button labeled with a send or
provider action. Unknown route parameters never become presentation values.

## Import Boundary

Files under `emails/` may import only:

- React and Next.js display/navigation APIs;
- types, components, and pure renderer functions from `src/lib/email/presentation/`;
- the local fictional fixture manifest;
- local display styles/components with no network or application dependency.

They must not import:

- `server-only`, `src/lib/env.ts`, `src/lib/email/index.ts`, or provider adapters;
- Auth.js, Prisma/database, request/session, account, signup, token, job, or route modules;
- Pino or any application logger;
- Resend, Brevo, Mailjet, SMTP, fetch/HTTP clients, filesystem APIs, child processes, or environment
  loaders.

No file below `emails/app/` may be named `route.ts`, `route.tsx`, `middleware.ts`, or `actions.ts`.
Architecture tests walk both imports and filenames.

## Production Isolation

- The main application has no import from `emails/`.
- The main App Router exposes no email-preview route.
- No Compose service, port, ingress rule, image command, workflow daemon, or production script starts
  `email:dev`.
- The Docker runner continues to copy only the application standalone output, static assets, and
  public files; it does not copy the preview project.
- Preview-only variants are referenced by presentation, fixtures, and rendering tests only. They are
  absent from production wrappers, routes, services, jobs, and delivery calls.

## Verification Contract

Automated tests must prove:

1. The locale/variant Cartesian product has 36 unique entries and exactly the normative paths above.
2. Every entry renders non-empty subject, complete HTML, and non-empty plain text without unresolved
   values or mixed-locale fallback.
3. Every fixture satisfies the fictional-data rules and serializes without a real or environment-
   derived value.
4. Import and filename denylist checks pass, and production modules contain no import from `emails/`.
5. Navigating all 36 routes in Playwright makes only loopback preview asset/document requests, emits
   no application log event, exposes no form or sending/provider control, and never reaches a
   provider, application route, credential operation, or production-data source.
6. Main application route inspection, standalone execution, and Docker runner inspection find no
   preview route, project file, start command, or future-variant send entry point.
