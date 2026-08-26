# Feature Specification: TypeScript 6 Upgrade

**Feature Branch**: `20260826-typescript-6-upgrade`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "GitHub issue #49 - Upgrade TypeScript 5.9.3 to 6.0.x while preserving the existing ESLint safeguards"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upgrade Without Weakening Quality Safeguards (Priority: P1)

As a project maintainer, I can adopt the TypeScript 6.0 compiler line while retaining the project's strict type checking and complete lint policy so that the codebase benefits from the newer diagnostics without lowering existing quality guarantees.

**Why this priority**: The migration has no value if it compiles only by hiding diagnostics, weakening strictness, or reducing lint coverage. A compatible compiler and unchanged safeguards are the minimum viable outcome.

**Independent Test**: Install the declared dependencies from the lockfile, confirm the active local compiler is in the approved 6.0.x line, and run lint and type checking. Both checks pass with the same rule coverage and type-safety settings used before the migration.

**Acceptance Scenarios**:

1. **Given** the project currently resolves TypeScript 5.9.3, **When** dependencies are updated and installed from the regenerated lockfile, **Then** the root project resolves TypeScript 6.0.x through the `~6.0.2` range with no TypeScript-related peer dependency conflict.
2. **Given** the TypeScript 6.0.x compiler is active, **When** the complete type check runs, **Then** it passes without ignored deprecations, reduced strictness, weaker library checks, or other type-safety relaxations.
3. **Given** the existing ESLint stack and presets, **When** lint runs after the compiler upgrade, **Then** it passes without changing linter products, disabling rules, reducing severities, or removing either existing Next.js preset.

---

### User Story 2 - Prove the Application Still Builds and Behaves the Same (Priority: P2)

As a release maintainer, I can run the full project validation matrix and both deployable image builds so that I know the compiler migration introduced no application behavior regression or release incompatibility.

**Why this priority**: Type checking alone cannot establish compatibility across generated database code, tests, production builds, audits, compliance checks, browser journeys, and deployment artifacts.

**Independent Test**: Run every required project check and build both CI image targets from a clean dependency installation. Each check and build completes successfully, and the final change review finds no unrelated dependency movement or product behavior change.

**Acceptance Scenarios**:

1. **Given** a clean installation using the updated lockfile, **When** database generation, lint, type checking, production dependency audit, compliance validation, coverage tests, production build, and end-to-end tests run, **Then** every required check passes.
2. **Given** the same source revision, **When** the `runner` and `migrator` deployment image targets are built as CI builds them, **Then** both targets complete successfully.
3. **Given** all checks are green, **When** a maintainer reviews the final change set, **Then** it contains no unrelated transitive upgrades, application features, broad refactors, lint-policy changes, or historical specification rewrites.

---

### User Story 3 - Leave an Explicit Migration Record (Priority: P3)

As a future maintainer, I can see why global type selection was retained or changed and can start new implementation plans from the current compiler baseline so that later TypeScript migrations do not repeat unresolved investigation.

**Why this priority**: Recording the compatibility decision and current baseline reduces uncertainty for the eventual TypeScript 7 migration while keeping this change narrowly scoped.

**Independent Test**: Review the migration evidence and planning template. The global type-selection decision cites full-suite validation, future plans identify TypeScript 6.0.x, and historical plans remain unchanged.

**Acceptance Scenarios**:

1. **Given** TypeScript 6 changes global type discovery, **When** the project is validated, **Then** the pull request records whether explicit Node global types were required and the evidence supporting that decision.
2. **Given** explicit Node global types are unnecessary, **When** the final configuration is reviewed, **Then** no restrictive global type list was added speculatively.
3. **Given** a future implementation plan is created from the active template, **When** its toolchain baseline is reviewed, **Then** it identifies TypeScript 6.0.x while plans already stored under `specs/**` remain untouched.

### Edge Cases

