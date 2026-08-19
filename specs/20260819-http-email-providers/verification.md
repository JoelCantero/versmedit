# Transactional Email HTTP Provider Verification

All evidence in this file is intentionally redacted. It must not contain credentials, recipient
addresses, message content, activation links, authorization headers, provider payloads, or account
identifiers. Provider acceptance is recorded as submission acceptance, never as delivery.

## Controlled Production-Artifact E2E

Recorded at: `2026-08-19T16:19:37Z`

| Provider | Command | Result | External traffic |
|----------|---------|--------|------------------|
| Brevo | `E2E_MAIL_PROVIDER=brevo pnpm test:e2e` | PASS, 14/14 | None; exact official logical URLs forwarded by the allowlisted test preload |
| Mailjet | `E2E_MAIL_PROVIDER=mailjet pnpm test:e2e` | PASS, 14/14 | None; exact official logical URLs forwarded by the allowlisted test preload |

Both runs built and started the standalone production artifact, deployed all database migrations to
an isolated PostgreSQL instance, and completed signup activation through the normal Auth.js session.
The provider fixture assertions covered the exact logical endpoint, method, authentication scheme,
sender, recipient, localized subject, text and HTML bodies, and request count. Fake E2E credentials
were used and no application provider base-URL override was exposed.

This evidence validates only the controlled HTTP-provider contract. It does not satisfy the real
development-provider or production-mailbox smoke gates below.

## Development Real-Provider Smoke (T048)

Status: **PASS**

Completed at: `2026-08-19T19:34:28Z`

Provider: Brevo

- The provider health probe and controlled known-user login submission were accepted with `2xx`.
- The provider accepted a new-signup activation submission with `2xx`.
- Both messages reached the controlled mailbox. The signup link activated the pending account and
	redirected to the localized application; the login link created the normal Auth.js session and
	authenticated account access returned `200`.
- The real-provider events contained only the allowlisted provider, category, acceptance,
	status-class, duration, and correlation fields. No credentials, recipients, names, message
	content, links, endpoint URLs, authorization values, or provider payloads appeared.
- The first callback check exposed that Next development request logging included query strings.
	Incoming framework request logs were then disabled in `next.config.ts`, covered by a regression
	test, and the real login/signup submissions were repeated. The post-fix output contained only
	allowlisted structured events and no request URLs.
- The removed packages, fixtures, and environment wiring were absent throughout the final run; no
	alternate transport or fallback path existed.

## Production HTTP Deployment and Smoke (T049)

Status: **BLOCKED**

At `2026-08-19T16:19:37Z`, the HTTP implementation existed only as uncommitted work on branch
`20260819-http-email-providers`. Repository configuration exposed only the legacy
`AUTH_EMAIL_ENABLED`/`SMTP_*` mail settings; required `MAIL_*` Variables and Secrets were absent.
No HTTP artifact was deployed and no production smoke was attempted.

The latest successful deployment before this migration used commit
`9375b2f7377f8c2cf39a492e8e6e75e3ec03ba80` (workflow run `32242471084`). It is the current
pre-cleanup rollback candidate and must remain available with legacy SMTP configuration until the
HTTP production smoke succeeds.

Required evidence before completion:

- immutable HTTP artifact reference and successful deployment run;
- active provider and UTC timestamp;
- accepted controlled login and signup submissions;
- usable mailbox links without content disclosure;
- confirmed rollback artifact reference;
- zero secret/content leakage in deployment and application logs.

## Legacy Transport Cleanup

Recorded at: `2026-08-19T19:19:39Z`

Status: **REPOSITORY AND REMOTE CONFIGURATION CLEANUP COMPLETE; REDEPLOY PENDING**

At the user's explicit direction, rollback configuration was removed before T048 and T049 completed.
The obsolete fixtures and direct development/runtime packages were deleted, the lockfile was
regenerated, and the repository runbook now documents only the HTTP providers. The migration guard
passed 4/4, `pnpm why` reported no installed path for either removed package, the affected unit slice
passed 45/45, and TypeScript completed without errors.

All matching legacy GitHub Repository Variables and Secrets were deleted and a name-only query
confirmed none remained. This intentionally retires the pre-cleanup rollback procedure. Recovery is
now limited to rotating or correcting `MAIL_*` configuration or deploying a compatible forward fix.

T053 remains open until the cleaned artifact is deployed and controlled production login/signup
smoke checks pass. T048 and T049 also remain open because no real mailbox evidence has yet been
recorded.

## Quality Gates (T054)

Recorded at: `2026-08-19T19:32:53Z`

| Command | Result |
|---------|--------|
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 55 files and 548 tests; 1 intentionally skipped |
| `pnpm test:coverage` | PASS, 91.92% statements, 85.76% branches, 91.46% functions, 93.56% lines |

The integration gates used an isolated PostgreSQL database and the same required environment
contract as CI. Vitest files run serially because the PostgreSQL-backed integration suites exercise
and clean the same provider-global health rows; this preserves the real cross-instance lock race
without cross-file teardown interference. No test or coverage exclusion was added.

## Standalone, Audit, and Build Gates (T055)

Recorded at: `2026-08-19T19:36:12Z`

| Command | Result |
|---------|--------|
| `E2E_MAIL_PROVIDER=brevo pnpm test:e2e` | PASS, 14/14 |
| `E2E_MAIL_PROVIDER=mailjet pnpm test:e2e` | PASS, 14/14 |
| `pnpm audit:prod` | PASS, no known vulnerabilities |
| `pnpm build` | PASS |

Both E2E runs applied migrations to isolated PostgreSQL instances, built the standalone production
artifact, and used only the exact-URL allowlisted HTTP fixture. No external provider traffic or
runtime endpoint override was used.

## Production Image Gate (T056 Partial)

Recorded at: `2026-08-19T19:36:12Z`

`docker build -f docker/Dockerfile .` passed. A runtime check inside the resulting runner image
confirmed that neither removed mail package was resolvable. Final release readiness remains pending
until T049 and T053 deploy the cleaned artifact and complete controlled production login/signup
smoke checks with a rotated provider credential.