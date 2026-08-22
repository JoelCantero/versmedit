// @vitest-environment node

import "dotenv/config";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const openClients = new Set<Client>();
const schemas = new Set<string>();
const preFeatureMigrations = [
  "prisma/migrations/20260710195219_init/migration.sql",
  "prisma/migrations/20260711073537_add_authjs_models/migration.sql",
  "prisma/migrations/20260714143000_add_rate_limit_buckets/migration.sql",
  "prisma/migrations/20260818000000_add_signup_lifecycle/migration.sql",
  "prisma/migrations/20260819000000_add_signup_delivery_confirmation/migration.sql",
  "prisma/migrations/20260821000000_add_account_deletion_auth/migration.sql",
];
const accountSecurityMigration =
  "prisma/migrations/20260821010000_add_account_session_management/migration.sql";

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function readMigration(migrationPath: string) {
  return readFile(path.join(process.cwd(), migrationPath), "utf8");
}

async function applyMigration(client: Client, migrationPath: string) {
  const sql = await readMigration(migrationPath);
  const transactionStart = sql.indexOf("BEGIN;");
  if (transactionStart > 0) {
    await client.query(sql.slice(0, transactionStart));
    await client.query(sql.slice(transactionStart));
    return;
  }
  await client.query(sql);
}

async function createSchema() {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: databaseUrl });
  const schema = `account_security_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  await client.connect();
  openClients.add(client);
  schemas.add(schema);
  await client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
  await client.query(`SET search_path TO ${quoteIdentifier(schema)}`);
  return { client, schema };
}

async function applyPreFeatureMigrations(client: Client) {
  for (const migration of preFeatureMigrations) {
    await applyMigration(client, migration);
  }
}

async function insertUser(client: Client, id: string) {
  const email = `${id}@example.test`;
  await client.query(
    `INSERT INTO "User" ("id", "email", "normalizedEmail", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, $2, 'ACTIVE', NOW(), NOW())`,
    [id, email],
  );
}

async function insertSession({
  client,
  id,
  userId,
  authenticatedAt,
  expires = new Date("2099-01-01T00:00:00.000Z"),
}: {
  client: Client;
  id: string;
  userId: string;
  authenticatedAt: Date | null;
  expires?: Date;
}) {
  await client.query(
    `INSERT INTO "Session" ("id", "sessionToken", "userId", "expires", "authenticatedAt")
     VALUES ($1, $2, $3, $4, $5)`,
    [id, `${id}-token`, userId, expires, authenticatedAt],
  );
}

afterEach(async () => {
  await Promise.all(
    [...openClients].map(async (client) => {
      await client.end();
      openClients.delete(client);
    }),
  );
});

afterAll(async () => {
  if (!databaseUrl || schemas.size === 0) return;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    for (const schema of schemas) {
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    }
  } finally {
    await client.end();
  }
});

describe.skipIf(!runIntegrationTests || !databaseUrl)(
  "account session management migration",
  () => {
    it("adds the model contract and deterministically retains the newest 20 active sessions", async () => {
      const { client } = await createSchema();
      await applyPreFeatureMigrations(client);
      for (const id of ["over-cap", "at-cap", "below-cap"]) {
        await insertUser(client, id);
      }

      const equalTime = new Date("2026-08-21T10:00:00.000Z");
      for (let index = 1; index <= 22; index += 1) {
        await insertSession({
          client,
          id: `over-equal-${String(index).padStart(2, "0")}`,
          userId: "over-cap",
          authenticatedAt: equalTime,
        });
      }
      for (let index = 1; index <= 2; index += 1) {
        await insertSession({
          client,
          id: `over-null-${String(index).padStart(2, "0")}`,
          userId: "over-cap",
          authenticatedAt: null,
        });
      }
      await insertSession({
        client,
        id: "over-expired",
        userId: "over-cap",
        authenticatedAt: null,
        expires: new Date("2000-01-01T00:00:00.000Z"),
      });
      for (let index = 1; index <= 20; index += 1) {
        await insertSession({
          client,
          id: `at-cap-${String(index).padStart(2, "0")}`,
          userId: "at-cap",
          authenticatedAt: index === 1 ? null : equalTime,
        });
      }
      await insertSession({
        client,
        id: "below-known",
        userId: "below-cap",
        authenticatedAt: equalTime,
      });
      await insertSession({
        client,
        id: "below-legacy-null",
        userId: "below-cap",
        authenticatedAt: null,
      });

      await applyMigration(client, accountSecurityMigration);

      const enumValues = await client.query<{ enumlabel: string }>(`
        SELECT enumlabel
        FROM pg_enum
        WHERE enumtypid = '"VerificationPurpose"'::regtype
        ORDER BY enumsortorder
      `);
      expect(enumValues.rows.map(({ enumlabel }) => enumlabel)).toContain(
        "ACCOUNT_SECURITY",
      );

      const column = await client.query<{ is_nullable: string }>(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'Session'
          AND column_name = 'createdAt'
      `);
      expect(column.rows).toEqual([{ is_nullable: "YES" }]);

      const retained = await client.query<{ id: string }>(`
        SELECT "id"
        FROM "Session"
        WHERE "userId" = 'over-cap' AND "expires" > NOW()
        ORDER BY "id"
      `);
      expect(retained.rows.map(({ id }) => id)).toEqual(
        Array.from(
          { length: 20 },
          (_, index) => `over-equal-${String(index + 3).padStart(2, "0")}`,
        ),
      );

      const untouchedCounts = await client.query<{
        userId: string;
        count: number;
      }>(`
        SELECT "userId", COUNT(*)::int AS count
        FROM "Session"
        WHERE "userId" IN ('at-cap', 'below-cap')
        GROUP BY "userId"
        ORDER BY "userId"
      `);
      expect(untouchedCounts.rows).toEqual([
        { userId: "at-cap", count: 20 },
        { userId: "below-cap", count: 2 },
      ]);

      const backfill = await client.query<{
        id: string;
        createdAt: Date | null;
        authenticatedAt: Date | null;
      }>(`
        SELECT "id", "createdAt", "authenticatedAt"
        FROM "Session"
        WHERE "id" IN ('below-known', 'below-legacy-null', 'over-expired')
        ORDER BY "id"
      `);
      expect(backfill.rows).toEqual([
        {
          id: "below-known",
          createdAt: equalTime,
          authenticatedAt: equalTime,
        },
        {
          id: "below-legacy-null",
          createdAt: null,
          authenticatedAt: null,
        },
        {
          id: "over-expired",
          createdAt: null,
          authenticatedAt: null,
        },
      ]);

      const indexes = await client.query<{ indexdef: string }>(`
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'Session_userId_expires_idx'
      `);
      expect(indexes.rows).toHaveLength(1);
      expect(indexes.rows[0]!.indexdef).toMatch(
        /USING btree \("userId", expires\)$/u,
      );

      await expect(
        client.query(
          `INSERT INTO "VerificationToken"
            ("identifier", "token", "expires", "purpose", "locale", "deliveredAt")
           VALUES ('security@example.test', 'security-valid', NOW() + INTERVAL '10 minutes', 'ACCOUNT_SECURITY', 'ca', NOW())`,
        ),
      ).resolves.toBeDefined();
      await expect(
        client.query(
          `INSERT INTO "VerificationToken"
            ("identifier", "token", "expires", "purpose")
           VALUES ('security@example.test', 'security-invalid', NOW() + INTERVAL '10 minutes', 'ACCOUNT_SECURITY')`,
        ),
      ).rejects.toThrow(/VerificationToken_signup_snapshot_check/);
    });

    it("keeps the enum while rolling back every transactional change and retries safely", async () => {
      const { client, schema } = await createSchema();
      await applyPreFeatureMigrations(client);
      await insertUser(client, "rollback-user");
      for (let index = 1; index <= 21; index += 1) {
        await insertSession({
          client,
          id: `rollback-${String(index).padStart(2, "0")}`,
          userId: "rollback-user",
          authenticatedAt: new Date("2026-08-21T10:00:00.000Z"),
        });
      }

      const sql = await readMigration(accountSecurityMigration);
      const transactionStart = sql.indexOf("BEGIN;");
      expect(transactionStart).toBeGreaterThan(0);
      await client.query(sql.slice(0, transactionStart));
      const failingTransaction = sql
        .slice(transactionStart)
        .replace(
          /COMMIT;\s*$/u,
          'SELECT "force_account_security_migration_failure"();\nCOMMIT;',
        );

      await expect(client.query(failingTransaction)).rejects.toThrow(
        /force_account_security_migration_failure/,
      );
      await client.query("ROLLBACK");

      const enumValue = await client.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM pg_enum
        WHERE enumtypid = '"VerificationPurpose"'::regtype
          AND enumlabel = 'ACCOUNT_SECURITY'
      `);
      expect(enumValue.rows).toEqual([{ count: 1 }]);

      const rolledBackColumn = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'Session'
           AND column_name = 'createdAt'`,
        [schema],
      );
      expect(rolledBackColumn.rows).toEqual([{ count: 0 }]);
      const rolledBackIndex = await client.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND indexname = 'Session_userId_expires_idx'
      `);
      expect(rolledBackIndex.rows).toEqual([{ count: 0 }]);
      const rolledBackConstraint = await client.query<{ definition: string }>(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = '"VerificationToken"'::regclass
          AND conname = 'VerificationToken_signup_snapshot_check'
      `);
      expect(rolledBackConstraint.rows).toHaveLength(1);
      expect(rolledBackConstraint.rows[0]!.definition).not.toContain(
        "ACCOUNT_SECURITY",
      );
      const rolledBackRows = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM "Session"`,
      );
      expect(rolledBackRows.rows).toEqual([{ count: 21 }]);

      await applyMigration(client, accountSecurityMigration);
      const retriedRows = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM "Session" WHERE "expires" > NOW()`,
      );
      expect(retriedRows.rows).toEqual([{ count: 20 }]);
    });
  },
);