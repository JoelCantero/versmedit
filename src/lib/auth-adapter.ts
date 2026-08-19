import "server-only";

import type { Adapter } from "next-auth/adapters";

import {
  Prisma,
  UserStatus,
  VerificationPurpose,
} from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { publishVerificationToken } from "@/modules/login/verification-context";
import { getSignupActivationAuthorization } from "@/modules/signup/verification-context";

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

  const getUserByEmail = (async (email: string) =>
    db.user.findFirst({
      where: {
        normalizedEmail: email.trim().toLowerCase(),
        status: UserStatus.ACTIVE,
      },
    })) as Adapter["getUserByEmail"];

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
        where: {
          identifier: token.identifier,
          purpose: VerificationPurpose.LOGIN,
        },
      });
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "VerificationToken" ("identifier", "token", "expires", "purpose")
        VALUES (${token.identifier}, ${token.token}, ${token.expires}, ${VerificationPurpose.LOGIN}::"VerificationPurpose")
      `);
    });
    publishVerificationToken({
      identifier: token.identifier,
      token: token.token,
    });
    return token;
  }) as Adapter["createVerificationToken"];

  const useVerificationToken = (async ({ identifier, token }) => {
    const authorization = getSignupActivationAuthorization();
    if (
      authorization?.identifier === identifier &&
      authorization.token === token
    ) {
      return db.$transaction(async (transaction) => {
        await transaction.$executeRaw(Prisma.sql`
          SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))
        `);
        const storedToken = await transaction.verificationToken.findUnique({
          where: { token },
        });
        if (
          !storedToken ||
          storedToken.identifier !== identifier ||
          storedToken.token !== token ||
          storedToken.purpose !== VerificationPurpose.SIGNUP ||
          storedToken.expires.getTime() <= Date.now() ||
          !storedToken.proposedName ||
          !storedToken.locale ||
          !storedToken.termsVersion ||
          !storedToken.privacyVersion ||
          !storedToken.acceptedAt
        ) {
          return null;
        }

        const user = await transaction.user.findUnique({
          where: { normalizedEmail: identifier },
          select: { id: true, status: true },
        });
        if (!user || user.status !== UserStatus.PENDING) return null;

        const consumed = await transaction.verificationToken.deleteMany({
          where: {
            identifier,
            token,
            purpose: VerificationPurpose.SIGNUP,
          },
        });
        if (consumed.count !== 1) return null;

        await transaction.user.update({
          where: { id: user.id },
          data: {
            name: storedToken.proposedName,
            status: UserStatus.ACTIVE,
            emailVerified: new Date(),
          },
        });
        await transaction.policyAcceptance.create({
          data: {
            userId: user.id,
            termsVersion: storedToken.termsVersion,
            privacyVersion: storedToken.privacyVersion,
            acceptedAt: storedToken.acceptedAt,
          },
        });
        await transaction.verificationToken.deleteMany({
          where: {
            identifier,
            purpose: VerificationPurpose.SIGNUP,
          },
        });

        return {
          identifier: storedToken.identifier,
          token: storedToken.token,
          expires: storedToken.expires,
        };
      });
    }

    const [consumed] = await db.$queryRaw<
      Array<{ identifier: string; token: string; expires: Date }>
    >(Prisma.sql`
      DELETE FROM "VerificationToken"
      WHERE "identifier" = ${identifier}
        AND "token" = ${token}
        AND "purpose" = ${VerificationPurpose.LOGIN}::"VerificationPurpose"
      RETURNING "identifier", "token", "expires"
    `);
    return consumed ?? null;
  }) as Adapter["useVerificationToken"];

  return {
    ...adapter,
    createUser,
    createVerificationToken,
    deleteSession,
    getUserByEmail,
    useVerificationToken,
  };
}