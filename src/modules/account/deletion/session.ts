import "server-only";

import { resolveActiveAccountSession } from "@/modules/account/session";

export {
  readAccountSessionToken,
  resolveActiveAccountSession,
} from "@/modules/account/session";
export type { ActiveAccountSession } from "@/modules/account/session";

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

export function expireAccountSessionCookies() {
  const attributes =
    "Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly";
  return [
    `next-auth.session-token=; ${attributes}; SameSite=Lax`,
    `__Secure-next-auth.session-token=; ${attributes}; Secure; SameSite=Lax`,
  ];
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