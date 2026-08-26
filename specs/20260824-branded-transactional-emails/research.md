# Phase 0 Research: Unified Branded Transactional Emails

## Decision 1: Add only the React Email runtime packages

**Decision**: Add `@react-email/components` and `@react-email/render` as production dependencies.
The versions current during planning are `@react-email/components` 1.0.12 and
`@react-email/render` 2.1.0; the lockfile will hold the exact resolved versions. Build the local
catalogue with the repository's existing Next.js and React dependencies rather than installing the
`react-email` CLI or `@react-email/ui`.

**Rationale**: The component and render packages are needed by operational messages in the
standalone server and by the local catalogue. Published package metadata supports React 19 and
Node.js 20 or newer, which covers this repository's React 19.2 and Node.js 24 runtime. Reusing the
existing framework adds no preview-only dependency or production service.

**Alternatives considered**:

- Use the stock React Email CLI preview: rejected because `react-email@6.9.2` passes a stored Resend
  API key to `@react-email/ui@6.9.2`, whose toolbar always exposes a Resend integration tab and
  offers setup/upload controls even when no key is configured. That contradicts the requirement
  that the preview expose no sending control.
- Use the CLI package for runtime rendering: rejected because it includes development-server,
  export, and Resend integration behavior that operational sends do not need.
- Hand-build HTML strings: rejected because it preserves the duplication and review problems this
  feature is intended to remove.
- Use provider-hosted templates: rejected because it would couple presentation to Brevo/Mailjet and
  break local, provider-neutral rendering.

## Decision 2: Insert one pure presentation boundary before delivery

**Decision**: Add a pure `src/lib/email/presentation/` module. It accepts a discriminated message
variant, locale, validated brand, and already-decided structured values, then asynchronously returns
only `subject`, `html`, and `text`. Existing domain email wrappers add `recipient` and `locale` and
pass the result unchanged to `sendTransactionalEmail`.

**Rationale**: All six operational variants currently converge on the exact
`recipient/locale/subject/text/html` delivery contract. Existing business services already own URL
construction, credential issuance, acceptance checks, and exact-token compensation. A renderer
exception therefore follows the same catch and compensation path as a delivery failure without
moving security behavior into templates.

The presentation module must not import environment access, database code, authentication,
providers, the logger, or business services. This makes it reusable by the isolated preview and
keeps future-only variants structurally unable to send.

**Alternatives considered**:

- Put rendering inside `sendTransactionalEmail`: rejected because the delivery boundary would need
  variant-specific props and would cease to accept provider-neutral rendered content.
- Let each domain own a React Email template: rejected because shared brand, legal structure, copy
  validation, and plain-text parity would remain duplicated.
- Let templates generate credentials or destinations: rejected because it would weaken the current
  lifecycle and compensation boundaries.

## Decision 3: Use a typed catalogue and existing locale files

**Decision**: Add one `Email` namespace to each existing `src/messages/en.json`, `es.json`, and
`ca.json` catalogue. A typed catalogue maps exactly 12 stable variant identifiers to their required
localized fields and action mode. Rendering rejects an unsupported locale or incomplete copy; it
never falls back to another language.

Operational copy may be rewritten but must preserve its documented meaning, next action, and
security information. The existing-account notice retains its canonical locale-aware login URL but
receives no token. Generic confirmation copy is catalogue-owned; callers cannot supply subject,
body, action label, HTML, or plain text.

**Rationale**: The application already imports these JSON catalogues directly in server email
builders, so this preserves the repository's i18n source of truth without requiring an application
request context. Strict variant inputs prevent arbitrary-content rendering and make the action/no
action matrix testable.

**Alternatives considered**:

- Keep copy beside each component: rejected because user-facing strings would bypass the project's
  locale catalogues.
- Use English fallback copy: rejected because the specification requires locale-pure output.
- Accept arbitrary generic-confirmation copy: rejected because it creates an unrestricted renderer
  and a future unreviewed sending surface.

## Decision 4: Render HTML and plain text from one component tree

**Decision**: Compose messages with React Email structural components and inline, email-safe styles.
Render the same element once as HTML and once in plain-text mode. Action-bearing messages include
one unique action URL in a primary action and an explicit copy/paste fallback section; informational
messages omit that section. Do not use `dangerouslySetInnerHTML`, remote scripts, tracking features,
or CSS that is essential to understanding the message.

**Rationale**: One tree minimizes semantic drift between alternatives. React escapes text and
attribute values by default, while explicit URL validation protects link destinations. A visible
fallback URL survives clients that suppress buttons or styles. Shared support and legal links are
derived independently and can never inherit an action credential.

The action foreground is chosen as black or white using WCAG relative luminance and contrast math;
the selected pair must meet 4.5:1. The text product name is always rendered, so a missing or blocked
logo does not remove identity.

**Alternatives considered**:

- Maintain a separate handwritten text template: rejected because content changes could silently
  diverge.
- Inline raw HTML from catalogue values: rejected because it expands the injection surface.
- Depend on the logo or web fonts for identity: rejected because email clients commonly block
  remote assets.

## Decision 5: Validate one deployment-wide application brand in the existing environment boundary

**Decision**: Reuse `PROJECT_NAME` and `NEXTAUTH_URL`, and add these non-secret settings:

- `BRAND_COLOR`: required six-digit CSS hex color (`#RRGGBB`) shared by the web UI and email.
- `SUPPORT_EMAIL`: required bare support email address shared by the web UI and email.
- `MAIL_LOGO_URL`: optional absolute HTTPS URL with no user information or fragment.

