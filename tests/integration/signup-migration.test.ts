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
const legacyMigrations = [
  "prisma/migrations/20260710195219_init/migration.sql",
  "prisma/migrations/20260711073537_add_authjs_models/migration.sql",
  "prisma/migrations/20260714143000_add_rate_limit_buckets/migration.sql",
];
const signupMigration =
  "prisma/migrations/20260818000000_add_signup_lifecycle/migration.sql";

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function applyMigration(client: Client, migrationPath: string) {
  const sql = await readFile(path.join(process.cwd(), migrationPath), "utf8");
  await client.query(sql);
}

async function createSchema() {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString: databaseUrl });
  const schema = `signup_migration_${crypto.randomUUID().replaceAll("-", "")}`;
  await client.connect();
  openClients.add(client);
  schemas.add(schema);
  await client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
  await client.query(`SET search_path TO ${quoteIdentifier(schema)}`);
  return { client, schema };
}

async function applyLegacyMigrations(client: Client) {
  for (const migration of legacyMigrations) {
    await applyMigration(client, migration);
  }
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
  "signup lifecycle migration",
  () => {
    it("provides the forward lifecycle migration artifact", async () => {
      await expect(
        readFile(path.join(process.cwd(), signupMigration), "utf8"),
      ).resolves.toContain('ALTER TABLE "User"');
    });

    it("applies on a fresh schema with lifecycle defaults and constraints", async () => {
      const { client } = await createSchema();
      await applyLegacyMigrations(client);
      await applyMigration(client, signupMigration);

      const userColumns = await client.query<{
        column_name: string;
        is_nullable: string;
      }>(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'User'
          AND column_name IN ('normalizedEmail', 'status')
        ORDER BY column_name
      `);
      expect(userColumns.rows).toEqual([
        { column_name: "normalizedEmail", is_nullable: "NO" },
        { column_name: "status", is_nullable: "NO" },
      ]);

      const acceptanceCount = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM "PolicyAcceptance"`,
      );
      expect(acceptanceCount.rows).toEqual([{ count: 0 }]);
    });

    it("backfills legacy users and tokens without fabricating acceptance", async () => {
      const { client } = await createSchema();
      await applyLegacyMigrations(client);
      await client.query(
        `INSERT INTO "User" ("id", "email", "createdAt", "updatedAt")
         VALUES ($1, $2, NOW(), NOW())`,
        ["legacy-user", "  Legacy.Person@Example.test  "],
      );
      await client.query(
        `INSERT INTO "VerificationToken" ("identifier", "token", "expires")
         VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
        ["legacy.person@example.test", "legacy-token"],
      );

      await applyMigration(client, signupMigration);

      const users = await client.query<{
        normalizedEmail: string;
        status: string;
      }>(`SELECT "normalizedEmail", "status" FROM "User"`);
      expect(users.rows).toEqual([
        { normalizedEmail: "legacy.person@example.test", status: "ACTIVE" },
      ]);

      const tokens = await client.query<{
        purpose: string;
        proposedName: string | null;
        createdAt: Date;
      }>(
        `SELECT "purpose", "proposedName", "createdAt" FROM "VerificationToken"`,
      );
      expect(tokens.rows).toEqual([
        {
          purpose: "LOGIN",
          proposedName: null,
          createdAt: expect.any(Date),
        },
      ]);
      await expect(
        client.query(
          `INSERT INTO "VerificationToken" ("identifier", "token", "expires")
           VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
           RETURNING "purpose", "createdAt"`,
          ["another@example.test", "new-login-token"],
        ),
      ).resolves.toMatchObject({
        rows: [{ purpose: "LOGIN", createdAt: expect.any(Date) }],
      });

      const acceptanceCount = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM "PolicyAcceptance"`,
      );
      expect(acceptanceCount.rows).toEqual([{ count: 0 }]);
    });

    it("aborts before lifecycle changes when normalized legacy emails collide", async () => {
      const { client, schema } = await createSchema();
      await applyLegacyMigrations(client);
      await client.query(
        `INSERT INTO "User" ("id", "email", "createdAt", "updatedAt") VALUES
          ('collision-a', 'Collision@Example.test', NOW(), NOW()),
          ('collision-b', ' collision@example.test ', NOW(), NOW())`,
      );

      await expect(applyMigration(client, signupMigration)).rejects.toThrow(
        /normalized email collision/i,
      );
      await client.query("ROLLBACK");

      const columns = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'User'
           AND column_name = 'normalizedEmail'`,
        [schema],
      );
      expect(columns.rows).toEqual([{ count: 0 }]);
    });
  },
);