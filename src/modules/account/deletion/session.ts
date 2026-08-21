import "server-only";

import { db } from "@/lib/db";

const RECENT_AUTHENTICATION_MS = 10 * 60_000;
const ACCOUNT_SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;

export type AccountDeletionSession =
  | { status: "unauthenticated" }
  | { status: "stale" }
  | {
      status: "recent";
      sessionToken: string;
      userId: string;
      email: string;
      normalizedEmail: string;
    };

export interface ActiveAccountSession {
  sessionToken: string;
  userId: string;
  email: string;
  normalizedEmail: string;
  recentlyAuthenticated: boolean;
}

export function readAccountSessionToken(cookieHeader?: string | null) {
  if (!cookieHeader) return null;

  const tokens = new Set<string>();
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (!ACCOUNT_SESSION_COOKIE_NAMES.includes(
      name as (typeof ACCOUNT_SESSION_COOKIE_NAMES)[number],
    )) {
      continue;
    }

    try {
      const token = decodeURIComponent(part.slice(separator + 1).trim());
      if (token) tokens.add(token);
    } catch {
      return null;
    }
  }

  return tokens.size === 1 ? [...tokens][0]! : null;
}

export function expireAccountSessionCookies() {
  const attributes =
    "Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly";
  return [
    `next-auth.session-token=; ${attributes}; SameSite=Lax`,
    `__Secure-next-auth.session-token=; ${attributes}; Secure; SameSite=Lax`,
  ];
}

export async function resolveActiveAccountSession(
  sessionToken: string | null,
  now = new Date(),
): Promise<ActiveAccountSession | null> {
  if (!sessionToken) return null;

  const session = await db.session.findUnique({
    where: { sessionToken },
    select: {
      sessionToken: true,
      userId: true,
      expires: true,
      authenticatedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          normalizedEmail: true,
          status: true,
        },
      },
    },
  });

  if (
    !session ||
    session.expires.getTime() <= now.getTime() ||
    session.user.status !== "ACTIVE"
  ) {
    return null;
  }

  return {
    sessionToken: session.sessionToken,
    userId: session.userId,
    email: session.user.email,
    normalizedEmail: session.user.normalizedEmail,
    recentlyAuthenticated: Boolean(
      session.authenticatedAt &&
      session.authenticatedAt.getTime() <= now.getTime() &&
      session.authenticatedAt.getTime() >= now.getTime() - RECENT_AUTHENTICATION_MS,
    ),
  };
}

export async function resolveAccountDeletionSession(
  sessionToken: string | null,
  now = new Date(),
): Promise<AccountDeletionSession> {
  const session = await resolveActiveAccountSession(sessionToken, now);
  if (!session) return { status: "unauthenticated" };
  if (!session.recentlyAuthenticated) return { status: "stale" };
  return {
    status: "recent",
    sessionToken: session.sessionToken,
    userId: session.userId,
    email: session.email,
    normalizedEmail: session.normalizedEmail,
  };
}