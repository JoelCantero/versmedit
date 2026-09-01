import "server-only";

import { Prisma, UserStatus, VerificationPurpose } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import type { LoginLocale } from "@/modules/login/types";

const ACCEPTED_FLOOR_MS = 500;
const ACCEPTED_JITTER_MS = 100;

export const LOGIN_CODE_ATTEMPT_BUDGET = 5;

interface WaitForAcceptedLoginOptions {
  startedAt: number;
  now?: () => number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function findExistingLoginEmail(normalizedEmail: string) {
  const user = await db.user.findFirst({
    where: {
      normalizedEmail: normalizedEmail.trim().toLowerCase(),
      status: UserStatus.ACTIVE,
    },
    select: { email: true },
  });
  return user?.email ?? null;
}

export function getLoginCallbackPath(locale: LoginLocale) {
  return locale === "en" ? "/" : `/${locale}`;
}

export function getLoginErrorPath(locale: LoginLocale) {
  return locale === "en" ? "/login/error" : `/${locale}/login/error`;
}

export async function waitForAcceptedLogin({
  startedAt,
  now = Date.now,
  random = Math.random,
  sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: WaitForAcceptedLoginOptions): Promise<void> {
  const jitter = Math.floor(random() * (ACCEPTED_JITTER_MS + 1));
  const targetAt = startedAt + ACCEPTED_FLOOR_MS + jitter;
  let remaining = targetAt - now();
  while (remaining > 0) {
    await sleep(remaining);
    remaining = targetAt - now();
  }
}

export async function findLoginChallengeCodeHash(normalizedEmail: string) {
  const challenge = await db.verificationToken.findFirst({
    where: {
      identifier: normalizedEmail,
      purpose: VerificationPurpose.LOGIN,
      expires: { gt: new Date() },
      loginCodeHash: { not: null },
    },
    select: { loginCodeHash: true },
  });
  return challenge?.loginCodeHash ?? null;
}

// Charges one guess against the challenge and discards it once the budget is
// spent, so a wrong code can never be retried indefinitely.
export async function registerFailedLoginCodeAttempt(normalizedEmail: string) {
  await db.$transaction(async (transaction) => {
    const [updated] = await transaction.$queryRaw<
      Array<{ loginCodeAttempts: number }>
    >(Prisma.sql`
      UPDATE "VerificationToken"
      SET "loginCodeAttempts" = "loginCodeAttempts" + 1
      WHERE "identifier" = ${normalizedEmail}
        AND "purpose" = ${VerificationPurpose.LOGIN}::"VerificationPurpose"
        AND "loginCodeHash" IS NOT NULL
      RETURNING "loginCodeAttempts"
    `);
    if (!updated || updated.loginCodeAttempts < LOGIN_CODE_ATTEMPT_BUDGET) {
      return;
    }
    await transaction.$executeRaw(Prisma.sql`
      DELETE FROM "VerificationToken"
      WHERE "identifier" = ${normalizedEmail}
        AND "purpose" = ${VerificationPurpose.LOGIN}::"VerificationPurpose"
    `);
  });
}