# Phase 0 Research: Permanent Account Deletion

## Decision 1: Execute deletion synchronously in the primary application database

**Decision**: Perform final deletion in the request path as one bounded Prisma transaction. Do not
invoke the declared account-deletion worker or protected recovery schema.

**Rationale**: All active account data is in one PostgreSQL database, the spec requires an
indivisible result in under two seconds, and the protected worker models retention envelopes,
leases, backup barriers, and delayed destruction that directly conflict with immediate deletion and
no feature-created recovery copy.

**Alternatives considered**: A background deletion job was rejected because it introduces pending
state, retries, and delayed completion. The protected deletion ledger was rejected because it
retains account selectors and recovery material. A multi-request staged delete was rejected because
it can expose partial state.

## Decision 2: Store recent authentication on the exact database session

**Decision**: Add nullable `Session.authenticatedAt`; override the hardened Auth.js adapter's
`createSession` to set it for every newly authenticated database session. Read the exact session
token from trusted cookies at final mutation time and require `authenticatedAt` within 10 minutes.

**Rationale**: Recent authentication belongs to the session that will authorize deletion. A
nullable additive field makes every pre-migration session safely stale instead of falsely recent.
The current Auth.js callback does not expose the exact adapter session timestamp to application
code, so a server-only cookie-to-session lookup is required.

**Alternatives considered**: `User.emailVerified` is account-wide and not recent. A
`DeletionConfirmation` table was rejected because it exists only in stale generated artifacts, has
no canonical schema/migration history, adds persistent intent state, and is unnecessary. Backfilling
existing sessions with migration time was rejected as a privilege escalation.

## Decision 3: Use a dedicated deletion verification purpose but Auth.js session creation

**Decision**: Add `VerificationPurpose.ACCOUNT_DELETION`. An authenticated deletion endpoint derives
the account email from the current server session, creates one short-lived hashed token per address,
sends localized email through the existing provider-neutral boundary, and compensates the exact
token if delivery fails. A guarded verification route validates the token and delegates its callback
to an internal Auth.js email provider under AsyncLocalStorage authorization; Auth.js then creates the
fresh database session and cookie.

**Rationale**: Purpose isolation prevents ordinary login/signup callbacks from consuming deletion
credentials. Reusing Auth.js for final session creation preserves its cookie and adapter semantics,
while direct issuance exposes real delivery failure to the dialog and never accepts target email
from the client.

**Alternatives considered**: Reusing a normal `LOGIN` token was rejected because it cannot cleanly
separate copy, callback authorization, delivery failure, and intent. Creating session cookies in
custom code was rejected because it duplicates security-sensitive Auth.js behavior. A client-hidden
email was rejected because identity must be server-derived.

## Decision 4: Represent cross-device deletion intent without a database record

**Decision**: Persist locale on the deletion verification token and generate only an exact localized
`/account/data?intent=delete` callback. The valid link may be consumed in any browser with no
conflicting authenticated account; the route restores the dialog but never confirms deletion.

**Rationale**: Token expiry makes the intent short-lived, stored locale supports cross-device
continuation, and the fixed callback carries no account identity or authorization. A browser already
authenticated as a different user is rejected generically to avoid silently switching accounts.

**Alternatives considered**: A deletion-intent table was rejected as unnecessary persistent state.
A signed client blob was rejected because the verification token already supplies integrity and
expiry. Restricting the link to the initiating browser contradicts the accepted clarification.

## Decision 5: Keep relationship policy unchanged and delete restricted records explicitly

**Decision**: Inside the transaction, explicitly delete `PolicyAcceptance`, all
`VerificationToken` rows for the normalized email, and the exact email-address `RateLimitBucket`,
then delete `User`; existing foreign keys cascade `Account` and every `Session`.

**Rationale**: `PolicyAcceptance.onDelete: Restrict` currently protects accidental user deletion.
Explicit ordered cleanup makes this privileged path intentional without changing deletion behavior
globally. Email-keyed records have no user foreign key and therefore require exact cleanup.

**Alternatives considered**: Changing `PolicyAcceptance` to cascade was rejected because it weakens
the global guard for no benefit outside this path. Raw SQL for all deletes was rejected because
Prisma model operations are sufficient; raw SQL remains limited to transaction-scoped advisory
locks. Explicitly deleting Account/Session rows was rejected as redundant with enforced cascades.

## Decision 6: Share deterministic rate-limit key construction

**Decision**: Extract one shared helper for
`auth:email:address:${sha256(normalizedEmail)}` and use it in login, signup, deletion issuance, and
final cleanup. Use the existing shared database limiter with separate client-derived buckets for
reauthentication and final deletion at 5 requests per 15 minutes each; reauthentication also uses
the exact address bucket at 3 requests per 15 minutes. Reject before email delivery or the deletion
transaction. Delete only the exact address bucket; retain client/global buckets.

**Rationale**: The stored address key is irreversible but exactly reproducible. One helper prevents
drift between insertion and deletion, operation-specific client buckets prevent one action from
starving the other, and retaining client buckets enforces the spec's boundary around shared state.

