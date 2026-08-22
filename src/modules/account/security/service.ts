import "server-only";

import {
  Prisma,
  UserStatus,
  VerificationPurpose,
} from "@/generated/prisma/client";

import { getAuthEmailAddressRateLimitKey } from "@/lib/auth-email-rate-limit";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { consumeSharedRateLimit } from "@/lib/shared-rate-limit";
import {
  isRecentlyAuthenticated,
  resolveActiveAccountSession,
} from "@/modules/account/session";
import { sendAccountSecurityEmail } from "@/modules/account/security/email";
import {
  createAccountSecurityCredential,
  hashAccountSecurityToken,
} from "@/modules/account/security/token";
import type {
  AccountSecurityReauthenticationResult,
  AccountSecurityRevocationResult,
  AccountSecurityVerificationResult,
  SessionListItem,
} from "@/modules/account/security/types";
import type { AccountLocale } from "@/modules/account/types";

const ACTIVE_SESSION_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 15 * 60_000;

interface AccountSecuritySessionOptions {
  sessionToken: string;
  now?: () => Date;
}

interface RevokeAccountSessionOptions extends AccountSecuritySessionOptions {
  sessionId: string;
}

interface IssueAccountSecurityReauthenticationOptions
  extends AccountSecuritySessionOptions {
  locale: AccountLocale;
  origin: string;
}

interface VerifyAccountSecurityReauthenticationOptions {
  rawToken: string;
  sessionToken: string | null;
  now?: () => Date;
}

interface LockedCurrentSession {
  id: string;
  userId: string;
}

interface SessionProjectionRow {
  sessionId: string;
  createdAt: Date | null;
  expires: Date;
  current: boolean;
}

function getCredentialLocale(locale: string | null): AccountLocale | null {
  return locale === "en" || locale === "es" || locale === "ca"
    ? locale
    : null;
}

async function compensateProvisionalCredential(
  identifier: string,
  userId: string,
  token: string,
) {
  await db.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))
    `);
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))
    `);
    await transaction.verificationToken.deleteMany({
      where: {
        identifier,
        token,
        purpose: VerificationPurpose.ACCOUNT_SECURITY,
      },
    });
  });
}

export async function issueAccountSecurityReauthentication({
  sessionToken,
  locale,
  origin,
  now = () => new Date(),
}: IssueAccountSecurityReauthenticationOptions): Promise<AccountSecurityReauthenticationResult> {
  const checkedAt = now();
  const activeSession = await resolveActiveAccountSession(
    sessionToken,
    checkedAt,
  );
  if (!activeSession) return { status: "unauthenticated" };

  const addressLimit = await consumeSharedRateLimit({
    key: getAuthEmailAddressRateLimitKey(activeSession.normalizedEmail),
    limit: 3,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!addressLimit.allowed) {
    return {
      status: "rate_limited",
      retryAfter: addressLimit.retryAfterSeconds,
    };
  }

  const credential = createAccountSecurityCredential({
    secret: getEnv().AUTH_SECRET,
    issuedAt: checkedAt,
  });

  try {
    const recipient = await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${activeSession.normalizedEmail}, 0))
      `);
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${activeSession.userId}, 0))
      `);

      const currentSession = await transaction.session.findUnique({
        where: { sessionToken },
        select: {
          id: true,
          userId: true,
          expires: true,
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
        !currentSession ||
        currentSession.id !== activeSession.sessionId ||
        currentSession.userId !== activeSession.userId ||
        currentSession.user.id !== activeSession.userId ||
        currentSession.user.normalizedEmail !== activeSession.normalizedEmail ||
        currentSession.user.status !== UserStatus.ACTIVE ||
        currentSession.expires.getTime() <= checkedAt.getTime()
      ) {
        return null;
      }

      await transaction.verificationToken.deleteMany({
        where: {
          identifier: activeSession.normalizedEmail,
          purpose: VerificationPurpose.ACCOUNT_SECURITY,
        },
      });
      await transaction.verificationToken.create({
        data: {
          identifier: activeSession.normalizedEmail,
          token: credential.persisted.token,
          expires: credential.persisted.expires,
          purpose: VerificationPurpose.ACCOUNT_SECURITY,
          locale,
          deliveredAt: null,
          createdAt: checkedAt,
        },
      });

      return currentSession.user.email;
    });
    if (!recipient) return { status: "unauthenticated" };

    const delivery = await sendAccountSecurityEmail({
      recipient,
      rawToken: credential.raw,
      locale,
      origin: new URL(origin).origin,
    });
    if (!delivery.accepted) throw new Error("provider rejected security email");

    const confirmed = await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${activeSession.normalizedEmail}, 0))
      `);
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${activeSession.userId}, 0))
      `);
      return transaction.verificationToken.updateMany({
        where: {
          identifier: activeSession.normalizedEmail,
          token: credential.persisted.token,
          purpose: VerificationPurpose.ACCOUNT_SECURITY,
          deliveredAt: null,
        },
        data: { deliveredAt: checkedAt },
      });
    });
    if (confirmed.count === 1) return { status: "sent" };
  } catch {
    // The exact provisional credential is compensated below.
  }

  try {
    await compensateProvisionalCredential(
      activeSession.normalizedEmail,
      activeSession.userId,
      credential.persisted.token,
    );
  } catch {
    // It may already have been consumed or superseded.
  }
  return { status: "unavailable" };
}

