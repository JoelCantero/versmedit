# Phase 0 Research: Separate Application Layers

## Decision 1: Preserve the existing HTTP contracts as authoritative

**Decision**: Keep the existing signup, login, and account-deletion HTTP contracts unchanged. Route
handlers continue to own canonical-origin checks, query/body parsing, Auth.js session and callback
invocation, safe callback destinations, status codes, headers, cookies, JSON bodies, and redirects.
The existing contracts in `specs/20260818-signup-page/contracts/openapi.yaml` and
`specs/20260820-account-deletion/contracts/account-deletion.openapi.yaml` remain authoritative.
This feature adds a compatibility contract that records the invariants without redefining those
OpenAPI operations.

**Rationale**: The feature is an internal refactor. Reusing the established contracts makes any
transport change visible as a regression and avoids creating a second definition that could drift.
Next.js route-handler guidance also places `Request`, `Response`, and redirects at the route
boundary.

**Alternatives considered**: Rewriting the existing OpenAPI files was rejected because historical
feature artifacts must remain stable. Creating new endpoints or changing response unions was
rejected because the specification requires zero observable behavior change. Letting services
return `Response` objects was rejected because it preserves the boundary violation.

## Decision 2: Use staged domain preflights to preserve call order

**Decision**: Add domain-local signup and deletion verification operations with two stages:

1. A server-only preflight hashes the validated raw token, loads the token and target user, applies
   purpose, delivery, expiry, locale, and user-status rules, and returns either `invalid_link` or an
   internal eligible candidate containing only `userId`, normalized `identifier`, `tokenHash`, and
   `locale`.
2. After the route obtains the current user ID through the existing Auth.js session endpoint, a pure
   domain function combines the candidate and current user ID into `eligible` or
   `session_conflict`.

The token's 43-character Base64URL syntax remains transport validation in each route. Internal
candidate and result types stay in server-only service modules rather than client-consumable
`types.ts` files.

**Rationale**: Today, invalid tokens return before Auth.js is called. A staged preflight preserves
that order while moving token, user, and session-conflict decisions to the owning domain. The route
still owns the Auth.js interaction and merely translates the discriminated domain result.

**Alternatives considered**: Reading the session before token validation was rejected because it
changes the current call sequence and invalid-link cost. Comparing user IDs directly in the route
was rejected because it leaves a domain rule at the transport boundary. Passing an Auth.js callback
into the service was rejected because it inverts ownership and hides a transport integration inside
domain logic. A generic shared verifier was rejected by the feature's non-goals.

## Decision 3: Keep Auth.js as the authoritative mutation boundary

**Decision**: Keep `runWithSignupActivation` and
`runWithAccountDeletionVerification` in their routes around the existing delegated Auth.js
callbacks. Pass the exact `{ identifier, token: tokenHash }` authorization produced by the eligible
domain candidate. Do not modify the hardened Auth.js adapter's purpose checks, advisory locks,
transaction boundaries, token consumption, signup activation, policy-acceptance creation, or
session creation.

**Rationale**: The request-local authorization context prevents direct use of internal providers,
while the adapter revalidates mutable state under the normalized-email advisory lock before it
consumes a token. Auth.js remains the only component that constructs the database session and
cookie. A read-only preflight is intentionally advisory; the locked adapter transaction remains the
race-safe authority.

**Alternatives considered**: Moving token consumption or account activation into the new preflight
was rejected because it would split the existing atomic callback and duplicate Auth.js session
behavior. Constructing session cookies in the route or service was rejected as security-sensitive
duplication. Adding locks to the read-only preflight was rejected because the adapter must revalidate
under its existing transaction regardless.

## Decision 4: Move signup post-callback reconciliation into the signup service

**Decision**: Add a signup service operation that receives the eligible candidate's `tokenHash` and
`userId`, performs the same parallel token and user reads used today, and returns
`session_failed` only when the token is gone and the user is active; every other outcome is
`invalid_link`. The signup route invokes it only after the delegated Auth.js response is absent or
fails the exact redirect validation. Account-deletion verification retains its current direct
`invalid_link` fallback and adds no analogous persistence read.

