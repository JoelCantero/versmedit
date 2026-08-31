import "server-only";

import { UserStatus } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import type { LoginLocale } from "@/modules/login/types";

const ACCEPTED_FLOOR_MS = 500;
const ACCEPTED_JITTER_MS = 100;

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