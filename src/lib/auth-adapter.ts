import "server-only";

import type { Adapter } from "next-auth/adapters";

import { Prisma } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { publishVerificationToken } from "@/modules/login/verification-context";

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

  const createVerificationToken = (async (token) => {
    await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${token.identifier}, 0))
      `);
      await transaction.verificationToken.deleteMany({
        where: { identifier: token.identifier },
      });
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "VerificationToken" ("identifier", "token", "expires")
        VALUES (${token.identifier}, ${token.token}, ${token.expires})
      `);
    });
    publishVerificationToken({
      identifier: token.identifier,
      token: token.token,
    });
    return token;
  }) as Adapter["createVerificationToken"];

  const useVerificationToken = (async ({ identifier, token }) => {
    const [consumed] = await db.$queryRaw<
      Array<{ identifier: string; token: string; expires: Date }>
    >(Prisma.sql`
      DELETE FROM "VerificationToken"
      WHERE "identifier" = ${identifier} AND "token" = ${token}
      RETURNING "identifier", "token", "expires"
    `);
    return consumed ?? null;
  }) as Adapter["useVerificationToken"];

  return {
    ...adapter,
    createUser,
    createVerificationToken,
    deleteSession,
    useVerificationToken,
  };
}