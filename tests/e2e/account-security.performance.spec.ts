import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { release } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { Pool } from "pg";

import {
  cleanupAuthenticatedUsers,
  installAuthSessionCookie,
  seedAuthenticatedUser,
} from "./helpers/authenticated-user";

const enabled = process.env.RUN_ACCOUNT_SECURITY_PERF === "true";
const warmupCount = 10;
const sampleCount = 100;
const latencyBudgetMs = 2_000;
const recoverableErrorMessage =
  "Couldn’t update your sessions. No sessions changed. Review the list and try again.";
const databaseImage =
  "postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193";

interface CohortSummary {
  samples: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

type CompletionState = "pending" | "updated" | "recoverable-error";

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the account security benchmark");
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

async function readSessionIds(pool: Pool, userId: string) {
  const result = await pool.query<{ id: string }>(
    `SELECT "id" FROM "Session" WHERE "userId" = $1`,
    [userId],
  );
  return new Set(result.rows.map((row) => row.id));
}

async function expectIndividualFixtureState({
  pool,
  userId,
  currentSessionId,
  selectedSessionId,
  unselectedSessionId,
}: {
  pool: Pool;
  userId: string;
  currentSessionId: string;
  selectedSessionId: string;
  unselectedSessionId: string;
}) {
  const sessionIds = await readSessionIds(pool, userId);
  expect({
    count: sessionIds.size,
    currentSurvives: sessionIds.has(currentSessionId),
    selectedRemoved: !sessionIds.has(selectedSessionId),
    unselectedSurvives: sessionIds.has(unselectedSessionId),
  }).toEqual({
    count: 2,
    currentSurvives: true,
    selectedRemoved: true,
    unselectedSurvives: true,
  });
}

async function expectBulkFixtureState({
  pool,
  userId,
  currentSessionId,
}: {
  pool: Pool;
  userId: string;
  currentSessionId: string;
}) {
  const sessionIds = await readSessionIds(pool, userId);
  expect({
    count: sessionIds.size,
    currentSurvives: sessionIds.has(currentSessionId),
    othersGone:
      sessionIds.size === 1 && [...sessionIds].every((id) => id === currentSessionId),
  }).toEqual({ count: 1, currentSurvives: true, othersGone: true });
}

async function waitForCompletion({
  dialog,
  rows,
  currentMarker,
  recoverableError,
  expectedRowCount,
}: {
  dialog: Locator;
  rows: Locator;
  currentMarker: Locator;
  recoverableError: Locator;
  expectedRowCount: number;
}) {
  await expect
    .poll(
      async () => {
        if (
          (await recoverableError.isVisible()) &&
          (await recoverableError.textContent())?.trim() ===
            recoverableErrorMessage
        ) {
          return "recoverable-error" satisfies CompletionState;
        }

        const [dialogVisible, rowCount, currentVisible] = await Promise.all([
          dialog.isVisible(),
          rows.count(),
          currentMarker.isVisible(),
        ]);
        if (!dialogVisible && rowCount === expectedRowCount && currentVisible) {
          return "updated" satisfies CompletionState;
        }
        return "pending" satisfies CompletionState;
      },
      { intervals: [10, 20, 50], timeout: 15_000 },
    )
    .not.toBe("pending");

  return (await recoverableError.isVisible())
    ? ("recoverable-error" as const)
    : ("updated" as const);
}

async function runIndividualSample({
  baseUrl,
  context,
  page,
  pool,
}: {
  baseUrl: string;
  context: BrowserContext;
  page: Page;
  pool: Pool;
}) {
  try {
    const seeded = await seedAuthenticatedUser({
      additionalSessionCount: 2,
      authenticatedAt: new Date(),
    });
    await installAuthSessionCookie(context, seeded.sessionToken, baseUrl);
    await page.goto("/account/security");

    const list = page.getByRole("list", {
      name: "Active account sessions",
      exact: true,
    });
    const rows = list.getByRole("listitem");
    const currentMarker = list.getByText("Current session", { exact: true });
    const selectedRow = rows.filter({
      has: page.getByRole("heading", { name: "Session 2", exact: true }),
    });
    await expect(rows).toHaveCount(3);
    await expect(currentMarker).toBeVisible();
    await expect(selectedRow).toHaveCount(1);

    const trigger = selectedRow.getByRole("button", {
      name: "Revoke session",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Revoke session 2?",
      exact: true,
    });
    const confirm = dialog.getByRole("button", {
      name: "Revoke session",
      exact: true,
    });
    const recoverableError = dialog
      .getByRole("alert")
      .filter({ hasText: recoverableErrorMessage });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeEnabled();

    const startedAt = performance.now();
    await confirm.click();
    const completionState = await waitForCompletion({
      dialog,
      rows,
      currentMarker,
      recoverableError,
      expectedRowCount: 2,
    });
    const durationMs = performance.now() - startedAt;

    if (completionState === "recoverable-error") {
      await page.reload();
    }
    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(2);
    await expect(currentMarker).toBeVisible();
    await expectIndividualFixtureState({
      pool,
      userId: seeded.userId,
      currentSessionId: seeded.sessions[0]!.id,
      selectedSessionId: seeded.sessions[1]!.id,
      unselectedSessionId: seeded.sessions[2]!.id,
    });
    return durationMs;
  } finally {
    await cleanupAuthenticatedUsers();
  }
}

async function runBulkSample({
  baseUrl,
  context,
  page,
  pool,
}: {
  baseUrl: string;
  context: BrowserContext;
  page: Page;
  pool: Pool;
}) {
  try {
    const seeded = await seedAuthenticatedUser({
      additionalSessionCount: 2,
      authenticatedAt: new Date(),
    });
    await installAuthSessionCookie(context, seeded.sessionToken, baseUrl);
    await page.goto("/account/security");

    const list = page.getByRole("list", {
      name: "Active account sessions",
      exact: true,
    });
    const rows = list.getByRole("listitem");
    const currentMarker = list.getByText("Current session", { exact: true });
    await expect(rows).toHaveCount(3);
    await expect(currentMarker).toBeVisible();

    const trigger = page.getByRole("button", {
      name: "Revoke all other sessions",
      exact: true,
    });
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: "Revoke all other sessions?",
      exact: true,
    });
    const confirm = dialog.getByRole("button", {
      name: "Revoke all other sessions",
      exact: true,
    });
    const recoverableError = dialog
      .getByRole("alert")
      .filter({ hasText: recoverableErrorMessage });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeEnabled();

