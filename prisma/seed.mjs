import "dotenv/config";

import { randomUUID } from "node:crypto";

import pg from "pg";

const { Client } = pg;

function getSeedUser() {
  const name = process.env.SEED_USER_NAME?.trim();
  const email = process.env.SEED_USER_EMAIL?.trim().toLowerCase();

  if (!name) {
    throw new Error("SEED_USER_NAME is required");
  }
  if (!email) {
    throw new Error("SEED_USER_EMAIL is required");
  }

  return { name, email };
}

function getLocalDatabaseUrl() {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Development seed can only run with NODE_ENV=development");
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const hostname = new URL(databaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("Development seed can only target a local database");
  }

  return databaseUrl;
}

async function main() {
  const seedUser = getSeedUser();
  const client = new Client({ connectionString: getLocalDatabaseUrl() });
  await client.connect();

  try {
    const result = await client.query(
      `INSERT INTO "User" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, NOW(), NOW(), NOW())
       ON CONFLICT ("email") DO UPDATE SET
         "name" = EXCLUDED."name",
         "emailVerified" = COALESCE("User"."emailVerified", EXCLUDED."emailVerified"),
         "updatedAt" = NOW()
       RETURNING "email"`,
      [randomUUID(), seedUser.name, seedUser.email],
    );

    console.log(`Development user ready: ${result.rows[0].email}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});