**Alternatives considered**: Prefix scans were rejected because they could remove unrelated
buckets. One shared client bucket was rejected because repeated email requests could block a valid
final confirmation. Storing raw email or adding a user foreign key was rejected as unnecessary
schema/PII expansion. Duplicating the hash logic was rejected because it risks residual records.

## Decision 7: Coordinate token/session creation and concurrent deletion with advisory locks

**Decision**: Continue email-scoped advisory locking for verification tokens, add user-scoped
locking around Auth.js session creation, and acquire email then user locks in that order during
deletion. The transaction first validates a recent session, acquires locks, revalidates, then
deletes. If a second already-authorized request waits behind the first and finds the account gone,
it returns the same completed outcome; a request starting after revocation remains unauthenticated.

**Rationale**: This prevents a session or token from surviving a successful deletion and implements
the specified distinction between a concurrent confirmation and a later replay without a tombstone.

**Alternatives considered**: Application mutexes were rejected because they fail across instances.
Serializable isolation for every auth operation was rejected as broader and more failure-prone than
stable keyed locks. A deletion tombstone was rejected by the product requirements.

## Decision 8: Use route handlers for final mutation and reauthentication issuance

**Decision**: Expose authenticated, same-origin POST route handlers for reauthentication issuance
and final deletion, plus a GET verification callback. Validate Auth.js CSRF proof, canonical origin,
exact allowed fields, locale, and session server-side. Apply the operation-specific shared client
limit to both POST operations and the address limit to reauthentication; return generic `429` plus
`Retry-After` before expensive work. The final response expires all supported Auth.js session-cookie
names.

**Rationale**: Route handlers provide explicit status contracts, retry metadata, Set-Cookie
control, and a clean boundary for browser lost-response recovery. The existing proxy and CSRF helper
already protect analogous auth routes.

**Alternatives considered**: A Server Action was rejected because cookie expiry, provider callback,
and network-loss semantics are clearer as explicit HTTP contracts. A public GraphQL/REST service was
rejected because this is an internal same-origin application workflow.

## Decision 9: Recover a lost response using browser-only non-authoritative state

**Decision**: Before final POST, store `{ locale, expiresAt }` in `sessionStorage` for at most 10
minutes. Clear it on definitive success/error. On network loss, wait for connectivity and check the
normal session endpoint once without resubmitting deletion: an invalid former session plus valid
signal redirects to localized public success; a still-valid session clears the signal and shows a
retryable error.

**Rationale**: The signal is scoped to the initiating browsing context, contains no identity or
authorization, and distinguishes response loss from an unrelated signed-out visit without any
server tombstone.

**Alternatives considered**: `localStorage` was rejected because it persists and leaks across tabs
longer than needed. A server completion record was rejected as a tombstone. Automatic POST retry was
rejected because the spec explicitly requires recovery without resubmitting deletion.

## Decision 10: Add a thin Base UI dialog wrapper and reuse account module conventions

**Decision**: Add a shared Base UI Dialog primitive and an account-specific deletion dialog.
Initial focus is Cancel; focus is trapped and restored; Escape/close are disabled only while the
final request is pending; progress uses a polite status and errors use an assertive alert with
programmatic focus.

**Rationale**: Base UI is installed and already underpins shared primitives, but the repository has
no dialog wrapper. The account profile module already defines locale, focus, live-region, and
responsive test conventions.

**Alternatives considered**: A hand-built modal was rejected because focus management is
security/accessibility-critical. A nested card or separate confirmation page was rejected because
the specification requires a dialog and first-click safety.

## Decision 11: Verify the real provider, database, and production artifact

**Decision**: Unit-test schemas, cookie helpers, UI states, and focus; use live PostgreSQL tests for
token/session/deletion atomicity, shared limits, rollback injection, races, and sanitized logs; use
the existing HTTP provider fixture for accepted/rejected delivery; and use Playwright's standalone
build for three locales, desktop/mobile, keyboard/a11y, cross-browser contexts, cookie clearing, and
response loss. On the target ARM64 Raspberry Pi, run opt-in 10-warm-up/100-measurement cohorts for
both committed and database-injected rollback outcomes and calculate nearest-rank p95 from final
activation to visible outcome. Complete a moderated study with at least 20 target participants,
at least 5 per locale and both viewport classes, retaining only aggregate results and non-identifying
defect notes.

**Rationale**: Authentication and irreversible deletion are critical flows. Mock-only tests cannot
prove provider acceptance, foreign-key behavior, transaction rollback, real session revocation, or
production routing.

**Alternatives considered**: Unit-only coverage was rejected by the constitution. Manual-only
provider verification was rejected because the repository already has a deterministic HTTP fixture.

## Decision 12: Keep migration and operational recovery forward-only

**Decision**: Apply the additive enum/nullable-column migration before application rollout and
regenerate Prisma from `schema.prisma`. If rollout fails, fix forward or run compatible previous app
code while leaving additive schema in place. Never restore a successfully deleted account.

**Rationale**: Additive state is compatible with old code, while reverting data or schema after an
intentional deletion would violate both correctness and the product promise.

**Alternatives considered**: A down migration was rejected because deployed schema rollback is not
the repository policy. Treating stale generated Prisma output as canonical was rejected because it
has no corresponding source schema or migration history.