# Data Model: TypeScript 6 Upgrade

**Feature**: [TypeScript 6 Upgrade](spec.md)

## Domain Entities

This feature introduces, changes, and removes no domain entity. It does not alter PostgreSQL, Prisma models, migrations, stored records, user data, retention, ownership, or stateful runtime behavior.

## Configuration State Model

The migration changes repository configuration state only.

| Artifact | Baseline State | Target State | Validation Rule |
|----------|----------------|--------------|-----------------|
| Root compiler declaration | `typescript: "^5"` | `typescript: "~6.0.2"` | Manifest value matches exactly and local compiler reports 6.0.x. |
| Resolved compiler | TypeScript 5.9.3 | TypeScript 6.0.2 or a later compatible 6.0 patch | Frozen install succeeds with no TypeScript peer conflict and no 6.1+ resolution. |
| Lint stack | ESLint 9.39.4, `eslint-config-next` 16.3.2, `typescript-eslint` 8.67.0 | Unchanged | Versions, presets, rules, and severities remain unchanged; lint passes. |
| TypeScript configuration | Strict, no emit, bundler resolution, implicit global type selection, no explicit source root | Unchanged unless a reproducible full-suite diagnostic requires the narrowest correction | No suppression or type-safety relaxation; isolated TS 6 probe already passes unchanged. |
| Plan template baseline | TypeScript 5.x on Node.js 24 LTS | TypeScript 6.0.x on Node.js 24 LTS | Newly generated plans report the current compiler line; historical plans remain unchanged. |
| Application/runtime state | Existing routes, APIs, data, containers, networks, secrets, logs, and healthchecks | Unchanged | Full acceptance, production build, E2E, and image checks report no regression. |

## State Transition

1. **Baseline captured**: Record Node.js, pnpm, TypeScript, lint, and typecheck results before dependency edits.
2. **Dependency declared**: Change only the root compiler range to `~6.0.2` with pinned pnpm.
3. **Graph resolved**: Regenerate peer snapshots and perform a frozen reinstall.
4. **Configuration evaluated**: Run the upgraded compiler on the current configuration before considering any `tsconfig` or source edit.
5. **Compatibility proven**: Complete generation, lint, typecheck, audit, compliance, coverage, build, E2E, email-catalog, and Docker target checks.
6. **Ready to merge**: Accept only when the final diff contains the intended compiler migration, active template update, and any diagnostic-specific minimal corrections.
7. **Recovery path**: If a gate fails without an in-scope correction, revert the dependency declaration, lockfile, and migration-specific edits as one unit and reinstall the prior frozen graph.

## Validation Invariants

- The resolved root compiler remains within `>=6.0.2 <6.1.0`.
- No lint package, preset, rule, severity, or checked path changes.
- No `ignoreDeprecations`, `ignoreBuildErrors`, strictness reduction, or weaker library checking is introduced.
- No explicit global type list or source root is added without a reproducible failure showing it is necessary.
- No application behavior, database schema, public interface, deployment topology, or secret contract changes.
- No unrelated direct or transitive dependency update appears in the final diff.

## Migrations and Persistence

No database migration, compatibility window, backup, restore, or data correction is required. The only migration is the repository's build-time compiler state, and its recovery unit is the manifest plus lockfile plus compiler-specific corrections.

## Interface Contracts

No external interface is affected. The feature is purely internal to build and validation tooling, so `contracts/` is intentionally not generated.