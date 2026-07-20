import type { Session } from "next-auth";

export function getSessionUserId(session: Session | null | undefined) {
  const candidate =
    session && typeof session === "object"
      ? (session.user as { id?: unknown } | undefined)?.id
      : undefined;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}