export async function verifyAccountSecurityReauthentication({
  rawToken,
  sessionToken,
  now = () => new Date(),
}: VerifyAccountSecurityReauthenticationOptions): Promise<AccountSecurityVerificationResult> {
  const checkedAt = now();
  const token = hashAccountSecurityToken(rawToken, getEnv().AUTH_SECRET);
  const preflight = await db.verificationToken.findUnique({
    where: { token },
    select: { identifier: true, purpose: true, locale: true },
  });
  if (!preflight || preflight.purpose !== VerificationPurpose.ACCOUNT_SECURITY) {
    return { status: "invalid_link", locale: "en" };
  }
  const preflightLocale = getCredentialLocale(preflight.locale) ?? "en";

  try {
    return await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${preflight.identifier}, 0))
      `);
      const storedToken = await transaction.verificationToken.findUnique({
        where: { token },
      });
      const locale = getCredentialLocale(storedToken?.locale ?? null);
      if (
        !storedToken ||
        storedToken.identifier !== preflight.identifier ||
        storedToken.purpose !== VerificationPurpose.ACCOUNT_SECURITY ||
        storedToken.expires.getTime() <= checkedAt.getTime() ||
        !storedToken.deliveredAt ||
        !locale
      ) {
        return { status: "invalid_link" as const, locale: preflightLocale };
      }

      const owner = await transaction.user.findUnique({
        where: { normalizedEmail: storedToken.identifier },
        select: { id: true, status: true },
      });
      if (!owner || owner.status !== UserStatus.ACTIVE) {
        return { status: "invalid_link" as const, locale };
      }
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${owner.id}, 0))
      `);

      if (!sessionToken) {
        return { status: "invalid_link" as const, locale };
      }
      const currentSession = await transaction.session.findUnique({
        where: { sessionToken },
        select: {
          id: true,
          userId: true,
          expires: true,
          user: { select: { id: true, status: true } },
        },
      });
      if (
        !currentSession ||
        currentSession.expires.getTime() <= checkedAt.getTime() ||
        currentSession.user.status !== UserStatus.ACTIVE
      ) {
        return { status: "invalid_link" as const, locale };
      }
      if (
        currentSession.userId !== owner.id ||
        currentSession.user.id !== owner.id
      ) {
        return { status: "session_conflict" as const, locale };
      }

      const consumed = await transaction.verificationToken.deleteMany({
        where: {
          identifier: storedToken.identifier,
          token,
          purpose: VerificationPurpose.ACCOUNT_SECURITY,
        },
      });
      if (consumed.count !== 1) {
        return { status: "invalid_link" as const, locale };
      }
      const refreshed = await transaction.session.updateMany({
        where: {
          id: currentSession.id,
          sessionToken,
          userId: owner.id,
          expires: { gt: checkedAt },
        },
        data: { authenticatedAt: checkedAt },
      });
      if (refreshed.count !== 1) {
        throw new Error("security session refresh postcondition failed");
      }

      return { status: "reauthenticated" as const, locale };
    });
  } catch {
    return { status: "invalid_link", locale: preflightLocale };
  }
}

