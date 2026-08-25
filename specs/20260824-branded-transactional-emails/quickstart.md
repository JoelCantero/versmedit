# Quickstart: Validate Unified Branded Transactional Emails

This guide validates the completed feature. It does not define implementation tasks. The expected
interfaces and invariants are in [data-model.md](./data-model.md) and [contracts/](./contracts/).

## Prerequisites

- Node.js 24.15 or newer, but below 25
- Corepack with pnpm 11.22.0
- Docker Engine with Docker Compose
- Chromium installed for Playwright
- For the release gate, controlled test inboxes or a rendering service covering the named clients

From the repository root, confirm the toolchain and install the locked dependencies:

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Expected: Node reports `v24.x`, pnpm reports `11.22.0`, and installation changes neither
`package.json` nor `pnpm-lock.yaml`.

## 1. Review the Local Catalogue

Start the isolated loopback-only preview:

```bash
pnpm email:dev
```

Open `http://127.0.0.1:3001` and inspect the catalogue.

Expected:

- the index lists exactly 36 links: 12 variants in each of `en`, `es`, and `ca`;
- every detail page shows a subject plus display, HTML source, and plain-text views;
- desktop/mobile width controls do not clip or overlap essential content;
- the product remains identified with the fixture logo absent;
- action variants show one unique fictional destination and informational variants show none;
- there is no recipient field, form, send/test-send button, provider/upload control, or credential
  setup;
- the main application, Docker, database, `.env`, and provider fixture remain stopped.

Stop the preview with `Ctrl+C` before running the automated suites.

## 2. Run Focused Presentation Checks

```bash
pnpm exec vitest run \
  tests/unit/email-presentation.test.tsx \
  tests/unit/email-preview-catalog.test.ts \
  tests/unit/email-architecture.test.ts \
  tests/unit/env.test.ts
```

Expected:

- all 36 locale/variant combinations render complete HTML and non-empty plain text;
- catalogue shape, locale purity, placeholders, escaping, URL integrity, HTML/text parity, contrast,
  long values, and optional-logo checks pass;
- both existing provider request shapes for every fixture remain below the 1 MiB UTF-8 limit, and
  the existing HTTP boundary rejects an oversize operational request before network submission;
- generic confirmation rejects caller-owned copy/content fields;
- architecture checks find no preview send surface, provider/application import, production trigger,
  or log-content path;
- enabled mail accepts valid branding and rejects each invalid field safely;
- disabled mail starts with absent or malformed brand settings;
- warm ARM64-target rendering p95 remains below 100 ms, and the 36-fixture render completes within
  5 seconds in CI.

## 3. Run Operational Flow Checks

Start only the test database and apply migrations using the existing local test environment:

```bash
docker compose up -d --wait db
pnpm db:deploy
```

Run the focused business-flow and delivery-contract suites:

```bash
pnpm exec vitest run \
  tests/unit/email.test.ts \
  tests/unit/email-brevo.test.ts \
  tests/unit/email-mailjet.test.ts \
  tests/unit/email-logging.test.ts \
  tests/unit/signup-email.test.ts \
  tests/unit/account-security-email.test.ts \
  tests/unit/personal-data-export-email.test.ts \
  tests/integration/magic-link-login.test.ts \
  tests/integration/signup-onboarding.test.ts \
  tests/integration/signup-migration.test.ts \
  tests/integration/account-deletion-reauth.test.ts \
  tests/integration/account-security-reauth.test.ts \
  tests/integration/personal-data-export-migration.test.ts \
  tests/integration/personal-data-export-observability.test.ts
```

Expected:

- all six operational events keep their established recipient, locale, purpose, destination,
  credential scope/expiry, provider payload, acceptance result, and public outcome;
- the existing-account notice retains only its canonical locale-aware credential-free login URL;
- rendering completes before the single provider attempt;
- render or delivery rejection leaves no newly issued credential usable and restores no superseded
  credential;
- delivery logging remains allowlisted and records no recipient, subject, body, URL, credential,
  template value, or brand value.

