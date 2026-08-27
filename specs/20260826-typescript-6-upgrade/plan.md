# Implementation Plan: TypeScript 6 Upgrade

**Branch**: `20260826-typescript-6-upgrade` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/20260826-typescript-6-upgrade/spec.md`

## Implementation summary

Upgrade the project-local compiler from TypeScript 5.9.3 to the compatible 6.0 patch line by declaring `~6.0.2`, regenerating the lockfile with pnpm 11.22.0, and preserving the current ESLint 9.39.4, `eslint-config-next` 16.3.2, and `typescript-eslint` 8.67.0 stack. Start from the existing `tsconfig.json`, which already passes an isolated TypeScript 6.0.2 typecheck; do not add global types, `rootDir`, suppressions, or permanent migration flags unless a later full-suite failure supplies concrete evidence. Update the active Spec Kit plan template, then prove compatibility through the complete local, CI, production-build, end-to-end, and Docker target matrix.

## Technical Context

**Language/Version**: TypeScript 6.0.x (`~6.0.2`) on Node.js 24 LTS; implementation baseline Node.js 24.16.0

**Package Manager**: pnpm 11.22.0 through Corepack, pinned by `packageManager`

**Primary Dependencies**: Next.js 16.3.2 (App Router), React 19.2.8, Prisma 7.9.1, ESLint 9.39.4, `eslint-config-next` 16.3.2, and `typescript-eslint` 8.67.0; no new runtime or development package other than replacing the compiler version

**Storage**: PostgreSQL via Prisma, unchanged; this feature has no schema or stored-data changes

**Testing**: Existing Vitest coverage suite, Playwright production-artifact and email-catalog suites, standalone production build, Prisma generation/deployment checks, lint, typecheck, production dependency audit, Spec Kit compliance, and Docker `runner`/`migrator` builds

**Target Platform**: Docker Linux images on ARM64 Raspberry Pi and amd64 VPS/CI; no runtime platform change

**Project Type**: Internal build-toolchain migration in the existing full-stack web application

**Deployment**: Existing Docker Compose topology is unchanged; only image build inputs consume the new compiler through the frozen lockfile

**CI/CD**: GitHub Actions PR gate on GitHub-hosted `ubuntu-latest` with Node.js 24 and pnpm from `package.json`; production deployment workflow remains unchanged

**Secrets**: No new configuration or secrets; validation must use existing local or CI-injected values without printing them

**Observability**: No runtime logging, metric, healthcheck, or alert change

**Migration Strategy**: Atomic toolchain migration in one pull request: update the compiler declaration and lockfile, apply only diagnostics proven by TypeScript 6, update the active plan template, and merge only after the complete gate passes. No compatibility window or data migration is required.

**Recovery Strategy**: Revert the compiler declaration, lockfile, and any migration-specific source/configuration corrections together, reinstall from the restored frozen lockfile, and rerun lint/typecheck/build. No data restore is required.

**Performance Goals**: Zero observable runtime performance change; all validation and image builds remain within their existing CI timeout budgets

**Constraints**: Keep the compiler on 6.0.x because `typescript-eslint` 8.67.0 requires TypeScript `<6.1.0`; preserve strictness, `skipLibCheck`, both Next.js lint presets, `dom.iterable`, the current no-output multi-area project, and all existing runtime/deployment behavior; do not introduce unrelated lockfile movement

**Scale/Scope**: One root compiler dependency, one lockfile, and one active Spec Kit template; `tsconfig.json`, source, tests, and configuration change only if a reproducible TypeScript 6 diagnostic requires the smallest compatible correction

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-Design Gate | Design Response | Post-Design Gate |
|-----------|-----------------|-----------------|------------------|
| I. Docker-First, Portable | PASS | Compose topology is unchanged; both multi-stage deployment targets are explicit validation gates. | PASS |
| II. Operational Boundaries | PASS | No container, process, or responsibility boundary changes. | PASS |
| III. Reverse Proxy and Isolation | PASS | No route, port, network, or public exposure changes. | PASS |
| IV. VPS Portability | PASS | The same frozen dependency graph is validated in Linux images used for ARM64 and amd64 deployment. | PASS |
| V. Secrets | PASS | No secret or environment contract changes; validation output must not expose local values. | PASS |
| VI. Persistence and Recovery | PASS | No stored data or schema changes; toolchain rollback does not require data recovery. | PASS |
| VII. Minimal Stack | PASS | One existing development dependency changes version; no service, framework, or extra tool is introduced. | PASS |
| VIII. Production Readiness | PASS | Runtime health, logs, limits, and restart behavior are unchanged; production images must still build. | PASS |
| IX. Reproducible CI/CD | PASS | Pinned pnpm, reviewed lockfile, frozen install, full CI checks, and both image targets are required. | PASS |
| X. Security by Default | PASS | No endpoint or trust boundary changes; production dependency audit remains mandatory. | PASS |
| XI. Specs Before Implementation | PASS | Date-named spec and this plan define scope, recovery, tests, data impact, and interface impact before implementation. | PASS |
| XII. Tests and Verification | PASS | Baseline evidence, isolated TS 6 probe, full automated suite, E2E, build, audit, compliance, and Docker validation are documented. | PASS |

All pre-design gates pass. Phase 1 introduces no data model, external contract, deployment topology, or constitutional exception, so all gates also pass after design.

## Project Structure

### Documentation (this feature)

```text
specs/20260826-typescript-6-upgrade/
|-- checklists/
|   `-- requirements.md  # Completed specification quality gate
|-- spec.md              # Feature requirements and acceptance criteria
|-- plan.md              # This file (/speckit-plan command output)
|-- research.md          # Phase 0 output (/speckit-plan command)
|-- data-model.md        # Phase 1 output (/speckit-plan command)
|-- quickstart.md        # Phase 1 output (/speckit-plan command)
`-- tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

`contracts/` is intentionally omitted because the migration changes no public API, CLI, event, UI, file-format, or service interface.

### Source Code (repository root)

```text
package.json                                    # Change TypeScript range to ~6.0.2
pnpm-lock.yaml                                  # Regenerate only the compiler/peer snapshots
tsconfig.json                                   # Validate unchanged; edit only for proven diagnostics
.specify/templates/overrides/plan-template.md   # Change future baseline to TypeScript 6.0.x

src/**, tests/**, *.ts, *.mts                   # Conditional: minimal fixes only if TS 6 reports errors
.github/workflows/ci.yml                        # Validation reference; no planned change
docker/Dockerfile                               # runner/migrator build reference; no planned change
```

**Structure Decision**: This is an internal toolchain migration, so application architecture and domain organization remain untouched. The deterministic implementation path is manifest plus lockfile plus the active plan template. `tsconfig.json` and code are conditional surfaces only: the isolated TypeScript 6.0.2 probe currently passes the complete project, so changing them without a later reproducible diagnostic would violate scope. CI and Docker definitions remain authoritative validation inputs rather than edit targets.

## Complexity Tracking

No constitution violations or complexity exceptions are required.