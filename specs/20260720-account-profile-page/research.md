# Phase 0 Research: Account Profile Page

## Decision 1: Use a React Server Action as the profile mutation boundary

**Decision**: Submit the profile form to an account-domain Server Action. The action validates the route locale, resolves the Auth.js server session, strictly parses the payload, and delegates one allowlisted name update to the account service.

**Rationale**: The application already combines UI and backend behavior in one Next.js App Router container. A Server Action keeps authorization next to the mutation, uses framework origin checks for cross-site submission protection, integrates with React pending/action state, and avoids a public API that the feature does not need.

**Alternatives considered**:

- Localized route handler: workable, but creates a separate HTTP API and additional client fetch/state code with no external consumer.
- Client-side session plus API identity: rejected because client identity cannot be authoritative.
- Direct Prisma access from the component: rejected because it mixes rendering, authorization, validation, and persistence.

## Decision 2: Resolve identity from Auth.js at every read and update

**Decision**: Protected page rendering and the update action call `getServerSession(authOptions)`. The server-derived session identity selects the current user; no user ID, email, ownership value, or authorization flag appears in the form contract.

**Rationale**: This satisfies the authorization boundary and handles stale sessions at mutation time rather than relying on page-load state. A missing or invalid session redirects to the active locale's login page with a validated account callback path before any database update.

**Alternatives considered**:

- Hidden user ID or email fields: rejected because they are forgeable and unnecessary.
- Trusting a previously rendered user object: rejected because the session may expire before submission.
- Middleware-only authorization: rejected because middleware cannot replace authorization at the mutation point.

## Decision 3: Strictly validate exactly one name field with shared Zod rules

**Decision**: Create a shared required profile-name schema that trims surrounding whitespace, requires 1–80 characters, and accepts Unicode letters, spaces, straight/typographic apostrophes, and hyphens. A client form adapter serializes every successful form-control entry as an ordered tuple list and passes that list to the Server Action. The server requires exactly one tuple whose key is `name` and whose value is a string; duplicate or extra fields reject the entire request. Next.js action transport metadata never enters the domain payload.

**Rationale**: One schema prevents client/server and future registration/profile drift. Strict ordered-entry parsing closes mass-assignment paths and gives forged-field tests one deterministic outcome. Unicode property escapes support English, Spanish, Catalan, and other legitimate names without an ASCII-only restriction.

**Alternatives considered**:

- Prisma update with the submitted object: rejected as mass assignment.
- Silently stripping unknown fields: rejected by clarification; unexpected fields must reject the request.
- ASCII-only regular expression: rejected because it excludes valid localized names.
- Collapsing internal whitespace: rejected because the specification only normalizes surrounding whitespace.

## Decision 4: Preserve form values and focus with React action state

**Decision**: Use React action state with a client adapter for serializable success, validation-error, and persistence-error results. The adapter forwards all actual form-control entries to the Server Action as data rather than binding the server function directly as the HTML form action. Render the attempted normalized-or-raw name from returned state after failures. Disable the submit action while pending, focus the name input after validation failures, retain submit-button focus after persistence failures, and announce field and form results through associated live regions.

**Rationale**: This matches the specified recovery behavior, prevents duplicate client submissions, supports progressive form semantics, and keeps keyboard focus deterministic.

**Alternatives considered**:

- Uncontrolled form plus page refresh: rejected because failed values and focus would be lost.
- Toast-only feedback: rejected because field association and reliable announcement would be weaker.
- Moving focus to a generic alert for every failure: rejected by clarification.

## Decision 5: Reuse the existing User model with a one-field Prisma update

**Decision**: Read `name`, `email`, and `image` from the existing User record and update via `db.user.update({ where: <server-derived identity>, data: { name } })`. Do not add schema fields, records, or migrations.

**Rationale**: The existing model already contains every required field. An explicit `data: { name }` allowlist guarantees email and image immutability. Repeated identical updates are idempotent, and concurrent valid updates naturally serialize as last accepted write wins.

**Alternatives considered**:

- Profile table or audit record: rejected because it adds records and migrations outside scope.
- Optimistic-lock version column: rejected because clarification selected last-write-wins and schema changes are prohibited.
- Upsert: rejected because profile updates must never create an account.

## Decision 6: Validate localized callback destinations at the server page boundary

**Decision**: Protected account pages redirect to `/login` in the active locale with the matching account path as callback. The login page accepts a callback query only after validating it against the supported localized account paths, then passes that trusted value to the login form. The form keeps the current Auth.js sign-in request and changes only its callback destination.

**Rationale**: The existing login form currently always returns to locale home. Server validation prevents open redirects and locale loss while preserving the existing email magic-link provider, generic anti-enumeration response, and account-creation prohibition.

**Alternatives considered**:

- Forward any callback URL: rejected because it permits open redirects.
- Always return home: rejected because it loses the requested account destination.
- Add a new authentication endpoint: rejected because existing Auth.js behavior should remain unchanged.

## Decision 7: Keep registration unchanged while publishing a reusable future invariant

**Decision**: Do not add or change a registration route or add a name field to the existing-user login form. The shared name schema defines the reusable required contract that any separately specified future registration boundary must consume; legacy users with null names remain valid and receive email-derived initials.

**Rationale**: The current application intentionally exposes existing-user magic-link sign-in only. Adding registration during this feature would violate the account-creation and magic-link non-goals. A shared required schema resolves future consistency without pretending a registration boundary currently exists.

**Alternatives considered**:

- Treat login as registration and request a name: rejected because it changes authentication behavior and could imply account creation.
- Keep separate profile and future registration validators: rejected because they can drift.
- Make profile names optional: rejected by the clarified requirement.

## Decision 8: Use existing visual primitives and a settings-page composition

**Decision**: Compose an unframed page with heading/description, a desktop navigation column, compact mobile Profile navigation, and one main form section. Reuse existing Button, Field, Label, Input, Separator, locale navigation, theme tokens, and add the shadcn Avatar primitive if absent. Do not use nested cards or placeholder sections.

**Rationale**: This matches the requested settings interaction model and the application's quiet visual language while avoiding marketing composition. Existing tokens provide light/dark behavior and shadcn semantics.

**Alternatives considered**:

- Nested cards for navigation and form: rejected by the specification and design guidance.
- Tabs for unavailable sections: rejected because empty/disabled sections are non-goals.
- Custom avatar/upload widget: rejected because upload/removal is out of scope.

## Decision 9: Verify authorization with real PostgreSQL sessions and the standalone build

**Decision**: Add unit/component tests for schemas, initials, action states, navigation, focus, and axe checks; PostgreSQL integration tests for session-derived updates, strict fields, failures, replay, and concurrency; and Playwright tests against the standalone production build. The E2E helper creates an existing user and database Session, installs the Auth.js session cookie in the browser, and cleans both afterward.

**Rationale**: Authentication and authorization are critical flows and cannot be established by UI mocks alone. The repository already provides isolated PostgreSQL, desktop/320 px Playwright projects, and standalone build startup.

**Alternatives considered**:

- Unit tests only: rejected by the constitution and feature success criteria.
- Real email delivery in every account E2E test: rejected because profile behavior can start from a real database-backed authenticated session; the separate provider-boundary tests continue to cover SMTP/magic links.
- Development-server E2E only: rejected because the production artifact is an explicit success criterion.