    const startedAt = performance.now();
    await confirm.click();
    const completionState = await waitForCompletion({
      dialog,
      rows,
      currentMarker,
      recoverableError,
      expectedRowCount: 1,
    });
    const durationMs = performance.now() - startedAt;

    if (completionState === "recoverable-error") {
      await page.reload();
    }
    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(1);
    await expect(currentMarker).toBeVisible();
    await expect(
      page.getByText("Only your current session is active.", { exact: true }),
    ).toBeVisible();
    await expectBulkFixtureState({
      pool,
      userId: seeded.userId,
      currentSessionId: seeded.sessions[0]!.id,
    });
    return durationMs;
  } finally {
    await cleanupAuthenticatedUsers();
  }
}

async function runCohort(runSample: () => Promise<number>) {
  for (let index = 0; index < warmupCount; index += 1) {
    await runSample();
  }

  const samples: number[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    samples.push(await runSample());
  }
  return summarize(samples);
}

test.describe("account security performance", { tag: "@performance" }, () => {
  test.skip(
    !enabled,
    "set RUN_ACCOUNT_SECURITY_PERF=true on the target Raspberry Pi",
  );
  test.setTimeout(30 * 60_000);

  test.afterEach(async () => {
    await cleanupAuthenticatedUsers();
  });

  test("keeps individual and bulk p95 below two seconds on ARM64", async ({
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
    const pool = getPool();
    let individual: CohortSummary;
    let bulk: CohortSummary;
    try {
      individual = await runCohort(() =>
        runIndividualSample({ baseUrl, context, page, pool }),
      );
      bulk = await runCohort(() =>
        runBulkSample({ baseUrl, context, page, pool }),
      );
    } finally {
      await pool.end();
    }

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
      individual,
      bulk,
    };

    await testInfo.attach("account-security-performance.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    console.log(JSON.stringify({ accountSecurityPerformance: report }));

    expect(individual.p95Ms).toBeLessThan(latencyBudgetMs);
    expect(bulk.p95Ms).toBeLessThan(latencyBudgetMs);
  });
});