- TypeScript 6 reports new diagnostics involving generic inference, side-effect imports, or platform type definitions; each diagnostic is resolved with the smallest typed change that preserves runtime behavior.
- A broad major-version range could resolve TypeScript 6.1 or later, outside the current supported range of the lint parser; the dependency remains constrained to the compatible 6.0 patch line.
- Regenerating the lockfile proposes unrelated transitive dependency updates; those updates are excluded from this feature.
- Restricting global types removes globals required by application code, tests, configuration, or scripts; the decision is based on the full validation matrix rather than one successful check.
- The project succeeds locally but either deployment image target fails; the migration is incomplete until both CI-equivalent targets build.
- A new diagnostic tempts a broad refactor or behavior change; only the minimum correction required for compiler compatibility is in scope.

### Verification Strategy

- Record the pre-change compiler version plus baseline lint and type-check results before changing dependencies.
- Verify a frozen clean installation, the resolved local compiler version, database code generation, lint, type checking, production dependency audit, Spec Kit compliance, coverage tests, production build, and end-to-end tests.
- Build the `runner` and `migrator` image targets using the same inputs and target definitions used by CI.
- Compare the dependency and lockfile changes against the baseline to confirm that only the intended compiler migration and unavoidable resolution changes are present.
- Review any source or configuration correction against a before-and-after behavior test and confirm that no product behavior changed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The project MUST declare TypeScript with the `~6.0.2` development dependency range and MUST resolve a root compiler in the 6.0.x line.
- **FR-002**: The dependency lockfile MUST be regenerated with the package-manager version fixed by the project and MUST contain no unrelated dependency updates.
- **FR-003**: A frozen dependency installation MUST complete without a TypeScript-related peer dependency conflict.
- **FR-004**: The project-local compiler version check MUST report TypeScript 6.0.x after installation.
- **FR-005**: ESLint 9.39.4, `eslint-config-next` 16.3.2, and `typescript-eslint` 8.67.0 MUST remain installed and configured with the existing `core-web-vitals` and TypeScript presets.
- **FR-006**: Lint MUST pass without replacing the linter, removing a preset, disabling a rule, reducing a severity, or excluding previously checked project code.
- **FR-007**: Type checking MUST pass without `ignoreDeprecations`, reduced strictness, weaker library checking, or any other relaxation of existing type guarantees.
- **FR-008**: Every new TypeScript 6 diagnostic MUST be resolved through a minimal, explicitly typed correction that preserves observable application behavior.
- **FR-009**: The migration record MUST state whether an explicit Node global type selection is required and MUST cite validation across application code, tests, configuration, and scripts; it MUST be added only when that validation requires it.
- **FR-010**: The migration MUST retain the current multi-area no-output project shape, keep iterable browser-library types, avoid adding a source root, and avoid permanently enabling diagnostic-only stable type ordering.
- **FR-011**: Database code generation, lint, type checking, production dependency audit, Spec Kit compliance, coverage tests, production build, and end-to-end tests MUST all pass after the migration.
- **FR-012**: The `runner` and `migrator` deployment image targets MUST both build successfully through the CI-equivalent workflow.
- **FR-013**: The active implementation-plan template MUST identify TypeScript 6.0.x as the current toolchain baseline.
- **FR-014**: Existing plans and other historical artifacts under `specs/**` MUST NOT be rewritten to reflect the new compiler version.
- **FR-015**: Pre-change evidence MUST capture the compiler version plus lint and type-check outcomes so reviewers can compare the migration against a known baseline.
- **FR-016**: The final change set MUST contain no application feature change, unrelated refactor, lint-policy change, unrelated dependency upgrade, or toolchain migration beyond TypeScript 6.0.x.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the required validation checks pass after the migration: frozen installation, compiler-version verification, database generation, lint, type checking, production dependency audit, compliance validation, coverage tests, production build, and end-to-end tests.
- **SC-002**: The clean installation resolves one approved root TypeScript 6.0.x compiler and reports zero TypeScript-related peer dependency conflicts.
- **SC-003**: The migration introduces zero disabled lint rules, reduced lint severities, removed lint presets, type-safety relaxations, or hidden deprecation diagnostics.
- **SC-004**: Both required deployment image targets build successfully, and the existing automated acceptance suite reports zero application behavior regressions attributable to the migration.
- **SC-005**: Final dependency review identifies zero unrelated direct or transitive upgrades and final source review identifies zero unrelated refactors.
- **SC-006**: 100% of plans created from the updated active template identify TypeScript 6.0.x, while zero pre-existing files under `specs/**` are modified solely to change their historical compiler reference.

