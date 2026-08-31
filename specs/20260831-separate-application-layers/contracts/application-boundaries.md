# Contract: Application Boundaries

## Dependency Direction

```text
client UI
  -> product route or Server Action
  -> domain service
  -> shared database client / generated persistence contracts

server-rendered component
  -> domain service (supported direct server-side path)
```

Transport may depend on domain results. Domain services may depend on persistence infrastructure.
The reverse directions are forbidden. The single direct route-to-database exception is the
infrastructure health endpoint.

## Responsibility Matrix

| Concern | Owner | Forbidden placement |
|---|---|---|
| Request/query/body parsing and canonical-origin validation | Route | Domain service |
| Auth.js session endpoint and callback invocation | Route | Domain service |
| Status, payload, headers, cookies, redirects, `Response` construction | Route | Domain service |
| Token hashing, persistence lookup, purpose/delivery/expiry checks | Owning domain service | Product route |
| User-state and session-conflict decisions | Owning domain service | Product route |
| Locked token consumption, signup mutation, session creation | Existing hardened Auth.js adapter | Route or new preflight |
| Signup callback failure reconciliation reads | Signup service | Route |
| Anti-enumeration duration and jitter | Login/signup service timing helper | Duplicated route logic |
| Public serializable module contracts | Client-safe `types.ts` | Prisma-dependent module |
| Export contributor transaction context | Server-only `internal-types.ts` | Client-safe `types.ts` |
| Structured request logging | Existing route boundary | New callback-domain event |

## Signup Verification Contract

The signup service exposes domain-local operations equivalent to:

```ts
type SignupActivationCandidate = {
  userId: string;
  identifier: string;
  tokenHash: string;
  locale: "en" | "es" | "ca";
};

type SignupActivationPreflightResult =
  | { status: "invalid_link"; locale: "en" | "es" | "ca" }
  | { status: "eligible_candidate"; candidate: SignupActivationCandidate };

type SignupActivationSessionResult =
  | { status: "eligible"; candidate: SignupActivationCandidate }
  | { status: "session_conflict"; locale: "en" | "es" | "ca" };

type SignupActivationFailureResult =
  | { status: "session_failed"; locale: "en" | "es" | "ca" }
  | { status: "invalid_link"; locale: "en" | "es" | "ca" };
```

Operation rules:

1. Preflight accepts a route-validated raw token and optional injected current time for deterministic
   tests. It owns secret-based hashing and persistence reads.
2. The session decision is pure and accepts only a preflight candidate plus the route-derived
   current Auth.js user ID or null.
3. Failure reconciliation accepts candidate selectors, repeats the existing two parallel reads, and
   returns no HTTP object.
4. Candidate and result types remain server-only and are never re-exported from public signup types.

## Account Deletion Verification Contract

The deletion service exposes domain-local operations equivalent to:

```ts
type AccountDeletionVerificationCandidate = {
  userId: string;
  identifier: string;
  tokenHash: string;
  locale: "en" | "es" | "ca";
};

type AccountDeletionVerificationPreflightResult =
  | { status: "invalid_link"; locale: "en" | "es" | "ca" }
  | {
      status: "eligible_candidate";
      candidate: AccountDeletionVerificationCandidate;
    };

type AccountDeletionVerificationSessionResult =
  | { status: "eligible"; candidate: AccountDeletionVerificationCandidate }
  | { status: "session_conflict"; locale: "en" | "es" | "ca" };
```

The same preflight and pure session rules apply, with `ACCOUNT_DELETION` purpose and `ACTIVE` user
status. The service neither invokes Auth.js nor creates a response. There is no new post-callback
persistence check because the existing route maps every unsuccessful delegation to `invalid_link`.

## Accepted Timing Contract

Login and signup services expose timing-only helpers equivalent to:

```ts
type AcceptedWaitOptions = {
  startedAt: number;
  now?: () => number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function waitForAcceptedLogin(options: AcceptedWaitOptions): Promise<void>;
function waitForAcceptedSignup(options: AcceptedWaitOptions): Promise<void>;
```

Both retain their existing independent implementations, constants, injected test seams, and
remaining-time loop. A shared generic timing framework is not introduced by this refactor.

## Data Export Type Boundary

`src/modules/account/data-export/types.ts` remains safe for route and client imports and contains no
reference to `@/lib/db`, `@/generated/prisma`, or `server-only` modules.

`src/modules/account/data-export/internal-types.ts` begins with `import "server-only"` and owns the
contributor registry, contribution, read-context, and module-declaration contracts. It may import
`Prisma.TransactionClient`; only server-side registry, contributors, services, fixtures, and tests
may import it. Runtime behavior and serialized export shapes remain unchanged.

## Automated Enforcement Contract

`tests/unit/architecture-boundaries.test.ts` scans TypeScript source using Node filesystem APIs and
fails with each workspace-relative path that violates a rule.

### Rule A: Product routes do not import persistence

- Scan `src/app/api/**/route.ts`.
- Reject module references to `@/lib/db` and `@/generated/prisma`.
- Allow exactly `src/app/api/health/route.ts`.
- Do not allow directory-wide or pattern-wide infrastructure exceptions.

### Rule B: Domain services do not construct transport responses

- Scan `src/modules/**/service.ts` and `src/modules/**/services/**/*.{ts,tsx}`.
- Reject `new Response`, `Response.json`, `Response.redirect`, and `NextResponse` construction.
- Report every violating relative path.

### Rule C: Public module types do not depend on persistence

- Scan `src/modules/**/types.ts`.
- Reject references to `@/lib/db` and `@/generated/prisma`.
- Persistence-aware internal types must use an explicitly server-only module.

### Rule D: Client modules do not cross server boundaries

- Identify source files whose directive prologue contains `"use client"` or `'use client'`.
- Reject imports of `@/lib/db`, `@/generated/prisma`, domain `service`/`services` modules, and
  `server-only`.
- Do not reject server-rendered pages or other server-side callers of domain services.

## Test Ownership Contract

- Service tests own token, user, locale, time, session-conflict, and post-callback domain decisions.
- Route tests mock service operations and own origin, syntax, result translation, Auth.js request
  composition, redirect allowlisting, cookie passthrough, and exception behavior.
- Adapter and integration tests remain authoritative for locks, transactions, token consumption,
  account mutation, policy acceptance, session creation, and provider behavior.
- Architecture tests assert source dependency constraints only and do not replace behavior tests.

## Explicit Exclusions

- No repository or DAO interface.
- No generic cross-domain token-verification framework.
- No change to Auth.js provider, adapter, callback, or verification-context contracts.
- No restriction on supported Server Component to domain-service calls.
- No persistence restriction on `src/app/api/health/route.ts` beyond its existing infrastructure
  purpose.
- No new package, lint plugin, CI job, runtime service, schema change, or generated client commit.