## 4. Run Repository Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm audit:prod
```

Expected:

- lint and type checking report no errors;
- coverage meets the repository thresholds;
- the production build succeeds without branding because build-time mail remains disabled;
- the production dependency audit reports no high-or-higher vulnerability;
- no Prisma migration or generated database model appears for this feature.

## 5. Exercise the Standalone Artifact

The E2E harness starts a disposable PostgreSQL service, builds the production standalone artifact,
starts it with a fake provider, and runs desktop/mobile Playwright projects:

```bash
pnpm test:e2e
E2E_MAIL_PROVIDER=mailjet pnpm test:e2e
```

Expected for both provider selections:

- startup instrumentation accepts the complete fixture configuration before health becomes ready;
- each operational flow renders and crosses the unchanged fake-provider boundary;
- preview routes and future-variant triggers return no application surface;
- the standalone artifact has no missing React Email module or traced runtime asset;
- the fake provider records the expected request count and no request from local preview behavior.

The startup-focused E2E case must also launch the standalone server with one malformed required brand
field and verify that the process exits before `/api/health` can succeed. Its diagnostic may name the
field but must not include the supplied value.

## 6. Build the Production Runner

```bash
docker build \
  --target runner \
  --file docker/Dockerfile \
  --tag versmedit:branded-email-validation \
  .
```

Expected:

- the runner builds on the current architecture with the locked runtime packages;
- no preview server, preview project, extra service, or development CLI is installed in the runner;
- the image continues to start with the existing `node server.js` command;
- the change introduces no new port, volume, network, or host-specific path.

## 7. Verify Deployment Configuration

In a non-production shell, provide fictional values for the existing deployment variables and the
five brand Variables, then inspect Compose without printing resolved environment values:

```bash
docker compose -f docker-compose.prod.yml config --services
```

Expected: only the existing `app`, `migrate`, and `db` services appear. Automated configuration tests
must additionally prove that all five brand names are forwarded only to `app`, the workflow requires
the four non-optional values when mail is enabled, and neither path prints their values.

Before an enabled-email deployment, set these GitHub Actions Variables:

```text
MAIL_BRAND_COLOR
MAIL_SUPPORT_EMAIL
MAIL_LEGAL_NAME
MAIL_LEGAL_ADDRESS
MAIL_LOGO_URL (optional)
```

Do not add them as Secrets, build arguments, or a production `.env` file.

## 8. Complete the Named-Client Gate

Use only fictional fixture HTML from the local catalogue. Submit it directly to a controlled
client-rendering service, or place it in controlled test inboxes outside the application. Do not add
a repository send command or enable a future variant.

Run all 36 default fixtures through this matrix:

| Client | Required current stable surface |
|--------|---------------------------------|
| Gmail | Web |
| Gmail | Android and/or iOS mobile client used by the release matrix |
| Apple Mail | macOS |
| Mail | iOS |
| Outlook | Web |
| Outlook | Classic desktop |

For each locale, also repeat representative stress fixtures with remote images blocked, a configured
but unreachable logo, light/dark allowed brand colors, and the longest legal/copy/action values.

Record client/version, variant, locale, viewport, image state, result, and screenshot/reference.
Pass requires:

- recognizable product text without relying on the logo;
- intact reading order, heading, body, support, legal identity/address, Terms, and Privacy links;
- one usable primary action plus visible matching fallback destination where required;
- no action destination on the two informational future variants;
- no clipping, overlap, or horizontal overflow that prevents reading or action;
- no script, tracking, unexpected remote request, or mixed-language copy.

Pixel-identical layout is not required. Any loss of essential content or action is a release blocker.

## 9. Complete the Content-Comprehension Gate

Use only the six operational messages rendered with fictional fixtures. Recruit at least six people
who did not implement the feature, including at least two people proficient in each of English,
Spanish, and Catalan. Assign each reviewer one language in which they are proficient and present all
six operational messages in that language without explanatory text outside the message.

For each message, ask the reviewer to identify:

1. the message's purpose; and
2. the action they should take next, including that no account action is authorized by the
  existing-account signup notice.

Score each reviewer-message assessment against a fixed answer rubric prepared before the session. An
assessment passes only when both answers are correct. With the minimum six reviewers this produces
36 assessments; at least 33 must pass to exceed the required 90% threshold. If additional reviewers
participate, at least 90% of all reviewer-message assessments must pass, rounded up to the next whole
assessment.

Record only an anonymous reviewer code, proficient locale, variant, purpose result, next-action
result, and overall pass/fail in
`specs/20260824-branded-transactional-emails/content-comprehension.md`. Do not record names, email
addresses, free-text personal information, or real message data. A result below 90% blocks release
and requires copy revision followed by a complete rerun.

## 10. Final Acceptance

```bash
git diff --check
git status --short
```

Confirm that the implementation matches all three contracts, all automated gates pass, the complete
named-client matrix and passing content-comprehension review are recorded, and the diff contains no
Prisma migration, preview production route, provider redesign, future sending path, real fixture
data, or logged message content.