## Assumptions

- GitHub issue #49 is the authoritative source for migration scope, validation, risks, and exclusions.
- The current lint versions and peer compatibility on the feature branch remain valid when implementation begins: ESLint 9.39.4, `eslint-config-next` 16.3.2, and `typescript-eslint` 8.67.0 with TypeScript support below 6.1.0. The issue's 16.3.1 reference predates the baseline dependency update.
- The project's fixed package-manager version and existing validation commands remain authoritative; changing either is outside this feature.
- The current strict, no-output, bundler-oriented type-checking configuration is already modern and should change only when TypeScript 6 validation proves a compatibility need.
- Omitting an explicit global type list is preferred unless full validation proves that Node globals must be selected explicitly.
- The migration changes development and build-time validation only; it requires no user data change, database schema migration, new runtime service, or user-facing behavior change.

## Non-Goals *(mandatory)*

- Adopting TypeScript 7, a native TypeScript compiler, package aliases, or multiple compiler versions.
- Replacing ESLint with another linter or changing lint rules, presets, severities, or type-aware lint strategy.
- Updating Next.js, React, Prisma, Node.js, pnpm, or any unrelated direct or transitive dependency.
- Changing the JavaScript output target, adding a source root, removing iterable browser-library types, or broadly cleaning up the type-checking configuration.
- Permanently enabling stable type ordering or hiding incompatibilities with ignored deprecations.
- Refactoring application code beyond the smallest changes required to resolve new TypeScript 6 diagnostics.
- Rewriting historical plans or specifications to use the new compiler name.

## Security & Privacy Implications *(mandatory)*

- **Authentication/Authorization**: Authentication, authorization, permissions, and access checks are unchanged; this feature adds no user action or privileged operation.
- **Account lifecycle**: Registration, sign-in, account creation, and account deletion behavior remain outside scope and unchanged.
- **Authentication provider verification**: No authentication provider or trust boundary is added or modified.
- **Data sensitivity**: The migration processes no new personal, regulated, or secret data. Dependency manifests and validation output MUST continue to exclude credentials and environment secrets.
- **Input validation**: No user input surface is added. Existing server-side validation behavior MUST remain unchanged and is covered by the existing test suite.
- **Log hygiene**: No new runtime logs are required. Build and validation output MUST NOT expose secrets or private environment values.
- **Public exposure**: No endpoint, route, port, or public capability is added or changed.
- **Supply-chain integrity**: The production dependency audit MUST remain green, the lockfile change MUST be reviewed, and unrelated dependency movement MUST be rejected.

## Threats & Abuse Cases *(mandatory for public endpoints or privileged actions)*

- **Abuse scenarios**: A compromised or incorrectly resolved compiler package could execute during installation or builds; unreviewed lockfile churn could introduce unrelated packages; validation output could accidentally expose local environment values.
- **Controls**: Constrain the compiler to the reviewed 6.0 patch line, use the project-pinned package manager, require a frozen reinstall, inspect every manifest and lockfile hunk, retain the production dependency audit and supply-chain policy checks, and never print local environment or secret values.
- **Residual risk**: A previously unknown compromise in an approved upstream package could remain undetected until ecosystem or audit data is updated. The migration adds no runtime dependency or public surface, so frozen resolution, code review, automated audits, and reproducible builds provide proportionate controls.

## Operational Impact *(include if the feature changes deployment, data, or infrastructure)*

- **Deployment changes**: No runtime container, environment variable, secret, network, volume, or service topology changes. Existing deployment images must continue to build from the upgraded compiler toolchain.
- **Data & migrations**: No schema, stored data, migration, backup, or restore change is required. Database code generation remains a compatibility check only.
- **Recovery**: If validation or deployment builds fail, revert the compiler declaration, lockfile, and migration-specific corrections together, restore the prior reproducible dependency state, and rerun the baseline checks.
- **Observability**: No new healthcheck, metric, event, or runtime log is required because application behavior and runtime topology do not change. Existing health and end-to-end checks remain the release evidence.