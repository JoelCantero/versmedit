import "server-only";

import type { Adapter } from "next-auth/adapters";

import {
  Prisma,
  UserStatus,
  VerificationPurpose,
} from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getAccountDeletionVerificationAuthorization } from "@/modules/account/deletion/verification-context";
import { generateLoginCode, hashLoginCode } from "@/modules/login/code-token";
import {
  getLoginCodeAuthorization,
  publishVerificationToken,
} from "@/modules/login/verification-context";
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

  const createSession = (async (session) =>
    db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${session.userId}, 0))
      `);
      const createdAt = new Date();
      const activeSessions = await transaction.session.findMany({
        where: {
          userId: session.userId,
          expires: { gt: createdAt },
        },
        select: { id: true },
        orderBy: [
          { createdAt: { sort: "asc", nulls: "first" } },
          { id: "asc" },
        ],
      });
      const evictionCount = Math.max(0, activeSessions.length - 19);
      if (evictionCount > 0) {
        await transaction.session.deleteMany({
          where: {
            userId: session.userId,
            id: {
              in: activeSessions
                .slice(0, evictionCount)
                .map(({ id }) => id),
            },
          },
        });
      }
      return transaction.session.create({
        data: { ...session, createdAt, authenticatedAt: createdAt },
      });
    })) as Adapter["createSession"];

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
    const normalizedIdentifier = token.identifier.trim().toLowerCase();
    const code = generateLoginCode();
    const codeHash = hashLoginCode({
      identifier: normalizedIdentifier,
      code,
      secret: getEnv().AUTH_SECRET,
    });
    await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${normalizedIdentifier}, 0))
      `);
      const user = await transaction.user.findUnique({
        where: { normalizedEmail: normalizedIdentifier },
        select: { id: true, status: true },
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new Error("Authentication account is unavailable");
      }
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))
      `);
      await transaction.verificationToken.deleteMany({
        where: {
          identifier: token.identifier,
          purpose: VerificationPurpose.LOGIN,
        },
      });
      await transaction.$executeRaw(Prisma.sql`
        INSERT INTO "VerificationToken" ("identifier", "token", "expires", "purpose", "loginCodeHash")
        VALUES (${token.identifier}, ${token.token}, ${token.expires}, ${VerificationPurpose.LOGIN}::"VerificationPurpose", ${codeHash})
      `);
    });
    publishVerificationToken({
      identifier: token.identifier,
      token: token.token,
      code,
    });
    return token;
  }) as Adapter["createVerificationToken"];

  const useVerificationToken = (async ({ identifier, token }) => {
    const loginCodeAuthorization = getLoginCodeAuthorization();
    if (
      loginCodeAuthorization?.identifier === identifier &&
      loginCodeAuthorization.token === token
    ) {
      const [consumedByCode] = await db.$queryRaw<
        Array<{ identifier: string; token: string; expires: Date }>
      >(Prisma.sql`
        DELETE FROM "VerificationToken"
        WHERE "identifier" = ${identifier}
          AND "purpose" = ${VerificationPurpose.LOGIN}::"VerificationPurpose"
          AND "loginCodeHash" = ${loginCodeAuthorization.codeHash}
          AND "expires" > NOW()
        RETURNING "identifier", "token", "expires"
      `);
      return consumedByCode ?? null;
    }

    const deletionAuthorization =
      getAccountDeletionVerificationAuthorization();
    if (
      deletionAuthorization?.identifier === identifier &&
      deletionAuthorization.token === token
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
          storedToken.purpose !== VerificationPurpose.ACCOUNT_DELETION ||
          storedToken.expires.getTime() <= Date.now() ||
          !storedToken.deliveredAt ||
          (storedToken.locale !== "en" &&
            storedToken.locale !== "es" &&
            storedToken.locale !== "ca")
        ) {
          return null;
        }

        const user = await transaction.user.findUnique({
          where: { normalizedEmail: identifier },
          select: { status: true },
        });
        if (!user || user.status !== UserStatus.ACTIVE) return null;

        const consumed = await transaction.verificationToken.deleteMany({
          where: {
            identifier,
            token,
            purpose: VerificationPurpose.ACCOUNT_DELETION,
          },
        });
        if (consumed.count !== 1) return null;

        return {
          identifier: storedToken.identifier,
          token: storedToken.token,
          expires: storedToken.expires,
        };
      });
    }

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
          !storedToken.deliveredAt ||
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
    createSession,
    createUser,
    createVerificationToken,
    deleteSession,
    getUserByEmail,
    useVerificationToken,
  };
}