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
import { sendAccountDeletionEmail } from "@/modules/account/deletion/email";
import {
  resolveAccountDeletionSession,
  resolveActiveAccountSession,
} from "@/modules/account/deletion/session";
import {
  createAccountDeletionCredential,
  hashAccountDeletionToken,
} from "@/modules/account/deletion/token";
import type {
  AccountDeletionReauthenticationResult,
} from "@/modules/account/deletion/types";
import type { AccountLocale } from "@/modules/account/types";

interface IssueAccountDeletionReauthenticationOptions {
  sessionToken: string;
  locale: AccountLocale;
  origin: string;
  now?: () => Date;
}

const RATE_LIMIT_WINDOW_MS = 15 * 60_000;

interface DeleteCurrentAccountOptions {
  sessionToken: string;
  now?: () => Date;
}

interface AccountDeletionVerificationPreflightOptions {
  now?: () => Date;
}

export type AccountDeletionVerificationCandidate = {
  userId: string;
  identifier: string;
  tokenHash: string;
  locale: AccountLocale;
};

export type AccountDeletionVerificationPreflightResult =
  | { status: "invalid_link"; locale: AccountLocale }
  | {
      status: "eligible_candidate";
      candidate: AccountDeletionVerificationCandidate;
    };

export type AccountDeletionVerificationSessionResult =
  | { status: "eligible"; candidate: AccountDeletionVerificationCandidate }
  | { status: "session_conflict"; locale: AccountLocale };

export type AccountDeletionServiceResult =
  | { status: "completed" }
  | { status: "concurrent_completed" }
  | { status: "reauthentication_required" }
  | { status: "unauthenticated" }
  | { status: "deletion_failed" };

function isAccountLocale(value: unknown): value is AccountLocale {
  return value === "en" || value === "es" || value === "ca";
}

export async function preflightAccountDeletionVerification(
  rawToken: string,
  { now = () => new Date() }: AccountDeletionVerificationPreflightOptions = {},
): Promise<AccountDeletionVerificationPreflightResult> {
  const tokenHash = hashAccountDeletionToken(rawToken, getEnv().AUTH_SECRET);
  const storedToken = await db.verificationToken.findUnique({
    where: { token: tokenHash },
  });
  const locale: AccountLocale = isAccountLocale(storedToken?.locale)
    ? storedToken.locale
    : "en";
  if (
    !storedToken ||
    storedToken.purpose !== VerificationPurpose.ACCOUNT_DELETION ||
    !storedToken.deliveredAt ||
    storedToken.expires.getTime() <= now().getTime()
  ) {
    return { status: "invalid_link", locale };
  }

  const targetUser = await db.user.findUnique({
    where: { normalizedEmail: storedToken.identifier },
    select: { id: true, status: true },
  });
  if (!targetUser || targetUser.status !== UserStatus.ACTIVE) {
    return { status: "invalid_link", locale };
  }

  return {
    status: "eligible_candidate",
    candidate: {
      userId: targetUser.id,
      identifier: storedToken.identifier,
      tokenHash,
      locale,
    },
  };
}

export function evaluateAccountDeletionVerificationSession(
  candidate: AccountDeletionVerificationCandidate,
  currentUserId: string | null,
): AccountDeletionVerificationSessionResult {
  if (currentUserId && currentUserId !== candidate.userId) {
    return { status: "session_conflict", locale: candidate.locale };
  }
  return { status: "eligible", candidate };
}

