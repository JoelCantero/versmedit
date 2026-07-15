import "server-only";

import type { Adapter } from "next-auth/adapters";

function isPrismaRecordNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

export function hardenAdapter(adapter: Adapter): Adapter {
  const originalDeleteSession = adapter.deleteSession?.bind(adapter);

  const deleteSession = (async (sessionToken: string) => {
    if (!originalDeleteSession) return null;
    try {
      return await originalDeleteSession(sessionToken);
    } catch (error) {
      if (isPrismaRecordNotFound(error)) return null;
      throw error;
    }
  }) as Adapter["deleteSession"];

  const createUser = (async () => {
    throw new Error(
      "Authentication cannot create users; register the account through the product registration flow first",
    );
  }) as Adapter["createUser"];

  return { ...adapter, createUser, deleteSession };
}