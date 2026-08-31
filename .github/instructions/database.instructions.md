---
description: "Use when changing Prisma schema, PostgreSQL persistence, transactions, migrations, database services, rate limits, or data lifecycle behavior. Covers Prisma 7 and forward-only migration safety."
applyTo: "prisma/**,prisma.config.ts,src/lib/db.ts,src/modules/**/service.ts,src/modules/**/services/**"
---

# Database and Persistence

- Use the installed Prisma 7 APIs and `@prisma/adapter-pg`. Import the generated client from `@/generated/prisma/client`; do not assume older Prisma engine or configuration conventions.
- Keep the datasource URL in `prisma.config.ts` and runtime configuration in `src/lib/env.ts`. Never place credentials in the schema, migration SQL, source, logs, or fixtures.
- Access the application client through `src/lib/db.ts`; do not instantiate additional `PrismaClient` objects in product code.
- Keep Prisma access in server-only infrastructure and domain services. Return domain-shaped data or explicit projections rather than leaking broad records into client code.
- Select only fields required by the caller, especially for users, sessions, tokens, policy acceptances, and exports.
- Use transactions for state transitions that must remain atomic. Preserve existing advisory locks and concurrency controls when changing signup, token, session, deletion, or export workflows.
- Treat retries, idempotency, token supersession, compensation, retention, and deletion as domain behavior defined by the applicable feature specification; do not infer safer-looking cleanup behavior.
- Change the schema in `prisma/schema.prisma`, then create a new migration with `pnpm db:migrate`. Never edit, reorder, or delete a migration that may have been applied.
- Migrations are forward-only. Recover with a corrective migration; reverting application code does not revert schema or data.
- Keep migrations compatible with rolling from the currently deployed schema where practical. For destructive or incompatible changes, require the backup/restore and deployment plan described in the constitution.
- Use `pnpm db:deploy` only to apply existing migrations, including CI and production flows.
- Cover query behavior with focused unit tests where practical and real-PostgreSQL integration tests for constraints, transactions, locking, and lifecycle behavior.