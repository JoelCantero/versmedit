import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { release } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";

import {
  cleanupAuthenticatedUsers,
  installAuthSessionCookie,
  seedAuthenticatedUser,
} from "./helpers/authenticated-user";

const enabled = process.env.RUN_ACCOUNT_DELETION_PERF === "true";
const warmupCount = 10;
const sampleCount = 100;
const latencyBudgetMs = 2_000;
const finalClientBucketKey =
  "account:deletion:final:client:untrusted-direct-client";
const databaseImage =
  "postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193";

interface CohortSummary {
  samples: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the deletion benchmark");
  }
  return new Pool({ connectionString });
}

function readText(filePath: string) {
  try {
    return readFileSync(filePath, "utf8").replaceAll("\0", "").trim();
  } catch {
    return "unknown";
  }
}

function getCommit() {
  const ciCommit = process.env.GITHUB_SHA?.trim();
  if (ciCommit) return ciCommit;

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}

function nearestRank(samples: number[], percentile: number) {
  const ordered = samples.toSorted((left, right) => left - right);
  return ordered[Math.ceil(percentile * ordered.length) - 1]!;
}

function summarize(samples: number[]): CohortSummary {
  return {
    samples: samples.length,
    p50Ms: nearestRank(samples, 0.5),
    p95Ms: nearestRank(samples, 0.95),
    maxMs: Math.max(...samples),
  };
}

async function installRollbackFailure(userId: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(userId)) {
    throw new Error("invalid benchmark fixture user id");
  }
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const functionName = `perf_delete_fail_${suffix}`;
  const triggerName = `perf_delete_trigger_${suffix}`;
  const pool = getPool();
  try {
    await pool.query(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'injected account deletion failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER "${triggerName}"
      BEFORE DELETE ON "User"
      FOR EACH ROW WHEN (OLD."id" = '${userId}')
      EXECUTE FUNCTION "${functionName}"()
    `);
  } finally {
    await pool.end();
  }

  return async () => {
    const cleanupPool = getPool();
    try {
      await cleanupPool.query(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "User"`,
      );
      await cleanupPool.query(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    } finally {
      await cleanupPool.end();
    }
  };
}

async function runSample({
  baseUrl,
  context,
  page,
  rollback,
}: {
  baseUrl: string;
  context: BrowserContext;
  page: Page;
  rollback: boolean;
}) {
  let removeFailure: (() => Promise<void>) | undefined;
  try {
    const seeded = await seedAuthenticatedUser({
      accountCount: 2,
      additionalSessionCount: 2,
      clientBucketKeys: [finalClientBucketKey],
      rateLimitCount: 0,
      withDeletionGraph: true,
    });
    const pool = getPool();
    try {
      const graph = await pool.query<{
        accounts: number;
        sessions: number;
        acceptances: number;
        tokens: number;
        addressBuckets: number;
        clientBuckets: number;
      }>(
        `SELECT
          (SELECT COUNT(*)::int FROM "Account" WHERE "userId" = $1) AS "accounts",
          (SELECT COUNT(*)::int FROM "Session" WHERE "userId" = $1) AS "sessions",
          (SELECT COUNT(*)::int FROM "PolicyAcceptance" WHERE "userId" = $1) AS "acceptances",
          (SELECT COUNT(*)::int FROM "VerificationToken" WHERE "identifier" = $2) AS "tokens",
          (SELECT COUNT(*)::int FROM "RateLimitBucket" WHERE "key" = $3) AS "addressBuckets",
          (SELECT COUNT(*)::int FROM "RateLimitBucket" WHERE "key" = $4) AS "clientBuckets"`,
        [
          seeded.userId,
          seeded.normalizedEmail,
          seeded.addressBucketKey,
          finalClientBucketKey,
        ],
      );
      expect(graph.rows[0]).toEqual({
        accounts: 2,
        sessions: 3,
        acceptances: 1,
        tokens: 3,
        addressBuckets: 1,
        clientBuckets: 1,
      });
    } finally {
      await pool.end();
    }
    await installAuthSessionCookie(context, seeded.sessionToken, baseUrl);
    if (rollback) {
      removeFailure = await installRollbackFailure(seeded.userId);
    }

    await page.goto("/account/data");
    await page.getByRole("button", { name: "Delete account" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    const confirm = page.getByRole("button", {
      name: "Permanently delete account",
    });
    await expect(confirm).toBeVisible();

    const startedAt = performance.now();
    await confirm.click();
    if (rollback) {
      await expect(page.getByRole("alert")).toHaveText(
        "We could not delete the account. Try again.",
      );
    } else {
      await expect(
        page.getByRole("heading", { name: "Account deleted" }),
      ).toBeVisible();
    }
    return performance.now() - startedAt;
  } finally {
    try {
      await removeFailure?.();
    } finally {
      await cleanupAuthenticatedUsers();
    }
  }
}

async function runCohort(options: {
  baseUrl: string;
  context: BrowserContext;
  page: Page;
  rollback: boolean;
}) {
  for (let index = 0; index < warmupCount; index += 1) {
    await runSample(options);
  }

  const samples: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    samples.push(await runSample(options));
  }
  return summarize(samples);
}

test.describe("account deletion performance", { tag: "@performance" }, () => {
  test.skip(!enabled, "set RUN_ACCOUNT_DELETION_PERF=true on the target Raspberry Pi");
  test.setTimeout(30 * 60_000);

  test.afterEach(async () => {
    await cleanupAuthenticatedUsers();
  });

  test("keeps committed and rollback p95 below two seconds on ARM64", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const hardwareModel = readText("/proc/device-tree/model");
    expect(process.arch, "benchmark must run on ARM64").toBe("arm64");
    expect(process.platform, "benchmark must run on Linux").toBe("linux");
    expect(hardwareModel, "benchmark must run on a Raspberry Pi").toMatch(
      /Raspberry Pi/i,
    );

    const baseUrl = baseURL ?? "http://127.0.0.1:3100";
    const committed = await runCohort({
      baseUrl,
      context,
      page,
      rollback: false,
    });
    const rolledBack = await runCohort({
      baseUrl,
      context,
      page,
      rollback: true,
    });
    const report = {
      hardware: {
        model: hardwareModel,
        architecture: process.arch,
        os: `${process.platform} ${release()}`,
      },
      artifactId: readText(
        path.resolve(process.env.NEXT_DIST_DIR ?? ".next", "BUILD_ID"),
      ),
      commit: getCommit(),
      databaseImage,
      warmupsPerCohort: warmupCount,
      committed,
      rolledBack,
    };

    await testInfo.attach("account-deletion-performance.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log(JSON.stringify({ accountDeletionPerformance: report }));

    expect(committed.p95Ms).toBeLessThan(latencyBudgetMs);
    expect(rolledBack.p95Ms).toBeLessThan(latencyBudgetMs);
  });
});