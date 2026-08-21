import { createHash } from "node:crypto";
import type { BrowserContext } from "@playwright/test";

import { Pool } from "pg";

interface SeededAuthUser {
  userId: string;
  email: string;
  normalizedEmail: string;
  name: string | null;
  image: string | null;
  sessionToken: string;
  sessionTokens: string[];
  addressBucketKey?: string;
  clientBucketKeys?: string[];
}

const cleanupTokens = new Set<string>();
const cleanupUsers = new Set<string>();
const cleanupEmails = new Set<string>();
const cleanupLimiterKeys = new Set<string>();

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for account profile E2E fixtures");
  }
  return new Pool({ connectionString });
}

function toDatabaseTimestamp(value: Date | null) {
  return value?.toISOString().replace("T", " ").replace("Z", "") ?? null;
}

export async function seedAuthenticatedUser(overrides?: {
  email?: string;
  name?: string | null;
  image?: string | null;
  authenticatedAt?: Date | null;
  accountCount?: number;
  additionalSessionCount?: number;
  clientBucketKeys?: string[];
  rateLimitCount?: number;
  withDeletionGraph?: boolean;
}) {
  const pool = getPool();
  const userId = `user_${crypto.randomUUID()}`;
  const sessionId = `session_${crypto.randomUUID()}`;
  const sessionToken = crypto.randomUUID();
  const email = overrides?.email ?? `playwright-${crypto.randomUUID()}@example.test`;
  const normalizedEmail = email.trim().toLowerCase();
  const name = overrides?.name ?? "Playwright User";
  const image = overrides?.image ?? null;
  const authenticatedAt =
    overrides?.authenticatedAt === undefined ? new Date() : overrides.authenticatedAt;
  const sessionTokens = [
    sessionToken,
    ...Array.from(
      { length: overrides?.additionalSessionCount ?? 0 },
      () => crypto.randomUUID(),
    ),
  ];
  const addressBucketKey = `auth:email:address:${createHash("sha256")
    .update(normalizedEmail)
    .digest("hex")}`;
  const clientBucketKeys =
    overrides?.clientBucketKeys ??
    [
      `account:deletion:reauth:client:${crypto.randomUUID()}`,
      `account:deletion:final:client:${crypto.randomUUID()}`,
    ];

  try {
    await pool.query(
      `INSERT INTO "User" ("id", "email", "normalizedEmail", "status", "name", "image", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'ACTIVE', $4, $5, NOW(), NOW())`,
      [userId, email, normalizedEmail, name, image],
    );
    for (const [index, token] of sessionTokens.entries()) {
      await pool.query(
        `INSERT INTO "Session" ("id", "sessionToken", "userId", "expires", "authenticatedAt") VALUES ($1, $2, $3, $4, $5)`,
        [
          index === 0 ? sessionId : `session_${crypto.randomUUID()}`,
          token,
          userId,
          toDatabaseTimestamp(new Date(Date.now() + 24 * 60 * 60 * 1_000)),
          toDatabaseTimestamp(authenticatedAt),
        ],
      );
    }
    if (overrides?.withDeletionGraph) {
      for (let index = 0; index < (overrides.accountCount ?? 1); index += 1) {
        await pool.query(
          `INSERT INTO "Account" ("id", "userId", "type", "provider", "providerAccountId") VALUES ($1, $2, 'oauth', 'e2e', $3)`,
          [`account_${crypto.randomUUID()}`, userId, crypto.randomUUID()],
        );
      }
      await pool.query(
        `INSERT INTO "PolicyAcceptance" ("id", "userId", "termsVersion", "privacyVersion", "acceptedAt", "createdAt") VALUES ($1, $2, '2026-08-18-draft', '2026-08-18-draft', NOW(), NOW())`,
        [`acceptance_${crypto.randomUUID()}`, userId],
      );
      await pool.query(
        `INSERT INTO "VerificationToken" ("identifier", "token", "expires", "purpose", "createdAt") VALUES ($1, $2, NOW() + INTERVAL '15 minutes', 'LOGIN', NOW())`,
        [normalizedEmail, crypto.randomUUID()],
      );
      await pool.query(
        `INSERT INTO "VerificationToken" ("identifier", "token", "expires", "purpose", "proposedName", "locale", "termsVersion", "privacyVersion", "acceptedAt", "deliveredAt", "createdAt") VALUES ($1, $2, NOW() + INTERVAL '15 minutes', 'SIGNUP', $3, 'en', '2026-08-18-draft', '2026-08-18-draft', NOW(), NOW(), NOW())`,
        [normalizedEmail, crypto.randomUUID(), name ?? "Playwright User"],
      );
      await pool.query(
        `INSERT INTO "VerificationToken" ("identifier", "token", "expires", "purpose", "locale", "deliveredAt", "createdAt") VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 'ACCOUNT_DELETION', 'en', NOW(), NOW())`,
        [normalizedEmail, crypto.randomUUID()],
      );
      await pool.query(
        `INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
         SELECT "key", $2, NOW() + INTERVAL '15 minutes', NOW()
         FROM unnest($1::text[]) AS "key"`,
        [
          [addressBucketKey, ...clientBucketKeys],
          overrides.rateLimitCount ?? 1,
        ],
      );
      cleanupLimiterKeys.add(addressBucketKey);
      clientBucketKeys.forEach((key) => cleanupLimiterKeys.add(key));
    }

    sessionTokens.forEach((token) => cleanupTokens.add(token));
    cleanupUsers.add(userId);
    cleanupEmails.add(normalizedEmail);
    cleanupLimiterKeys.add(addressBucketKey);
    cleanupLimiterKeys.add(
      "account:deletion:reauth:client:untrusted-direct-client",
    );
    cleanupLimiterKeys.add(
      "account:deletion:final:client:untrusted-direct-client",
    );

    return {
      userId,
      email,
      normalizedEmail,
      name,
      image,
      sessionToken,
      sessionTokens,
      ...(overrides?.withDeletionGraph
        ? { addressBucketKey, clientBucketKeys }
        : {}),
    } satisfies SeededAuthUser;
  } finally {
    await pool.end();
  }
}