**Rationale**: This removes the final direct persistence access from the signup route while
preserving its unique recovery distinction for durable activation followed by failed session
establishment. Keeping the two reads parallel and outside a new transaction matches current
semantics.

**Alternatives considered**: Mapping every callback failure to `invalid_link` was rejected because
it removes the existing signup recovery state. Moving the post-check into the Auth.js adapter was
rejected because redirect translation is not an adapter responsibility. Adding a deletion
post-check was rejected because it would introduce behavior that does not exist today.

## Decision 5: Convert accepted-response helpers into timing-only services

**Decision**: Rename `acceptedLoginResponse` and `acceptedSignupResponse` to timing-oriented
functions such as `waitForAcceptedLogin` and `waitForAcceptedSignup`. Preserve the existing 500 ms
floor, inclusive 0-100 ms jitter, injected clock/random/sleep test seams, and repeated remaining-time
loop exactly, but return `Promise<void>`. After awaiting the helper, the owning login or signup route
returns `Response.json({ status: "accepted" })`.

**Rationale**: The anti-enumeration delay is domain/security behavior, while HTTP response
construction belongs to the route. Splitting them changes neither elapsed-time behavior nor the
public accepted payload.

**Alternatives considered**: Duplicating the delay in routes was rejected because it would create
two timing implementations. Returning a plain accepted payload from the service was considered but
rejected as unnecessary because the payload is a fixed transport contract. Changing constants or
the loop was rejected because timing is explicitly invariant.

## Decision 6: Split data-export public and server-internal contracts

**Decision**: Create `src/modules/account/data-export/internal-types.ts` with `import "server-only"`.
Move `PersonalDataModuleDeclaration`, `PersonalDataExportReadContext`,
`PersonalDataContribution`, `PersonalDataExportContributor`, and `PersonalDataExportRegistry` into
that file. It imports `Prisma.TransactionClient` and the safe `JsonValue` and classification types
it needs. Keep envelope, serialization, command, authorization, request, verification, generation,
and sanitized-outcome contracts in the existing client-safe `types.ts`. Update the registry,
contributors, service, fixtures, and tests to import server-internal contracts from the new module.

**Rationale**: Only the contributor execution boundary requires a Prisma transaction client. The
client panel already consumes only serializable public contracts, so the split removes persistence
coupling without changing its API or creating a new abstraction.

**Alternatives considered**: Leaving a type-only Prisma import in the public file was rejected
because it violates the declared boundary and can contaminate client module graphs. Replacing the
transaction client with a hand-written repository interface was rejected as an unnecessary DAO.
Moving every export type server-side was rejected because UI and route contracts must remain
client-safe and shared.

## Decision 7: Enforce boundaries with an existing-tool Vitest source scan

**Decision**: Add `tests/unit/architecture-boundaries.test.ts` using the existing Node/Vitest
`readdir` and `readFile` pattern from `tests/unit/email-architecture.test.ts`. The test reports
workspace-relative violating paths and enforces four rules:

1. Files under `src/app/api/**/route.ts` cannot reference `@/lib/db` or
   `@/generated/prisma`, except exactly `src/app/api/health/route.ts`.
2. Domain service files (`src/modules/**/service.ts` and `src/modules/**/services/**`) cannot
   construct `Response` or `NextResponse` objects.
3. Public `src/modules/**/types.ts` files cannot import the database client or generated Prisma
   contracts.
4. Files with a `"use client"` directive cannot import domain services, the database client,
   generated Prisma contracts, or `server-only` modules.

The test runs automatically in the existing Vitest unit project and CI coverage job. No package or
CI workflow step is added.

**Rationale**: The repository already uses source-scanning Vitest tests for architectural rules.
This is the smallest enforceable solution, supports the exact health allowlist, produces focused
failures, and adds no runtime or development dependency.