`validateEnv` validates the global name, color, support contact, and origin during every startup and
exposes the normalized object as `Env.BRAND`. Enabled mail validates the optional logo and references
that same object. Disabled mail discards the email-only logo setting. Any applicable failure aborts
the whole application before requests are served and reports field names only. The Docker build uses
fixed public color and support placeholders because Next.js evaluates server modules while
collecting metadata; real production values are injected only when the container starts.

Add `src/instrumentation.ts` and call `getEnv()` from its Node.js `register()` path. The installed
Next.js 16.3 documentation guarantees that `register()` runs once for each new server instance and
must complete before the server is ready to handle requests. Route-level validation remains defense
in depth; startup failure no longer depends on which route module is imported first.

**Rationale**: Environment validation already implements conditional fail-fast provider settings.
Extending the same boundary with unconditional global brand validation prevents templates or callers
from reading raw environment values. The documented instrumentation lifecycle makes that boundary a
real process-start gate. `BRAND_COLOR`, `SUPPORT_EMAIL`, and optional `MAIL_LOGO_URL` are GitHub
Variables, not Secrets, and must be forwarded through deployment validation and Compose.

**Alternatives considered**:

- Validate on each send: rejected because a broken deployment would start and fail user workflows.
- Store branding in PostgreSQL: rejected because this is one deployment-wide brand and no admin
  workflow or persistence is required.
- Add per-message logo/color inputs: rejected because branding must not vary by recipient or
  template.

## Decision 6: Use an isolated local catalogue with 36 static route parameters

**Decision**: Add `pnpm email:dev`, running the existing Next.js development server against the
standalone `emails/` project on loopback port 3001. One closed fictional fixture manifest supplies
the exact Cartesian product of 12 variants and 3 locales. Its 36 keys become static preview route
parameters and catalogue links; a shared preview page renders the pure presentation component and
offers display/source inspection only.

The preview project has no API or server-action files and imports no application environment,
`server-only` module, authentication, database, logger, provider, delivery, or business service.
It defines no form, recipient field, provider credential, upload action, or sending control. Fixtures
use `example.com`, `example.org`, and `.test` destinations, fixed obvious names, and inert opaque
values. The preview project binds to `127.0.0.1`, is excluded from the production image, and runs
without the main application, Docker, or an `.env` file.

**Rationale**: A repository-owned catalogue can make every required combination directly navigable
while remaining structurally unable to send. It reuses installed Next.js and React, adds no public
route to the application, and avoids the stock React Email UI's Resend controls. Central fixtures
avoid copying production data and make isolation auditable.

**Alternatives considered**:

- Add a route to the main Next.js application: rejected explicitly by the specification.
- Use one preview with a locale prop editor but no manifest routes: rejected because it would not
  list all 36 combinations directly or prove complete Cartesian coverage.
- Patch `@react-email/ui` to remove its Resend controls: rejected because a version-sensitive fork is
  less auditable than a minimal local catalogue and still carries unused provider integration code.
- Add a repository send-test command: rejected because preview-only variants must have no sending
  entry point.

## Decision 7: Bundle runtime packages normally and prove standalone tracing

**Decision**: Keep React Email runtime imports static and let Next.js bundle App Router server
dependencies by default. Do not add React Email packages to `serverExternalPackages`. Do not add
blanket trace includes. Run the production build, standalone server E2E, and Docker runner build; add
a narrow `outputFileTracingIncludes` pattern only if those checks prove a specific runtime file is
missing.

**Rationale**: The installed Next.js 16.3 documentation states that App Router server packages are
bundled automatically and standalone output copies traced runtime files. Externalizing packages
would increase reliance on copied `node_modules`, while broad trace patterns would inflate the
512 MiB Raspberry Pi image. A production-artifact test is the discriminating check required by the
specification.

**Alternatives considered**:

- Externalize all React Email packages: rejected without evidence of a bundling incompatibility.
- Copy all package files through a global trace include: rejected as oversized and unnecessary.
- Assume a successful compile proves runtime availability: rejected because standalone tracing can
  fail only after startup or execution.

## Decision 8: Keep compatibility verification automated

**Decision**: Automate the 36-render matrix, escaping, URL integrity, content parity, contrast,
request size, responsive HTML inspection, preview isolation, existing flow integration, logs,
standalone execution, and Docker build. The loopback browser catalogue remains a development review
aid, while release acceptance relies on reproducible automated checks across representative widths,
logo states, brand colors, and long-content cases.

**Rationale**: The feature requires a deterministic release gate that can run locally and in CI
without controlled inboxes, proprietary clients, external rendering services, or human reviewers.
The automated checks cover the security, content, layout, contract, and catalogue properties owned
by this implementation.

**Alternatives considered**:

- Require a manual matrix in proprietary email clients: rejected because it is not part of the
  desired release process and cannot be reproduced by CI.
- Require a comprehension study with external reviewers: rejected because automated semantic and
  localization checks are the acceptance mechanism for this feature.

## Decision 9: Use an application-only rollout with no data migration

**Decision**: No Prisma schema, migration, worker, queue, container, public endpoint, or persisted
message record is added. Configure `BRAND_COLOR` and `SUPPORT_EMAIL` before deploying the new image.
Extra Variables are harmless to the old version, so rollback remains an application-image rollback.
Invalid configuration keeps the new app unhealthy until corrected and restarted.

**Rationale**: All new state is immutable runtime configuration or ephemeral render input. Existing
credential records and compensation transactions remain unchanged. This gives a forward-only,
zero-data migration and a simple recovery path.

**Alternatives considered**:

- Add persisted templates or brand records: rejected because there is no product workflow to edit
  them.
- Add a worker for rendering: rejected because one small CPU-local render is part of an existing
  request and has no retry semantics.