export async function listActiveAccountSessions({
  sessionToken,
  now = () => new Date(),
}: AccountSecuritySessionOptions): Promise<SessionListItem[] | null> {
  const checkedAt = now();
  const activeSession = await resolveActiveAccountSession(
    sessionToken,
    checkedAt,
  );
  if (!activeSession) return null;

  const rows = await db.$queryRaw<SessionProjectionRow[]>(Prisma.sql`
    SELECT
      session."id" AS "sessionId",
      session."createdAt",
      session."expires",
      session."id" = ${activeSession.sessionId} AS "current"
    FROM "Session" AS session
    INNER JOIN "User" AS account ON account."id" = session."userId"
    WHERE session."userId" = ${activeSession.userId}
      AND session."expires" > ${checkedAt}
      AND account."status" = 'ACTIVE'::"UserStatus"
    ORDER BY
      (session."id" = ${activeSession.sessionId}) DESC,
      session."createdAt" DESC NULLS LAST,
      session."id" DESC
    LIMIT ${ACTIVE_SESSION_LIMIT}
  `);

  if (!rows[0]?.current) return null;

  return rows.map((row, index) => ({
    sessionId: row.sessionId,
    createdAt: row.createdAt?.toISOString() ?? null,
    expires: row.expires.toISOString(),
    current: row.current,
    ordinal: index + 1,
  }));
}

export async function revokeAccountSession({
  sessionToken,
  sessionId,
  now = () => new Date(),
}: RevokeAccountSessionOptions): Promise<AccountSecurityRevocationResult> {
  return revokeWithLockedCurrentSession(
    { sessionToken, now },
    async (transaction, currentSession, checkedAt) => {
      await transaction.session.deleteMany({
        where: {
          id: sessionId,
          userId: currentSession.userId,
          expires: { gt: checkedAt },
          NOT: { id: currentSession.id },
        },
      });
    },
  );
}

export async function revokeAllOtherAccountSessions(
  options: AccountSecuritySessionOptions,
): Promise<AccountSecurityRevocationResult> {
  return revokeWithLockedCurrentSession(
    options,
    async (transaction, currentSession) => {
      await transaction.session.deleteMany({
        where: {
          userId: currentSession.userId,
          NOT: { id: currentSession.id },
        },
      });
    },
  );
}

async function revokeWithLockedCurrentSession(
  {
    sessionToken,
    now = () => new Date(),
  }: AccountSecuritySessionOptions,
  revoke: (
    transaction: Prisma.TransactionClient,
    currentSession: LockedCurrentSession,
    checkedAt: Date,
  ) => Promise<void>,
): Promise<AccountSecurityRevocationResult> {
  const checkedAt = now();

  try {
    const preflight = await resolveActiveAccountSession(sessionToken, checkedAt);
    if (!preflight) return { status: "unauthenticated" };

    return await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${preflight.userId}, 0))
      `);

      const currentSession = await transaction.session.findUnique({
        where: { sessionToken },
        select: {
          id: true,
          userId: true,
          expires: true,
          authenticatedAt: true,
          user: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (
        !currentSession ||
        currentSession.id !== preflight.sessionId ||
        currentSession.userId !== preflight.userId ||
        currentSession.user.id !== preflight.userId ||
        currentSession.user.status !== UserStatus.ACTIVE ||
        currentSession.expires.getTime() <= checkedAt.getTime()
      ) {
        return { status: "unauthenticated" as const };
      }
      if (!isRecentlyAuthenticated(currentSession.authenticatedAt, checkedAt)) {
        return { status: "reauthentication_required" as const };
      }

      await revoke(transaction, currentSession, checkedAt);

      return { status: "completed" as const };
    });
  } catch {
    return { status: "revocation_failed" };
  }
}