async function compensateProvisionalToken(identifier: string, token: string) {
  await db.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))
    `);
    await transaction.verificationToken.deleteMany({
      where: {
        identifier,
        token,
        purpose: VerificationPurpose.ACCOUNT_DELETION,
      },
    });
  });
}

export async function issueAccountDeletionReauthentication({
  sessionToken,
  locale,
  origin,
  now = () => new Date(),
}: IssueAccountDeletionReauthenticationOptions): Promise<AccountDeletionReauthenticationResult> {
  const activeSession = await resolveActiveAccountSession(sessionToken, now());
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

  const env = getEnv();
  const issuedAt = now();
  const credential = createAccountDeletionCredential({
    secret: env.AUTH_SECRET,
    issuedAt,
  });

  try {
    const created = await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${activeSession.normalizedEmail}, 0))
      `);
      const currentSession = await transaction.session.findUnique({
        where: { sessionToken },
        select: {
          expires: true,
          user: {
            select: {
              email: true,
              normalizedEmail: true,
              status: true,
            },
          },
        },
      });
      if (
        !currentSession ||
        currentSession.expires.getTime() <= issuedAt.getTime() ||
        currentSession.user.status !== UserStatus.ACTIVE ||
        currentSession.user.normalizedEmail !== activeSession.normalizedEmail
      ) {
        return false;
      }

      await transaction.verificationToken.deleteMany({
        where: {
          identifier: activeSession.normalizedEmail,
          purpose: VerificationPurpose.ACCOUNT_DELETION,
        },
      });
      await transaction.verificationToken.create({
        data: {
          identifier: activeSession.normalizedEmail,
          token: credential.persisted.token,
          expires: credential.persisted.expires,
          purpose: VerificationPurpose.ACCOUNT_DELETION,
          locale,
          deliveredAt: null,
          createdAt: issuedAt,
        },
      });
      return true;
    });
    if (!created) return { status: "unauthenticated" };

    const delivery = await sendAccountDeletionEmail({
      recipient: activeSession.email,
      rawToken: credential.raw,
      locale,
      origin: new URL(origin).origin,
    });
    if (!delivery.accepted) throw new Error("provider rejected deletion email");

    const confirmed = await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${activeSession.normalizedEmail}, 0))
      `);
      return transaction.verificationToken.updateMany({
        where: {
          identifier: activeSession.normalizedEmail,
          token: credential.persisted.token,
          purpose: VerificationPurpose.ACCOUNT_DELETION,
          deliveredAt: null,
        },
        data: { deliveredAt: now() },
      });
    });
    if (confirmed.count === 1) return { status: "sent" };
  } catch {
    // The exact provisional credential is compensated below.
  }

  try {
    await compensateProvisionalToken(
      activeSession.normalizedEmail,
      credential.persisted.token,
    );
  } catch {
    // It may already have been consumed or superseded.
  }
  return { status: "unavailable" };
}

export async function deleteCurrentAccount({
  sessionToken,
  now = () => new Date(),
}: DeleteCurrentAccountOptions): Promise<AccountDeletionServiceResult> {
  const authorizedAt = now();
  const preflight = await resolveAccountDeletionSession(sessionToken, authorizedAt);
  if (preflight.status === "unauthenticated") {
    return { status: "unauthenticated" };
  }
  if (preflight.status === "stale") {
    return { status: "reauthentication_required" };
  }

  try {
    return await db.$transaction(async (transaction) => {
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${preflight.normalizedEmail}, 0))
      `);
      await transaction.$executeRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(hashtextextended(${preflight.userId}, 0))
      `);

      const currentSession = await transaction.session.findUnique({
        where: { sessionToken },
        select: {
          userId: true,
          expires: true,
          authenticatedAt: true,
          user: {
            select: {
              id: true,
              normalizedEmail: true,
              status: true,
            },
          },
        },
      });
      if (!currentSession) {
        const userStillExists = await transaction.user.findUnique({
          where: { id: preflight.userId },
          select: { id: true },
        });
        return userStillExists
          ? { status: "unauthenticated" as const }
          : { status: "concurrent_completed" as const };
      }

      const checkedAt = now();
      const authenticatedAt = currentSession.authenticatedAt?.getTime();
      if (
        currentSession.userId !== preflight.userId ||
        currentSession.user.id !== preflight.userId ||
        currentSession.user.normalizedEmail !== preflight.normalizedEmail ||
        currentSession.user.status !== UserStatus.ACTIVE ||
        currentSession.expires.getTime() <= checkedAt.getTime()
      ) {
        return { status: "unauthenticated" as const };
      }
      if (
        authenticatedAt === undefined ||
        authenticatedAt > checkedAt.getTime() ||
        authenticatedAt < checkedAt.getTime() - 10 * 60_000
      ) {
        return { status: "reauthentication_required" as const };
      }

      await transaction.policyAcceptance.deleteMany({
        where: { userId: preflight.userId },
      });
      await transaction.verificationToken.deleteMany({
        where: { identifier: preflight.normalizedEmail },
      });
      await transaction.rateLimitBucket.deleteMany({
        where: {
          key: getAuthEmailAddressRateLimitKey(preflight.normalizedEmail),
        },
      });
      const deleted = await transaction.user.deleteMany({
        where: {
          id: preflight.userId,
          normalizedEmail: preflight.normalizedEmail,
          status: UserStatus.ACTIVE,
        },
      });
      if (deleted.count !== 1) throw new Error("account deletion postcondition failed");
      return { status: "completed" as const };
    });
  } catch {
    return { status: "deletion_failed" };
  }
}