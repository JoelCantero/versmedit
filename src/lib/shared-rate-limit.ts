import "server-only";

import { Prisma } from "@/generated/prisma/client";

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface SharedRateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

interface RateLimitRow {
  count: number;
  retryAfterSeconds: number;
}

const CLEANUP_PROBABILITY = 0.01;

export async function consumeSharedRateLimit({
  key,
  limit,
  windowMs,
}: SharedRateLimitOptions): Promise<RateLimitResult> {
  if (limit < 1 || windowMs < 1) {
    throw new Error("Rate limit values must be positive integers");
  }

  const windowSeconds = windowMs / 1_000;
  const [row] = await db.$queryRaw<RateLimitRow[]>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
    VALUES (
      ${key},
      1,
      statement_timestamp() + make_interval(secs => ${windowSeconds}),
      statement_timestamp()
    )
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."resetAt" <= statement_timestamp() THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "resetAt" = CASE
        WHEN "RateLimitBucket"."resetAt" <= statement_timestamp()
          THEN statement_timestamp() + make_interval(secs => ${windowSeconds})
        ELSE "RateLimitBucket"."resetAt"
      END,
      "updatedAt" = statement_timestamp()
    RETURNING
      "count",
      GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM ("resetAt" - statement_timestamp())))::integer
      ) AS "retryAfterSeconds"
  `);

  if (!row) throw new Error("Rate limit counter did not return a result");

  if (Math.random() < CLEANUP_PROBABILITY) {
    void db.$executeRaw(Prisma.sql`
      DELETE FROM "RateLimitBucket"
      WHERE ctid IN (
        SELECT ctid FROM "RateLimitBucket"
        WHERE "resetAt" <= statement_timestamp() AND "key" <> ${key}
        LIMIT 1000
      )
    `).catch((error: unknown) => {
      logger.warn({ err: error }, "expired rate-limit bucket cleanup failed");
    });
  }

  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfterSeconds: row.retryAfterSeconds,
  };
}