**Alternatives considered**: Core ESLint `no-restricted-imports` was rejected because path-sensitive
rules plus one precise exception become awkward across file scopes. Adding an import-boundary ESLint
plugin or dependency-graph package was rejected because it adds a dependency and configuration
surface. A TypeScript compiler-API analyzer was rejected as disproportionate for four stable import
and construction rules.

## Decision 8: Separate domain and route test responsibilities

**Decision**: Extend signup and account-deletion service tests with the complete domain matrix:
unknown token, wrong purpose, unconfirmed delivery, expiry at the boundary, missing or wrong-status
user, same/no session eligibility, conflicting session, and signup post-callback session failure.
Refactor route tests to mock domain operations instead of `@/lib/db` and verify canonical origin,
malformed transport input, Auth.js session lookup ordering, domain-result translation, exact
callback construction, fixed redirect validation, cookie passthrough, exception fallback, and no
delegation on invalid/conflicting results. Keep timing-loop assertions in service tests and assert
the fixed accepted JSON in route tests. Run existing real-PostgreSQL signup and deletion integration
suites and the email response-time suite unchanged as regression evidence.

**Rationale**: This makes business rules independently testable without weakening route contract
coverage. Real database and provider tests continue to prove the adapter transaction, locks,
session creation, token consumption, and 500 ms timing floor that mocks cannot establish.

**Alternatives considered**: Keeping database mocks in route tests was rejected because it
recreates the architecture violation in tests and couples transport tests to persistence details.
Unit-only verification was rejected for critical authentication flows. Adding new browser behavior
was rejected because no user journey changes; the existing production-artifact E2E suite remains
the end-to-end regression gate.

## Decision 9: Preserve logging and failure disclosure exactly

**Decision**: Add no new runtime logging to signup activation or account-deletion verification, which
currently emit none. Preserve existing request logs in signup/login submission routes and existing
adapter/service logs without adding token, account, session, email, or internal-error data. All new
service outcomes remain internal and map to the same generic public states.

**Rationale**: The specification requires logging behavior and non-enumeration to remain unchanged.
New events in sensitive callbacks would be an operational behavior change and could create a privacy
risk without a stated monitoring need.

**Alternatives considered**: Copying the data-export verification logger pattern into these routes
was rejected because data export has an existing audit contract that signup/deletion verification
do not. Logging raw discriminants or identifiers was rejected as unnecessary sensitive metadata.

## Decision 10: Make no persistence, deployment, or dependency change

**Decision**: Do not modify `prisma/schema.prisma`, migrations, generated Prisma output, environment
configuration, Docker files, deployment workflows, healthchecks, routes, or dependencies. Existing
read and callback query cardinality remains bounded to one token, one user, and one session per
request. Recovery is an application-code rollback of the cohesive refactor; no data restoration or
schema action is involved.

**Rationale**: Every required change is an ownership and test-boundary change over existing data and
runtime behavior. Avoiding operational churn satisfies the feature scope and keeps Raspberry Pi and
VPS characteristics identical.

**Alternatives considered**: Introducing repositories, DAOs, a new schema relation, a cache, or a
worker was rejected by the non-goals and offers no benefit for these bounded synchronous reads.
Changing the health endpoint was rejected because its direct database access is the explicit
infrastructure exception.

## Decision 11: Use installed framework documentation before implementation

**Decision**: The implementation phase must read the relevant route-handler guide under the
installed Next.js 16.3.2 package after `pnpm install --frozen-lockfile`. The dependency tree is not
currently installed, so Phase 0 used the repository's mirrored
`skills/next-best-practices/route-handlers.md` guidance, which confirms that route handlers own
`Response` construction and redirects. No new or changed Next.js API is required by this plan.

**Rationale**: Repository policy makes installed Next.js documentation authoritative because this
version may differ from prior framework knowledge. Recording the installation prerequisite resolves
the current documentation availability without guessing an API.

**Alternatives considered**: Relying on general framework memory was rejected by repository policy.
Installing dependencies solely to draft architecture already evidenced by current code was rejected
as unnecessary; installation is already the first quickstart and implementation step.
