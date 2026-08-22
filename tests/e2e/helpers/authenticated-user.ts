import { createHash } from "node:crypto";
import type { BrowserContext } from "@playwright/test";

import { Pool } from "pg";

export interface SeededAuthSession {
  id: string;
  sessionToken: string;
  expires: Date;
  createdAt: Date | null;
  authenticatedAt: Date | null;
}

export interface SeededAuthUser {
  userId: string;
  email: string;
  normalizedEmail: string;
  name: string | null;
  image: string | null;
  sessionId: string;
  sessionToken: string;
  sessions: SeededAuthSession[];
  sessionIds: string[];
  sessionTokens: string[];
  addressBucketKey?: string;
  clientBucketKeys?: string[];
  securityClientBucketKeys?: string[];
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

function getFixtureClientAddress(sessionToken: string) {
  const groups = createHash("sha256")
    .update(sessionToken)
    .digest("hex")
    .slice(0, 24)
    .match(/.{4}/gu)!;
  return `2001:db8:${groups.join(":")}`;
}

export async function seedAuthenticatedUser(overrides?: {
  email?: string;
  name?: string | null;
  image?: string | null;
  createdAt?: Date | null;
  authenticatedAt?: Date | null;
  accountCount?: number;
  additionalSessionCount?: number;
  clientBucketKeys?: string[];
  securityClientBucketKeys?: string[];
  rateLimitCount?: number;
  withDeletionGraph?: boolean;
  withSecurityFixtures?: boolean;
}) {
  const additionalSessionCount = overrides?.additionalSessionCount ?? 0;
  if (
    !Number.isInteger(additionalSessionCount) ||
    additionalSessionCount < 0 ||
    additionalSessionCount > 20
  ) {
    throw new RangeError("additionalSessionCount must be between 0 and 20");
  }

  const pool = getPool();
  const userId = `user_${crypto.randomUUID()}`;
  const email = overrides?.email ?? `playwright-${crypto.randomUUID()}@example.test`;
  const normalizedEmail = email.trim().toLowerCase();
  const name = overrides?.name ?? "Playwright User";
  const image = overrides?.image ?? null;
  const seededAt = new Date();
  const createdAt =
    overrides?.createdAt === undefined ? seededAt : overrides.createdAt;
  const authenticatedAt =
    overrides?.authenticatedAt === undefined
      ? seededAt
      : overrides.authenticatedAt;
  const sessions = Array.from(
    { length: additionalSessionCount + 1 },
    (_, index): SeededAuthSession => ({
      id: `session_${crypto.randomUUID()}`,
      sessionToken: crypto.randomUUID(),
      expires: new Date(seededAt.getTime() + 24 * 60 * 60_000),
      createdAt:
        createdAt === null
          ? null
          : new Date(createdAt.getTime() - index * 60_000),
      authenticatedAt,
    }),
  );
  const [currentSession] = sessions;
  const sessionId = currentSession!.id;
  const sessionToken = currentSession!.sessionToken;
  const sessionIds = sessions.map((session) => session.id);
  const sessionTokens = sessions.map((session) => session.sessionToken);
  const addressBucketKey = `auth:email:address:${createHash("sha256")
    .update(normalizedEmail)
    .digest("hex")}`;
  const clientBucketKeys =
    overrides?.clientBucketKeys ??
    [
      `account:deletion:reauth:client:${crypto.randomUUID()}`,
      `account:deletion:final:client:${crypto.randomUUID()}`,
    ];
  const securityClientBucketKeys =
    overrides?.securityClientBucketKeys ??
    [`account:security:reauth:client:${crypto.randomUUID()}`];

  try {
    await pool.query(
      `INSERT INTO "User" ("id", "email", "normalizedEmail", "status", "name", "image", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'ACTIVE', $4, $5, NOW(), NOW())`,
      [userId, email, normalizedEmail, name, image],
    );
    for (const session of sessions) {
      await pool.query(
        `INSERT INTO "Session" ("id", "sessionToken", "userId", "expires", "createdAt", "authenticatedAt") VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          session.id,
          session.sessionToken,
          userId,
          toDatabaseTimestamp(session.expires),
          toDatabaseTimestamp(session.createdAt),
          toDatabaseTimestamp(session.authenticatedAt),
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
    }
    if (overrides?.withSecurityFixtures) {
      await pool.query(
        `INSERT INTO "VerificationToken" ("identifier", "token", "expires", "purpose", "locale", "deliveredAt", "createdAt") VALUES ($1, $2, NOW() + INTERVAL '10 minutes', 'ACCOUNT_SECURITY', 'en', NOW(), NOW())`,
        [normalizedEmail, crypto.randomUUID()],
      );
    }
    if (overrides?.withDeletionGraph || overrides?.withSecurityFixtures) {
      const selectedClientBucketKeys = [
        ...(overrides.withDeletionGraph ? clientBucketKeys : []),
        ...(overrides.withSecurityFixtures ? securityClientBucketKeys : []),
      ];
      await pool.query(
        `INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
         SELECT "key", $2, NOW() + INTERVAL '15 minutes', NOW()
         FROM unnest($1::text[]) AS "key"`,
        [
          [addressBucketKey, ...selectedClientBucketKeys],
          overrides.rateLimitCount ?? 1,
        ],
      );
      cleanupLimiterKeys.add(addressBucketKey);
      selectedClientBucketKeys.forEach((key) => cleanupLimiterKeys.add(key));
    }

    sessionTokens.forEach((token) => cleanupTokens.add(token));
    cleanupUsers.add(userId);
    cleanupEmails.add(normalizedEmail);
    cleanupLimiterKeys.add(addressBucketKey);

    return {
      userId,
      email,
      normalizedEmail,
      name,
      image,
      sessionId,
      sessionToken,
      sessions,
      sessionIds,
      sessionTokens,
      ...(overrides?.withDeletionGraph || overrides?.withSecurityFixtures
        ? { addressBucketKey }
        : {}),
      ...(overrides?.withDeletionGraph
        ? { addressBucketKey, clientBucketKeys }
        : {}),
      ...(overrides?.withSecurityFixtures
        ? { securityClientBucketKeys }
        : {}),
    } satisfies SeededAuthUser;
  } finally {
    await pool.end();
  }
}

export async function seedAdditionalAuthSession({
  userId,
  createdAt = new Date(),
  authenticatedAt = new Date(),
  expires = new Date(Date.now() + 24 * 60 * 60_000),
}: {
  userId: string;
  createdAt?: Date | null;
  authenticatedAt?: Date | null;
  expires?: Date;
}) {
  const session: SeededAuthSession = {
    id: `session_${crypto.randomUUID()}`,
    sessionToken: crypto.randomUUID(),
    expires,
    createdAt,
    authenticatedAt,
  };
  const pool = getPool();

  try {
    await pool.query(
      `INSERT INTO "Session" ("id", "sessionToken", "userId", "expires", "createdAt", "authenticatedAt") VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        session.id,
        session.sessionToken,
        userId,
        toDatabaseTimestamp(session.expires),
        toDatabaseTimestamp(session.createdAt),
        toDatabaseTimestamp(session.authenticatedAt),
      ],
    );
    cleanupTokens.add(session.sessionToken);
    cleanupUsers.add(userId);
    return session;
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
  const clientAddress = getFixtureClientAddress(sessionToken);
  const cookieNames = ["next-auth.session-token"];
  const secureCookieNames = ["__Secure-next-auth.session-token"];
  const allCookieNames =
    target.protocol === "https:"
      ? [...cookieNames, ...secureCookieNames]
      : cookieNames;

  await context.setExtraHTTPHeaders({ "cf-connecting-ip": clientAddress });
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
  cleanupLimiterKeys.add(`account:deletion:reauth:client:${clientAddress}`);
  cleanupLimiterKeys.add(`account:deletion:final:client:${clientAddress}`);
  cleanupLimiterKeys.add(`account:security:reauth:client:${clientAddress}`);
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