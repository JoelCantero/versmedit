import type { Session } from "next-auth";

export const RECENT_AUTHENTICATION_MS = 10 * 60_000;
export const ACCOUNT_SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;

export interface ActiveAccountSession {
  sessionId: string;
  sessionToken: string;
  userId: string;
  email: string;
  normalizedEmail: string;
  recentlyAuthenticated: boolean;
}

export function getSessionUserId(session: Session | null | undefined) {
  const candidate =
    session && typeof session === "object"
      ? (session.user as { id?: unknown } | undefined)?.id
      : undefined;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
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

export function isRecentlyAuthenticated(
  authenticatedAt: Date | null | undefined,
  now = new Date(),
) {
  if (!authenticatedAt) return false;
  const authenticationTime = authenticatedAt.getTime();
  const checkedAt = now.getTime();
  return (
    authenticationTime <= checkedAt &&
    authenticationTime >= checkedAt - RECENT_AUTHENTICATION_MS
  );
}

export async function resolveActiveAccountSession(
  sessionToken: string | null,
  now = new Date(),
): Promise<ActiveAccountSession | null> {
  if (!sessionToken) return null;

  const { db } = await import("@/lib/db");
  const session = await db.session.findUnique({
    where: { sessionToken },
    select: {
      id: true,
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
    sessionId: session.id,
    sessionToken: session.sessionToken,
    userId: session.userId,
    email: session.user.email,
    normalizedEmail: session.user.normalizedEmail,
    recentlyAuthenticated: isRecentlyAuthenticated(
      session.authenticatedAt,
      now,
    ),
  };
}