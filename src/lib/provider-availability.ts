import "server-only";

import { db } from "@/lib/db";

const PROVIDER_UNAVAILABLE_KEY = "auth:email:provider:unavailable";
const PROVIDER_COOLDOWN_MS = 60_000;

type DeliveryFailure = {
  status: "rejected" | "unknown";
  category:
    | "recipient"
    | "smtp_5xx"
    | "smtp_4xx"
    | "timeout"
    | "connection"
    | "partial"
    | "unclassified";
};

export function isProviderWideFailure(outcome: DeliveryFailure) {
  return outcome.category !== "recipient";
}

export async function markProviderUnavailable(now = new Date()) {
  const resetAt = new Date(now.getTime() + PROVIDER_COOLDOWN_MS);
  await db.rateLimitBucket.upsert({
    where: { key: PROVIDER_UNAVAILABLE_KEY },
    create: { key: PROVIDER_UNAVAILABLE_KEY, count: 1, resetAt },
    update: { count: 1, resetAt },
  });
}

export async function getProviderAvailability(now = new Date()) {
  const marker = await db.rateLimitBucket.findUnique({
    where: { key: PROVIDER_UNAVAILABLE_KEY },
    select: { resetAt: true },
  });
  if (!marker || marker.resetAt.getTime() <= now.getTime()) {
    return { available: true as const, retryAfterSeconds: 0 };
  }

  return {
    available: false as const,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((marker.resetAt.getTime() - now.getTime()) / 1_000),
    ),
  };
}