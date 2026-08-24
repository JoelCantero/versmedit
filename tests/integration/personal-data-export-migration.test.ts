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
  "prisma/migrations/20260821010000_add_account_session_management/migration.sql",
];
const exportMigration =
  "prisma/migrations/20260823000000_add_personal_data_export/migration.sql";

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
  const schema = `personal_data_export_migration_${crypto.randomUUID().replaceAll("-", "")}`;
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

async function seedExistingGraph(client: Client) {
  await client.query(`
    INSERT INTO "User"
      ("id", "email", "normalizedEmail", "status", "createdAt", "updatedAt")
    VALUES
      ('export-owner', 'owner@example.test', 'owner@example.test', 'ACTIVE', NOW(), NOW())
  `);
  await client.query(`
    INSERT INTO "Session"
      ("id", "sessionToken", "userId", "expires", "createdAt", "authenticatedAt")
    VALUES
      ('export-session', 'export-session-token', 'export-owner', NOW() + INTERVAL '1 day', NOW(), NOW())
  `);
  await client.query(`
    INSERT INTO "VerificationToken"
      ("identifier", "token", "expires", "purpose", "locale", "deliveredAt", "createdAt")
    VALUES
      ('owner@example.test', 'existing-login', NOW() + INTERVAL '15 minutes', 'LOGIN', NULL, NULL, NOW()),
      ('owner@example.test', 'existing-security', NOW() + INTERVAL '10 minutes', 'ACCOUNT_SECURITY', 'en', NOW(), NOW())
  `);
  await client.query(`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES ('existing-bucket', 2, NOW() + INTERVAL '15 minutes', NOW())
  `);
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
  "personal data export migration",
  () => {
    it("adds only the purpose, exact-Session authorization, cascade, and expiry index", async () => {
      const { client } = await createSchema();
      await applyPreFeatureMigrations(client);
      await seedExistingGraph(client);

      const before = await client.query(`
        SELECT
          (SELECT COUNT(*)::int FROM "User") AS users,
          (SELECT COUNT(*)::int FROM "Session") AS sessions,
          (SELECT COUNT(*)::int FROM "VerificationToken") AS tokens,
          (SELECT COUNT(*)::int FROM "RateLimitBucket") AS buckets
      `);
      await applyMigration(client, exportMigration);

      const enumValues = await client.query<{ enumlabel: string }>(`
        SELECT enumlabel
        FROM pg_enum
        WHERE enumtypid = '"VerificationPurpose"'::regtype
        ORDER BY enumsortorder
      `);
      expect(enumValues.rows.map(({ enumlabel }) => enumlabel)).toContain(
        "ACCOUNT_DATA_EXPORT",
      );

      const columns = await client.query<{
        column_name: string;
        is_nullable: string;
      }>(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'DataExportAuthorization'
        ORDER BY ordinal_position
      `);
      expect(columns.rows).toEqual([
        { column_name: "sessionId", is_nullable: "NO" },
        { column_name: "confirmedAt", is_nullable: "NO" },
        { column_name: "expiresAt", is_nullable: "NO" },
      ]);

      const constraint = await client.query<{
        constraint_type: string;
        delete_rule: string | null;
      }>(`
        SELECT tc.constraint_type, rc.delete_rule
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.referential_constraints rc
          ON rc.constraint_schema = tc.constraint_schema
         AND rc.constraint_name = tc.constraint_name
        WHERE tc.table_schema = current_schema()
          AND tc.table_name = 'DataExportAuthorization'
          AND tc.constraint_type IN ('FOREIGN KEY', 'PRIMARY KEY')
        ORDER BY tc.constraint_type
      `);
      expect(constraint.rows).toEqual([
        { constraint_type: "FOREIGN KEY", delete_rule: "CASCADE" },
        { constraint_type: "PRIMARY KEY", delete_rule: null },
      ]);

      const indexes = await client.query<{ indexname: string }>(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'DataExportAuthorization'
        ORDER BY indexname
      `);
      expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
        "DataExportAuthorization_expiresAt_idx",
        "DataExportAuthorization_pkey",
      ]);

      const after = await client.query(`
        SELECT
          (SELECT COUNT(*)::int FROM "User") AS users,
          (SELECT COUNT(*)::int FROM "Session") AS sessions,
          (SELECT COUNT(*)::int FROM "VerificationToken") AS tokens,
          (SELECT COUNT(*)::int FROM "RateLimitBucket") AS buckets
      `);
      expect(after.rows).toEqual(before.rows);

      await client.query(`
        INSERT INTO "DataExportAuthorization" ("sessionId", "confirmedAt", "expiresAt")
        VALUES ('export-session', NOW(), NOW() + INTERVAL '15 minutes')
      `);
      await client.query(`DELETE FROM "Session" WHERE "id" = 'export-session'`);
      const grants = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM "DataExportAuthorization"`,
      );
      expect(grants.rows).toEqual([{ count: 0 }]);
    });

    it("rolls back an injected transactional failure and retries forward safely", async () => {
      const { client, schema } = await createSchema();
      await applyPreFeatureMigrations(client);
      await seedExistingGraph(client);
      const sql = await readMigration(exportMigration);
      const transactionStart = sql.indexOf("BEGIN;");
      expect(transactionStart).toBeGreaterThan(0);
      await client.query(sql.slice(0, transactionStart));
      const failingTransaction = sql
        .slice(transactionStart)
        .replace(
          /COMMIT;\s*$/u,
          'SELECT "force_personal_data_export_migration_failure"();\nCOMMIT;',
        );

      await expect(client.query(failingTransaction)).rejects.toThrow(
        /force_personal_data_export_migration_failure/,
      );
      await client.query("ROLLBACK");

      const enumValue = await client.query<{ count: number }>(`
        SELECT COUNT(*)::int AS count
        FROM pg_enum
        WHERE enumtypid = '"VerificationPurpose"'::regtype
          AND enumlabel = 'ACCOUNT_DATA_EXPORT'
      `);
      expect(enumValue.rows).toEqual([{ count: 1 }]);
      const table = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = 'DataExportAuthorization'`,
        [schema],
      );
      expect(table.rows).toEqual([{ count: 0 }]);

      await applyMigration(client, exportMigration);
      await expect(
        client.query(`SELECT * FROM "DataExportAuthorization"`),
      ).resolves.toMatchObject({ rows: [] });
      await expect(
        client.query(`SELECT "id", "sessionToken" FROM "Session"`),
      ).resolves.toMatchObject({
        rows: [
          { id: "export-session", sessionToken: "export-session-token" },
        ],
      });
    });
  },
);