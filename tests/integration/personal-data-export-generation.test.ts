// @vitest-environment node

import "dotenv/config";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { PersonalDataExportContributor } from "@/modules/account/data-export/internal-types";

import {
  createFixtureProductContributor,
  fixtureJournalEntries,
  fixtureProductDeclaration,
  type FixtureProductContributorMode,
} from "../fixtures/personal-data-export-product-contributor";
import { createPersonalDataExportFixtureScope } from "../helpers/personal-data-export";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  },
  getRequestLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const managedEnv = [
  "PROJECT_NAME",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "MAIL_ENABLED",
  "TRUST_PROXY_HEADERS",
  "ACCOUNT_DATA_EXPORT_MAX_BYTES",
  "ACCOUNT_DATA_EXPORT_TIMEOUT_MS",
] as const;
const originalEnv = new Map<string, string | undefined>();

type Database = (typeof import("@/lib/db"))["db"];
type GenerateExport =
  (typeof import("@/modules/account/data-export/service"))["generatePersonalDataExport"];
type ExportContributor = PersonalDataExportContributor;

describe.skipIf(!runIntegrationTests)("personal data export generation", () => {
  let db: Database;
  let generatePersonalDataExport: GenerateExport;
  let registry: (typeof import("@/modules/account/data-export/composition"))["personalDataExportRegistry"];
  let createRegistry: (typeof import("@/modules/account/data-export/registry"))["createPersonalDataExportRegistry"];
  const scopes: Array<ReturnType<typeof createPersonalDataExportFixtureScope>> = [];

  beforeAll(async () => {
    for (const key of managedEnv) originalEnv.set(key, process.env[key]);
    Object.assign(process.env, {
      PROJECT_NAME: "Personal Data Export Test",
      AUTH_SECRET: "personal-data-export-generation-secret-32",
      NEXTAUTH_URL: "https://app.example.test",
      MAIL_ENABLED: "false",
      TRUST_PROXY_HEADERS: "false",
      ACCOUNT_DATA_EXPORT_MAX_BYTES: "26214400",
      ACCOUNT_DATA_EXPORT_TIMEOUT_MS: "30000",
    });
    vi.resetModules();
    db = (await import("@/lib/db")).db;
    generatePersonalDataExport = (
      await import("@/modules/account/data-export/service")
    ).generatePersonalDataExport;
    registry = (
      await import("@/modules/account/data-export/composition")
    ).personalDataExportRegistry;
    createRegistry = (
      await import("@/modules/account/data-export/registry")
    ).createPersonalDataExportRegistry;
  });

  afterEach(async () => {
    await Promise.all(scopes.splice(0).map((scope) => scope.cleanup(db)));
  });

  afterAll(async () => {
    await db?.$disconnect();
    for (const key of managedEnv) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function registryFor(
    contributors: readonly ExportContributor[],
    unavailableReasons: Readonly<Record<string, readonly string[]>> = {},
  ) {
    return createRegistry(
      contributors.map(({ namespace, schemaVersion }) => ({
        namespace,
        schemaVersion,
        classifications: ["observed"] as const,
        unavailableReasons: unavailableReasons[namespace] ?? [],
      })),
      contributors,
    );
  }

  it("buffers complete repeatable built-in snapshots without mutating or retaining source data", async () => {
    const scope = createPersonalDataExportFixtureScope({
      label: "export-generation",
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const before = await db.user.findUnique({
      where: { id: graph.owner.id },
      include: { accounts: true, sessions: true, policyAcceptance: true },
    });

    const first = await generatePersonalDataExport({
      sessionToken: graph.sessions[0]!.sessionToken,
      registry,
    });
    expect(first.status).toBe("completed");
    if (first.status !== "completed") throw new Error("generation did not complete");
    expect(first.export.byteLength).toBe(Buffer.byteLength(first.export.json));
    expect(JSON.parse(first.export.json)).toEqual(first.export.envelope);
    expect(first.export.envelope.schemaVersion).toBe(1);
    expect(first.export.envelope.manifest.includedSections).toEqual([
      { namespace: "account", schemaVersion: 1 },
      { namespace: "activeSessions", schemaVersion: 1 },
      { namespace: "policyAcceptances", schemaVersion: 1 },
    ]);
    expect(Object.keys(first.export.envelope.sections)).toEqual([
      "account",
      "activeSessions",
      "policyAcceptances",
    ]);
    expect(JSON.stringify(first.export.envelope)).not.toMatch(
      /sessionToken|normalizedEmail|providerAccountId|access_token|refresh_token|hidden-|forbidden-/iu,
    );

    const second = await generatePersonalDataExport({
      sessionToken: graph.sessions[0]!.sessionToken,
      registry,
    });
    expect(second.status).toBe("completed");
    if (second.status !== "completed") throw new Error("repeat generation failed");
    expect(second.export.envelope.sections).toEqual(first.export.envelope.sections);
    expect(second.export.envelope.manifest).toEqual(first.export.envelope.manifest);

    await expect(
      db.user.findUnique({
        where: { id: graph.owner.id },
        include: { accounts: true, sessions: true, policyAcceptance: true },
      }),
    ).resolves.toEqual(before);
    await expect(
      db.dataExportAuthorization.findUnique({
        where: { sessionId: graph.sessions[0]!.id },
      }),
    ).resolves.toEqual(graph.grant);
  });

  it("rejects missing and expired exact-session grants before contributor work", async () => {
    const scope = createPersonalDataExportFixtureScope({ label: "export-no-grant", now: new Date() });
    scopes.push(scope);
    const owner = scope.account();
    const session = scope.session(owner);
    scope.exportCredential(owner);
    scope.rateLimitBuckets(owner, session);
    await db.user.create({ data: owner });
    await db.session.create({ data: session });
    const contribute = vi.fn();
    const isolatedRegistry = registryFor([
      { namespace: "fixture", schemaVersion: 1, contribute },
    ]);

    await expect(
      generatePersonalDataExport({ sessionToken: session.sessionToken, registry: isolatedRegistry }),
    ).resolves.toEqual({ status: "not_ready" });
    expect(contribute).not.toHaveBeenCalled();

    await db.dataExportAuthorization.create({
      data: {
        sessionId: session.id,
        confirmedAt: new Date(scope.now.getTime() - 60_000),
        expiresAt: new Date(scope.now.getTime() - 1),
      },
    });
    await expect(
      generatePersonalDataExport({ sessionToken: session.sessionToken, registry: isolatedRegistry }),
    ).resolves.toEqual({ status: "not_ready" });
    expect(contribute).not.toHaveBeenCalled();
  });

  it("rolls back writes attempted by a contributor and returns no partial export", async () => {
    const scope = createPersonalDataExportFixtureScope({ label: "export-read-only", now: new Date() });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const originalName = graph.owner.name;
    const writeContributor = {
      namespace: "writeAttempt",
      schemaVersion: 1,
      async contribute(context: Parameters<typeof registry.contributors[number]["contribute"]>[0]) {
        await context.transaction.user.update({
          where: { id: context.userId },
          data: { name: "forbidden mutation" },
        });
        return { status: "included" as const, data: {} };
      },
    };
    const writeRegistry = registryFor([writeContributor]);

    await expect(
      generatePersonalDataExport({
        sessionToken: graph.sessions[0]!.sessionToken,
        registry: writeRegistry,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      auditOutcome: "contributor_failed",
    });
    await expect(
      db.user.findUnique({ where: { id: graph.owner.id }, select: { name: true } }),
    ).resolves.toEqual({ name: originalName });
  });

  it("aborts the whole export after a contributor failure without invoking later contributors", async () => {
    const scope = createPersonalDataExportFixtureScope({ label: "export-contributor-failure", now: new Date() });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const later = vi.fn(async () => ({ status: "included" as const, data: {} }));
    const failingRegistry = registryFor([
        {
          namespace: "failure",
          schemaVersion: 1,
          async contribute() {
            throw new Error("sensitive contributor detail");
          },
        },
        { namespace: "later", schemaVersion: 1, contribute: later },
      ]);

    await expect(
      generatePersonalDataExport({
        sessionToken: graph.sessions[0]!.sessionToken,
        registry: failingRegistry,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      auditOutcome: "contributor_failed",
    });
    expect(later).not.toHaveBeenCalled();
  });

  it("cascades the grant with its Session and performs no contributor work", async () => {
    const scope = createPersonalDataExportFixtureScope({
      label: "export-session-cascade",
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const contribute = vi.fn();
    const isolatedRegistry = registryFor([
      { namespace: "fixture", schemaVersion: 1, contribute },
    ]);

    await db.session.delete({ where: { id: graph.sessions[0]!.id } });

    await expect(
      db.dataExportAuthorization.findUnique({
        where: { sessionId: graph.sessions[0]!.id },
      }),
    ).resolves.toBeNull();
    await expect(
      generatePersonalDataExport({
        sessionToken: graph.sessions[0]!.sessionToken,
        registry: isolatedRegistry,
      }),
    ).resolves.toEqual({ status: "unauthenticated" });
    expect(contribute).not.toHaveBeenCalled();
  });

  it("rolls back a database failure and returns no partial export", async () => {
    const scope = createPersonalDataExportFixtureScope({
      label: "export-transaction-failure",
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const later = vi.fn();
    const failingRegistry = registryFor([
        {
          namespace: "databaseFailure",
          schemaVersion: 1,
          async contribute(
            context: Parameters<
              (typeof registry.contributors)[number]["contribute"]
            >[0],
          ) {
            await context.transaction.$queryRawUnsafe(
              "SELECT * FROM deliberately_missing_export_relation",
            );
            return { status: "included" as const, data: {} };
          },
        },
        { namespace: "later", schemaVersion: 1, contribute: later },
      ]);

    const result = await generatePersonalDataExport({
      sessionToken: graph.sessions[0]!.sessionToken,
      registry: failingRegistry,
    });

    expect(result).toEqual({
      status: "unavailable",
      auditOutcome: "contributor_failed",
    });
    expect(result).not.toHaveProperty("export");
    expect(later).not.toHaveBeenCalled();
    await expect(
      db.dataExportAuthorization.findUnique({
        where: { sessionId: graph.sessions[0]!.id },
      }),
    ).resolves.toEqual(graph.grant);
  });

  it("accepts the exact configured UTF-8 cap and rejects one byte less", async () => {
    const scope = createPersonalDataExportFixtureScope({
      label: "export-size-boundary",
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    await db.rateLimitBucket.delete({
      where: { key: graph.buckets.keys.generationSession },
    });
    const originalMaxBytes = process.env.ACCOUNT_DATA_EXPORT_MAX_BYTES;

    try {
      const baseline = await generatePersonalDataExport({
        sessionToken: graph.sessions[0]!.sessionToken,
        registry,
      });
      expect(baseline.status).toBe("completed");
      if (baseline.status !== "completed") throw new Error("baseline failed");

      process.env.ACCOUNT_DATA_EXPORT_MAX_BYTES = String(
        baseline.export.byteLength,
      );
      await expect(
        generatePersonalDataExport({
          sessionToken: graph.sessions[0]!.sessionToken,
          registry,
        }),
      ).resolves.toMatchObject({ status: "completed" });

      process.env.ACCOUNT_DATA_EXPORT_MAX_BYTES = String(
        baseline.export.byteLength - 1,
      );
      const oversized = await generatePersonalDataExport({
        sessionToken: graph.sessions[0]!.sessionToken,
        registry,
      });
      expect(oversized).toEqual({ status: "unavailable" });
      expect(oversized).not.toHaveProperty("export");
    } finally {
      if (originalMaxBytes === undefined) {
        delete process.env.ACCOUNT_DATA_EXPORT_MAX_BYTES;
      } else {
        process.env.ACCOUNT_DATA_EXPORT_MAX_BYTES = originalMaxBytes;
      }
    }
  });

  it("actively aborts a contributor at the application-specific deadline", async () => {
    const scope = createPersonalDataExportFixtureScope({
      label: "export-active-timeout",
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const originalTimeout = process.env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS;
    process.env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS = "150";
    let observedAbort = false;
    const timeoutRegistry = registryFor([
        {
          namespace: "slow",
          schemaVersion: 1,
          contribute({ signal }: Parameters<
            (typeof registry.contributors)[number]["contribute"]
          >[0]) {
            return new Promise<{
              status: "included";
              data: Record<string, never>;
            }>((resolve, reject) => {
              const timer = setTimeout(
                () => resolve({ status: "included", data: {} }),
                2_000,
              );
              signal.addEventListener(
                "abort",
                () => {
                  observedAbort = true;
                  clearTimeout(timer);
                  reject(signal.reason);
                },
                { once: true },
              );
            });
          },
        },
      ]);
    const startedAt = performance.now();

    try {
      const result = await generatePersonalDataExport({
        sessionToken: graph.sessions[0]!.sessionToken,
        registry: timeoutRegistry,
      });
      expect(result).toEqual({ status: "unavailable" });
      expect(result).not.toHaveProperty("export");
      expect(observedAbort).toBe(true);
      expect(performance.now() - startedAt).toBeLessThan(1_000);
    } finally {
      if (originalTimeout === undefined) {
        delete process.env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS;
      } else {
        process.env.ACCOUNT_DATA_EXPORT_TIMEOUT_MS = originalTimeout;
      }
    }
  });

  it("injects a classified product section with stable namespace-isolated output", async () => {
    const scope = createPersonalDataExportFixtureScope({
      label: "export-product-present",
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const entries = fixtureJournalEntries.map((entry) => ({
      ...entry,
      userId: graph.owner.id,
    }));
    const productRegistry = createRegistry(
      [fixtureProductDeclaration],
      [createFixtureProductContributor({ entries })],
    );

    const first = await generatePersonalDataExport({
      sessionToken: graph.sessions[0]!.sessionToken,
      registry: productRegistry,
    });
    const second = await generatePersonalDataExport({
      sessionToken: graph.sessions[0]!.sessionToken,
      registry: productRegistry,
    });

    expect(first.status).toBe("completed");
    expect(second.status).toBe("completed");
    if (first.status !== "completed" || second.status !== "completed") return;
    expect(first.export.envelope.manifest.includedSections).toEqual([
      { namespace: "journal.entries", schemaVersion: 1 },
    ]);
    expect(Object.keys(first.export.envelope.sections)).toEqual([
      "journal.entries",
    ]);
    expect(second.export.envelope.sections).toEqual(first.export.envelope.sections);
    expect(JSON.stringify(first.export.envelope.sections)).not.toMatch(
      /hidden-|normalizedTitle|globalPrompt|userId/iu,
    );
  });

  it.each([
    ["empty", "included"],
    ["unavailable", "unavailable"],
  ] as const)("keeps the product %s result distinct in the manifest", async (mode, expected) => {
    const scope = createPersonalDataExportFixtureScope({
      label: `export-product-${mode}`,
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const productRegistry = createRegistry(
      [fixtureProductDeclaration],
      [createFixtureProductContributor({ mode })],
    );

    const result = await generatePersonalDataExport({
      sessionToken: graph.sessions[0]!.sessionToken,
      registry: productRegistry,
    });

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    if (expected === "included") {
      expect(result.export.envelope.manifest.includedSections).toEqual([
        { namespace: "journal.entries", schemaVersion: 1 },
      ]);
      expect(result.export.envelope.sections["journal.entries"]?.data).toEqual([]);
      expect(result.export.envelope.manifest.unavailableSections).toEqual([]);
    } else {
      expect(result.export.envelope.manifest.includedSections).toEqual([]);
      expect(result.export.envelope.sections).toEqual({});
      expect(result.export.envelope.manifest.unavailableSections).toEqual([
        {
          namespace: "journal.entries",
          schemaVersion: 1,
          reason: "feature_disabled",
        },
      ]);
    }
  });

  it.each([
    "nondeterministic",
    "undeclared_unavailable",
    "invalid",
    "throws",
  ] as const)("fails the whole export for a %s product result", async (mode) => {
    const scope = createPersonalDataExportFixtureScope({
      label: `export-product-failure-${mode}`,
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const productRegistry = createRegistry(
      [fixtureProductDeclaration],
      [
        createFixtureProductContributor({
          mode: mode as FixtureProductContributorMode,
          entries:
            mode === "nondeterministic"
              ? fixtureJournalEntries.map((entry) => ({
                  ...entry,
                  userId: graph.owner.id,
                }))
              : undefined,
        }),
      ],
    );

    const result = await generatePersonalDataExport({
      sessionToken: graph.sessions[0]!.sessionToken,
      registry: productRegistry,
    });

    expect(result).toEqual({
      status: "unavailable",
      auditOutcome: "contributor_failed",
    });
    expect(result).not.toHaveProperty("export");
  });

  it("uses one repeatable-read snapshot across contributors", async () => {
    const scope = createPersonalDataExportFixtureScope({
      label: "export-repeatable-snapshot",
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const originalName = graph.owner.name;
    let releaseFirst: (() => void) | undefined;
    let reportFirstRead: (() => void) | undefined;
    const firstRead = new Promise<void>((resolve) => {
      reportFirstRead = resolve;
    });
    const firstMayFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const readName = async (
      context: Parameters<ExportContributor["contribute"]>[0],
    ) => {
      const owner = await context.transaction.user.findUnique({
        where: { id: context.userId },
        select: { name: true },
      });
      return owner?.name ?? null;
    };
    const snapshotRegistry = registryFor([
      {
        namespace: "snapshot.first",
        schemaVersion: 1,
        async contribute(context) {
          const name = await readName(context);
          reportFirstRead?.();
          await firstMayFinish;
          return { status: "included", data: { name } };
        },
      },
      {
        namespace: "snapshot.second",
        schemaVersion: 1,
        async contribute(context) {
          return { status: "included", data: { name: await readName(context) } };
        },
      },
    ]);

    const generation = generatePersonalDataExport({
      sessionToken: graph.sessions[0]!.sessionToken,
      registry: snapshotRegistry,
    });
    await firstRead;
    await db.user.update({
      where: { id: graph.owner.id },
      data: { name: "concurrent update" },
    });
    releaseFirst?.();
    const result = await generation;

    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    expect(result.export.envelope.sections).toEqual({
      "snapshot.first": { schemaVersion: 1, data: { name: originalName } },
      "snapshot.second": { schemaVersion: 1, data: { name: originalName } },
    });
  });
});