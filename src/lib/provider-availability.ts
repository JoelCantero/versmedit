import "server-only";

import { Prisma } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import {
  executeProviderRequest,
  nativeProviderHttpClient,
} from "@/lib/email/http";
import type { ProviderHttpClient } from "@/lib/email/types";
import type { BrevoMailConfig, MailjetMailConfig } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createRequestId } from "@/lib/request-context";

const HEALTH_CACHE_MS = 60_000;
const HEALTH_LOCK_MS = 2_000;
const BREVO_HEALTH_URL = "https://api.brevo.com/v3/account";
const MAILJET_HEALTH_URL =
  "https://api.mailjet.com/v3/REST/sender?Limit=1";

type EnabledMailConfig = BrevoMailConfig | MailjetMailConfig;

interface ProviderAvailabilityOptions {
  client?: ProviderHttpClient;
  now?: () => Date;
  correlationId?: string;
}

interface HealthSnapshot {
  count: number;
  resetAt: Date;
}

function stateKey(config: EnabledMailConfig) {
  return `mail:provider-health:${config.provider}`;
}

function lockKey(config: EnabledMailConfig) {
  return `mail:provider-health-lock:${config.provider}`;
}

function snapshotResult(snapshot: HealthSnapshot, now: Date) {
  if (snapshot.count === 0) {
    return { available: true as const, retryAfterSeconds: 0 };
  }
  return {
    available: false as const,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((snapshot.resetAt.getTime() - now.getTime()) / 1_000),
    ),
  };
}

async function claimProbeLock(key: string, now: Date) {
  const expiresAt = new Date(now.getTime() + HEALTH_LOCK_MS);
  return db.$queryRaw<Array<{ key: string }>>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (${key}, 1, ${expiresAt}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = 1,
      "resetAt" = ${expiresAt},
      "updatedAt" = ${now}
    WHERE "RateLimitBucket"."resetAt" <= ${now}
    RETURNING "key"
  `);
}

function probeRequest(
  config: EnabledMailConfig,
): { logicalUrl: string; headers: Record<string, string> } {
  if (config.provider === "brevo") {
    return {
      logicalUrl: BREVO_HEALTH_URL,
      headers: {
        accept: "application/json",
        "api-key": config.apiKey,
      },
    };
  }

  return {
    logicalUrl: MAILJET_HEALTH_URL,
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`,
    },
  };
}

async function probeProvider(
  config: EnabledMailConfig,
  client: ProviderHttpClient,
) {
  const request = probeRequest(config);
  const outcome = await executeProviderRequest({
    client,
    logicalUrl: request.logicalUrl,
    init: {
      method: "GET",
      headers: request.headers,
    },
    timeoutMs: config.healthTimeoutMs,
  });
  if (outcome.kind === "network_error") {
    return {
      available: false,
      statusClass: null,
      durationMs: outcome.durationMs,
    };
  }

  const contentType = outcome.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  return {
    available:
      outcome.status >= 200 &&
      outcome.status < 300 &&
      contentType === "application/json",
    statusClass: outcome.statusClass,
    durationMs: outcome.durationMs,
  };
}

export async function getProviderAvailability(
  config: EnabledMailConfig,
  {
    client = nativeProviderHttpClient,
    now = () => new Date(),
    correlationId,
  }: ProviderAvailabilityOptions = {},
) {
  const observedAt = now();
  const healthKey = stateKey(config);
  const probeLockKey = lockKey(config);

  try {
    const snapshot = await db.rateLimitBucket.findUnique({
      where: { key: healthKey },
      select: { count: true, resetAt: true },
    });
    if (snapshot && snapshot.resetAt.getTime() > observedAt.getTime()) {
      return snapshotResult(snapshot, observedAt);
    }

    const claims = await claimProbeLock(probeLockKey, observedAt);
    if (claims.length === 0) {
      if (snapshot?.count === 0) return snapshotResult(snapshot, observedAt);
      return { available: false as const, retryAfterSeconds: HEALTH_LOCK_MS / 1_000 };
    }

    let available = false;
    try {
      const probe = await probeProvider(config, client);
      available = probe.available;
      const refreshAfter = new Date(observedAt.getTime() + HEALTH_CACHE_MS);
      await db.rateLimitBucket.upsert({
        where: { key: healthKey },
        create: {
          key: healthKey,
          count: available ? 0 : 1,
          resetAt: refreshAfter,
        },
        update: {
          count: available ? 0 : 1,
          resetAt: refreshAfter,
        },
      });
      const previousAvailable = snapshot ? snapshot.count === 0 : null;
      if (previousAvailable !== available) {
        const safeCorrelationId =
          correlationId && /^[A-Za-z0-9._:-]{1,128}$/.test(correlationId)
            ? correlationId
            : createRequestId();
        try {
          logger.info(
            {
              event: "transactional_email_provider_health_transition",
              provider: config.provider,
              previousAvailable,
              available,
              statusClass: probe.statusClass,
              durationMs: Math.max(0, probe.durationMs),
              correlationId: safeCorrelationId,
            },
            "transactional email provider health changed",
          );
        } catch {
          // Observability cannot change the health decision.
        }
      }
    } finally {
      await db.rateLimitBucket.updateMany({
        where: { key: probeLockKey },
        data: { resetAt: now() },
      }).catch(() => undefined);
    }

    return {
      available,
      retryAfterSeconds: available ? 0 : HEALTH_CACHE_MS / 1_000,
    };
  } catch {
    return { available: false as const, retryAfterSeconds: 1 };
  }
}