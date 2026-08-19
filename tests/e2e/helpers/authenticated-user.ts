import type { BrowserContext } from "@playwright/test";

import { Pool } from "pg";

interface SeededAuthUser {
  userId: string;
  email: string;
  name: string | null;
  image: string | null;
  sessionToken: string;
}

const cleanupTokens = new Set<string>();
const cleanupUsers = new Set<string>();

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for account profile E2E fixtures");
  }
  return new Pool({ connectionString });
}

export async function seedAuthenticatedUser(overrides?: {
  email?: string;
  name?: string | null;
  image?: string | null;
}) {
  const pool = getPool();
  const userId = `user_${crypto.randomUUID()}`;
  const sessionId = `session_${crypto.randomUUID()}`;
  const sessionToken = crypto.randomUUID();
  const email = overrides?.email ?? `playwright-${crypto.randomUUID()}@example.test`;
  const name = overrides?.name ?? "Playwright User";
  const image = overrides?.image ?? null;

  try {
    await pool.query(
      `INSERT INTO "User" ("id", "email", "normalizedEmail", "status", "name", "image", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'ACTIVE', $4, $5, NOW(), NOW())`,
      [userId, email, email.trim().toLowerCase(), name, image],
    );
    await pool.query(
      `INSERT INTO "Session" ("id", "sessionToken", "userId", "expires") VALUES ($1, $2, $3, $4)`,
      [sessionId, sessionToken, userId, new Date(Date.now() + 24 * 60 * 60 * 1_000)],
    );

    cleanupTokens.add(sessionToken);
    cleanupUsers.add(userId);

    return {
      userId,
      email,
      name,
      image,
      sessionToken,
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
  const cookieNames = ["next-auth.session-token", "authjs.session-token"];
  const secureCookieNames = [
    "__Secure-next-auth.session-token",
    "__Secure-authjs.session-token",
  ];
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
  if (cleanupUsers.size === 0 && cleanupTokens.size === 0) return;

  const pool = getPool();
  try {
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
    await pool.end();
  }
}