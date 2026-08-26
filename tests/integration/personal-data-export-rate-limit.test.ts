// @vitest-environment node

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";

import { createHttpMailProvider } from "../helpers/http-mail-provider";
import { createPersonalDataExportFixtureScope } from "../helpers/personal-data-export";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  getRequestLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const originalEnv = new Map<string, string | undefined>();
const managedEnv = [
  "PROJECT_NAME",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "MAIL_ENABLED",
  "MAIL_PROVIDER",
  "MAIL_API_KEY",
  "MAIL_API_SECRET",
  "MAIL_FROM",
  "BRAND_COLOR",
  "SUPPORT_EMAIL",
  "MAIL_LOGO_URL",
  "TRUST_PROXY_HEADERS",
  "ACCOUNT_DATA_EXPORT_MAX_BYTES",
  "ACCOUNT_DATA_EXPORT_TIMEOUT_MS",
] as const;

describe.skipIf(!runIntegrationTests)("personal data export shared rate limits", () => {
  let db: (typeof import("@/lib/db"))["db"];
  let service: typeof import("@/modules/account/data-export/service");
  let limits: typeof import("@/modules/account/data-export/rate-limit");
  let sharedLimits: typeof import("@/lib/shared-rate-limit");
  let createRegistry: (typeof import("@/modules/account/data-export/registry"))["createPersonalDataExportRegistry"];
  let http: ReturnType<typeof createHttpMailProvider>;
  const applicationInstances: PrismaClient[] = [];
  const scopes: Array<ReturnType<typeof createPersonalDataExportFixtureScope>> = [];
  const keys = new Set<string>();

  beforeAll(async () => {
    for (const key of managedEnv) originalEnv.set(key, process.env[key]);
    Object.assign(process.env, {
      PROJECT_NAME: "Personal Data Export Limit Test",
      AUTH_SECRET: "personal-data-export-limit-secret-32",
      NEXTAUTH_URL: "https://app.example.test",
      MAIL_ENABLED: "true",
      MAIL_PROVIDER: "brevo",
      MAIL_API_KEY: "rate-limit-provider-key",
      MAIL_API_SECRET: "",
      MAIL_FROM: "no-reply@example.test",
      BRAND_COLOR: "#0057B8",
      SUPPORT_EMAIL: "support@example.test",
      MAIL_LOGO_URL: "https://assets.example.test/mail/logo.png",
      TRUST_PROXY_HEADERS: "false",
      ACCOUNT_DATA_EXPORT_MAX_BYTES: "26214400",
      ACCOUNT_DATA_EXPORT_TIMEOUT_MS: "30000",
    });
    vi.resetModules();
    http = createHttpMailProvider();
    vi.doMock("@/lib/email/http", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/email/http")>()),
      nativeProviderHttpClient: http.client,
    }));
    db = (await import("@/lib/db")).db;
    sharedLimits = await import("@/lib/shared-rate-limit");
    service = await import("@/modules/account/data-export/service");
    limits = await import("@/modules/account/data-export/rate-limit");
    createRegistry = (
      await import("@/modules/account/data-export/registry")
    ).createPersonalDataExportRegistry;
    for (let index = 0; index < 2; index += 1) {
      applicationInstances.push(
        new PrismaClient({
          adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
        }),
      );
    }
  });

  afterEach(async () => {
    await Promise.all(scopes.splice(0).map((scope) => scope.cleanup(db)));
    await db.rateLimitBucket.deleteMany({ where: { key: { in: [...keys] } } });
    keys.clear();
    http.requests.splice(0);
  });

  afterAll(async () => {
    await Promise.all(
      applicationInstances.splice(0).map((client) => client.$disconnect()),
    );
    await db?.$disconnect();
    vi.doUnmock("@/lib/email/http");
    for (const key of managedEnv) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it.each([
    ["request client", 5, (value: string) => limits.getPersonalDataExportRequestClientRateLimitKey(value)],
    ["request account", 3, (value: string) => limits.getPersonalDataExportRequestAccountRateLimitKey(value)],
    ["confirmation client", 5, (value: string) => limits.getPersonalDataExportConfirmationClientRateLimitKey(value)],
    ["generation Session", 3, (value: string) => limits.getPersonalDataExportGenerationSessionRateLimitKey(value)],
  ] as const)("atomically admits exactly the %s allowance across two application instances", async (label, allowance, keyFor) => {
    const key = keyFor(`${label}-${crypto.randomUUID()}`);
    keys.add(key);
    const results = await Promise.all(
      Array.from({ length: allowance + 3 }, (_, index) =>
        sharedLimits.consumeSharedRateLimit({
          key,
          limit: allowance,
          windowMs: limits.PERSONAL_DATA_EXPORT_RATE_LIMIT_WINDOW_MS,
          database: applicationInstances[index % 2]!,
        }),
      ),
    );
    expect(results.filter(({ allowed }) => allowed)).toHaveLength(allowance);
    expect(results.filter(({ allowed }) => !allowed)).toHaveLength(3);
  });

  it("rejects the fourth account request before provider delivery", async () => {
    const scope = createPersonalDataExportFixtureScope({ label: "export-account-limit", now: new Date() });
    scopes.push(scope);
    const owner = scope.account();
    const session = scope.session(owner);
    scope.exportCredential(owner);
    scope.rateLimitBuckets(owner, session);
    await db.user.create({ data: owner });
    await db.session.create({ data: session });

    const results = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      results.push(await service.issuePersonalDataExport({
        sessionToken: session.sessionToken,
        locale: "en",
        origin: "https://app.example.test",
      }));
    }

    expect(results.slice(0, 3)).toEqual(Array(3).fill({ status: "sent" }));
    expect(results[3]).toEqual({ status: "rate_limited", retryAfter: expect.any(Number) });
    expect(http.requests.filter(({ method }) => method === "POST")).toHaveLength(3);
  });

  it("rejects the fourth generation before invoking a contributor", async () => {
    const scope = createPersonalDataExportFixtureScope({ label: "export-generation-limit", now: new Date() });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const key = limits.getPersonalDataExportGenerationSessionRateLimitKey(graph.sessions[0]!.id);
    await db.rateLimitBucket.deleteMany({ where: { key } });
    const contribute = vi.fn(async () => ({ status: "included" as const, data: {} }));
    const isolatedRegistry = createRegistry(
      [
        {
          namespace: "fixture",
          schemaVersion: 1,
          classifications: ["observed"],
          unavailableReasons: [],
        },
      ],
      [{ namespace: "fixture", schemaVersion: 1, contribute }],
    );

    const results = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      results.push(await service.generatePersonalDataExport({
        sessionToken: graph.sessions[0]!.sessionToken,
        registry: isolatedRegistry,
      }));
    }

    expect(results.slice(0, 3).every(({ status }) => status === "completed")).toBe(true);
    expect(results[3]).toEqual({ status: "rate_limited", retryAfter: expect.any(Number) });
    expect(contribute).toHaveBeenCalledTimes(6);
  });

  it("atomically starts a fresh allowance after the persisted window expires", async () => {
    const clientIdentifier = `expired-window-${crypto.randomUUID()}`;
    const key = limits.getPersonalDataExportRequestClientRateLimitKey(
      clientIdentifier,
    );
    keys.add(key);
    await db.rateLimitBucket.create({
      data: {
        key,
        count: 99,
        resetAt: new Date(Date.now() - 1_000),
      },
    });

    const results = await Promise.all([
      limits.consumePersonalDataExportRequestClientLimit(clientIdentifier),
      limits.consumePersonalDataExportRequestClientLimit(clientIdentifier),
    ]);

    expect(results.every(({ allowed }) => allowed)).toBe(true);
    await expect(
      db.rateLimitBucket.findUnique({ where: { key }, select: { count: true } }),
    ).resolves.toEqual({ count: 2 });
  });

  it("keeps request, confirmation, account, and generation scopes isolated", async () => {
    const sharedValue = `shared-scope-${crypto.randomUUID()}`;
    const scopeKeys = [
      limits.getPersonalDataExportRequestClientRateLimitKey(sharedValue),
      limits.getPersonalDataExportConfirmationClientRateLimitKey(sharedValue),
      limits.getPersonalDataExportRequestAccountRateLimitKey(sharedValue),
      limits.getPersonalDataExportGenerationSessionRateLimitKey(sharedValue),
    ];
    scopeKeys.forEach((key) => keys.add(key));
    expect(new Set(scopeKeys)).toHaveLength(4);

    const requestResults = await Promise.all(
      Array.from({ length: 6 }, () =>
        limits.consumePersonalDataExportRequestClientLimit(sharedValue),
      ),
    );
    expect(requestResults.filter(({ allowed }) => allowed)).toHaveLength(5);

    await expect(
      limits.consumePersonalDataExportConfirmationClientLimit(sharedValue),
    ).resolves.toMatchObject({ allowed: true, remaining: 4 });
    await expect(
      limits.consumePersonalDataExportRequestAccountLimit(sharedValue),
    ).resolves.toMatchObject({ allowed: true, remaining: 2 });
    await expect(
      limits.consumePersonalDataExportGenerationSessionLimit(sharedValue),
    ).resolves.toMatchObject({ allowed: true, remaining: 2 });
  });
});