export async function installAuthSessionCookie(
  context: BrowserContext,
  sessionToken: string,
  baseUrl: string,
) {
  const target = new URL(baseUrl);
  const cookieNames = ["next-auth.session-token"];
  const secureCookieNames = ["__Secure-next-auth.session-token"];
  const allCookieNames =
    target.protocol === "https:"
      ? [...cookieNames, ...secureCookieNames]
      : cookieNames;

  await context.addCookies(
    allCookieNames.map((name) => ({
      name,
      value: sessionToken,
      url: target.origin,
      httpOnly: true,
      secure: target.protocol === "https:" && name.startsWith("__Secure-"),
      sameSite: "Lax" as const,
    })),
  );
}

export async function cleanupAuthenticatedUsers() {
  if (
    cleanupUsers.size === 0 &&
    cleanupTokens.size === 0 &&
    cleanupEmails.size === 0 &&
    cleanupLimiterKeys.size === 0
  ) return;

  const pool = getPool();
  try {
    await pool.query(
      `DELETE FROM "PolicyAcceptance" WHERE "userId" = ANY($1::text[])`,
      [[...cleanupUsers]],
    );
    await pool.query(
      `DELETE FROM "VerificationToken" WHERE "identifier" = ANY($1::text[])`,
      [[...cleanupEmails]],
    );
    await pool.query(
      `DELETE FROM "RateLimitBucket" WHERE "key" = ANY($1::text[])`,
      [[...cleanupLimiterKeys]],
    );
    await pool.query(
      `DELETE FROM "Session" WHERE "sessionToken" = ANY($1::text[])`,
      [[...cleanupTokens]],
    );
    await pool.query(
      `DELETE FROM "User" WHERE "id" = ANY($1::text[])`,
      [[...cleanupUsers]],
    );
  } finally {
    cleanupUsers.clear();
    cleanupTokens.clear();
    cleanupEmails.clear();
    cleanupLimiterKeys.clear();
    await pool.end();
  }
}