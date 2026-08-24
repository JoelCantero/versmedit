import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { release } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

import {
  cleanupAuthenticatedUsers,
  installAuthSessionCookie,
  seedAuthenticatedUser,
} from "./helpers/authenticated-user";

const enabled = process.env.RUN_PERSONAL_DATA_EXPORT_PERF === "true";
const warmupCount = 10;
const sampleCount = 100;
const latencyBudgetMs = 2_000;
const defaultMaxBytes = 26_214_400;
const defaultTimeoutMs = 30_000;
const databaseImage =
  "postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193";

interface SampleResult {
  durationMs: number;
  payloadBytes: number;
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

function nearestRank(samples: readonly number[], percentile: number) {
  const ordered = samples.toSorted((left, right) => left - right);
  return ordered[Math.ceil(percentile * ordered.length) - 1]!;
}

async function withDeadline<T>(operation: () => Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`sample exceeded ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runSample({
  page,
  pool,
  generationBucketKey,
}: {
  page: Page;
  pool: Pool;
  generationBucketKey: string;
}): Promise<SampleResult> {
  await pool.query(`DELETE FROM "RateLimitBucket" WHERE "key" = $1`, [
    generationBucketKey,
  ]);
  await page.evaluate(() => {
    delete (window as Window & { __personalDataExportBlob?: Blob })
      .__personalDataExportBlob;
  });
  const startedAt = performance.now();
  return withDeadline(async () => {
    const [response] = await Promise.all([
      page.waitForResponse((candidate) =>
        candidate.url().endsWith("/api/account/data-export/download"),
      ),
      page.getByRole("button", { name: "Download data" }).click(),
    ]);
    await expect(page.getByRole("status")).toHaveText(
      "Your data export was downloaded.",
    );
    const browserPayload = await page.evaluate(async () => {
      const blob = (window as Window & { __personalDataExportBlob?: Blob })
        .__personalDataExportBlob;
      if (!blob) return null;
      return { size: blob.size, type: blob.type, text: await blob.text() };
    });
    if (!browserPayload) throw new Error("browser export Blob was unavailable");
    const body = browserPayload.text;
    const payloadBytes = Buffer.byteLength(body, "utf8");
    const envelope = JSON.parse(body) as {
      schemaVersion?: unknown;
      manifest?: {
        includedSections?: Array<{ namespace?: unknown }>;
        unavailableSections?: unknown[];
      };
    };

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers()["content-disposition"]).toMatch(
      /^attachment; filename="personal-data-export-[0-9]{8}T[0-9]{6}Z\.json"$/u,
    );
    expect(Number(response.headers()["content-length"])).toBe(payloadBytes);
    expect(response.headers()["cache-control"]).toBe("no-store, private");
    expect(browserPayload.type).toBe("application/json");
    expect(browserPayload.size).toBe(payloadBytes);
    expect(envelope.schemaVersion).toBe(1);
    expect(
      envelope.manifest?.includedSections?.map(({ namespace }) => namespace),
    ).toEqual(["account", "activeSessions", "policyAcceptances"]);
    expect(envelope.manifest?.unavailableSections).toEqual([]);
    expect(body).not.toMatch(
      /sessionToken|providerAccountId|access_token|refresh_token|verificationToken|rateLimitBucket|dataExportAuthorization/iu,
    );
    const durationMs = performance.now() - startedAt;
    expect(durationMs).toBeLessThan(defaultTimeoutMs);
    return { durationMs, payloadBytes };
  }, defaultTimeoutMs);
}

test.describe("personal data export performance", { tag: "@performance" }, () => {
  test.skip(
    !enabled,
    "set RUN_PERSONAL_DATA_EXPORT_PERF=true on the target Raspberry Pi",
  );
  test.setTimeout(30 * 60_000);

  test.afterEach(async () => {
    await cleanupAuthenticatedUsers();
  });

  test("keeps the built-in standalone generation p95 below two seconds on ARM64", async ({
    context,
    page,
    baseURL,
  }, testInfo) => {
    const hardwareModel = readText(
      process.env.PERSONAL_DATA_EXPORT_PERF_MODEL_PATH ??
        "/proc/device-tree/model",
    );
    expect(process.arch, "benchmark must run on ARM64").toBe("arm64");
    expect(process.platform, "benchmark must run on Linux").toBe("linux");
    expect(hardwareModel, "benchmark must run on a Raspberry Pi").toMatch(
      /Raspberry Pi/iu,
    );
    expect(
      Number(process.env.ACCOUNT_DATA_EXPORT_MAX_BYTES ?? defaultMaxBytes),
    ).toBe(defaultMaxBytes);
    expect(
      Number(process.env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS ?? defaultTimeoutMs),
    ).toBe(defaultTimeoutMs);

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const pool = new Pool({ connectionString });
    try {
      const seeded = await seedAuthenticatedUser({
        accountCount: 2,
        additionalSessionCount: 2,
        withDataExportFixtures: true,
        withDataExportAuthorization: true,
      });
      const generationBucketKey = seeded.dataExportGenerationBucketKeys?.[0];
      if (!generationBucketKey) {
        throw new Error("generation bucket key was unavailable");
      }
      await installAuthSessionCookie(
        context,
        seeded.sessionToken,
        baseURL ?? "http://127.0.0.1:3100",
      );
      await page.goto("/account/data");
      await expect(
        page.getByRole("button", { name: "Download data" }),
      ).toBeVisible();
      await page.evaluate(() => {
        const createObjectURL = URL.createObjectURL.bind(URL);
        URL.createObjectURL = (object) => {
          if (object instanceof Blob) {
            (
              window as Window & { __personalDataExportBlob?: Blob }
            ).__personalDataExportBlob = object;
          }
          return createObjectURL(object);
        };
      });

      for (let index = 0; index < warmupCount; index += 1) {
        await runSample({ page, pool, generationBucketKey });
      }

      const measured: SampleResult[] = [];
      for (let index = 0; index < sampleCount; index += 1) {
        measured.push(await runSample({ page, pool, generationBucketKey }));
      }
      const durations = measured.map(({ durationMs }) => durationMs);
      const payloadBytes = new Set(
        measured.map((sample) => sample.payloadBytes),
      );
      expect(payloadBytes.size).toBe(1);
      const p50Ms = nearestRank(durations, 0.5);
      const p95Ms = nearestRank(durations, 0.95);
      const maxMs = Math.max(...durations);
      const exportTables = await pool.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name ILIKE '%export%'
        ORDER BY table_name
      `);
      expect(exportTables.rows).toEqual([
        { table_name: "DataExportAuthorization" },
      ]);

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
        activeLimits: {
          maxBytes: defaultMaxBytes,
          timeoutMs: defaultTimeoutMs,
        },
        warmups: warmupCount,
        samples: sampleCount,
        failures: 0,
        payloadBytes: [...payloadBytes][0],
        p50Ms,
        p95Ms,
        maxMs,
      };

      await testInfo.attach("personal-data-export-performance.json", {
        body: JSON.stringify(report, null, 2),
        contentType: "application/json",
      });
      console.log(JSON.stringify({ personalDataExportPerformance: report }));

      expect(measured).toHaveLength(sampleCount);
      expect(p95Ms).toBeLessThan(latencyBudgetMs);
      expect(maxMs).toBeLessThan(defaultTimeoutMs);
    } finally {
      await pool.end();
    }
  });
});