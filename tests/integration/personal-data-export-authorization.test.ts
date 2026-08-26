// @vitest-environment node

import "dotenv/config";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
  getRequestLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const secret = "personal-data-export-integration-secret-32";
const origin = "https://app.example.test";
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
const originalEnv = new Map<string, string | undefined>();

type Database = (typeof import("@/lib/db"))["db"];
type ExportService = typeof import("@/modules/account/data-export/service");

async function installAuthorizationFailure(
  database: Database,
  sessionId: string,
) {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const functionName = `test_export_authorization_failure_${suffix}`;
  const triggerName = `test_export_authorization_trigger_${suffix}`;
  const escapedSessionId = sessionId.replaceAll("'", "''");

  await database.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
    BEGIN
      IF NEW."sessionId" = '${escapedSessionId}' THEN
        RAISE EXCEPTION 'injected export authorization failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await database.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE INSERT OR UPDATE ON "DataExportAuthorization"
    FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
  `);

  return async () => {
    await database.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "DataExportAuthorization"`,
    );
    await database.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${functionName}"()`,
    );
  };
}

describe.skipIf(!runIntegrationTests)("personal data export authorization", () => {
  let db: Database;
  let service: ExportService;
  let http: ReturnType<typeof createHttpMailProvider>;
  const scopes: Array<ReturnType<typeof createPersonalDataExportFixtureScope>> = [];

  beforeAll(async () => {
    for (const key of managedEnv) originalEnv.set(key, process.env[key]);
    Object.assign(process.env, {
      PROJECT_NAME: "Personal Data Export Test",
      AUTH_SECRET: secret,
      NEXTAUTH_URL: origin,
      MAIL_ENABLED: "true",
      MAIL_PROVIDER: "brevo",
      MAIL_API_KEY: "personal-data-export-provider-key",
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
    service = await import("@/modules/account/data-export/service");
  });

  afterEach(async () => {
    http.requests.splice(0);
    await Promise.all(scopes.splice(0).map((scope) => scope.cleanup(db)));
  });

  afterAll(async () => {
    await db?.$disconnect();
    vi.doUnmock("@/lib/email/http");
    for (const key of managedEnv) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function seedAccount(label: string) {
    const scope = createPersonalDataExportFixtureScope({
      label,
      now: new Date("2026-08-23T12:00:00.000Z"),
    });
    scopes.push(scope);
    const owner = scope.account();
    const initiating = scope.session(owner, { id: `${scope.scopeId}-initiating` });
    const consuming = scope.session(owner, { id: `${scope.scopeId}-consuming` });
    scope.exportCredential(owner);
    scope.rateLimitBuckets(owner, initiating);
    await db.user.create({ data: owner });
    await db.session.createMany({ data: [initiating, consuming] });
    return { scope, owner, initiating, consuming };
  }

  function capturedRawToken() {
    const body = http.requests.findLast(({ method }) => method === "POST")?.body;
    const token = body?.match(/token=([A-Za-z0-9_-]{43})/u)?.[1];
    if (!token) throw new Error("export credential was not captured");
    return token;
  }

  async function persistedCredential(
    owner: { normalizedEmail: string },
    issuedAt: Date,
    locale: "en" | "es" | "ca" = "en",
  ) {
    const { createPersonalDataExportCredential } = await import(
      "@/modules/account/data-export/token"
    );
    const credential = createPersonalDataExportCredential({ secret, issuedAt });
    await db.verificationToken.create({
      data: {
        identifier: owner.normalizedEmail,
        token: credential.persisted.token,
        expires: credential.persisted.expires,
        purpose: "ACCOUNT_DATA_EXPORT",
        locale,
        deliveredAt: issuedAt,
        createdAt: issuedAt,
      },
    });
    return credential;
  }

  it("delivers one purpose-specific credential and grants only the consuming same-account Session", async () => {
    const graph = await seedAccount("export-authorize");
    const beforeSessions = await db.session.findMany({
      where: { userId: graph.owner.id },
      select: { id: true, createdAt: true, authenticatedAt: true },
      orderBy: { id: "asc" },
    });

    await expect(
      service.issuePersonalDataExport({
        sessionToken: graph.initiating.sessionToken,
        locale: "es",
        origin,
        now: () => graph.scope.now,
      }),
    ).resolves.toEqual({ status: "sent" });
    const rawToken = capturedRawToken();
    await expect(
      db.verificationToken.findMany({
        where: {
          identifier: graph.owner.normalizedEmail,
          purpose: "ACCOUNT_DATA_EXPORT",
        },
        select: { locale: true, deliveredAt: true, expires: true },
      }),
    ).resolves.toEqual([
      {
        locale: "es",
        deliveredAt: graph.scope.now,
        expires: new Date(graph.scope.now.getTime() + 15 * 60_000),
      },
    ]);

    const confirmedAt = new Date(graph.scope.now.getTime() + 60_000);
    await expect(
      service.verifyPersonalDataExport({
        rawToken,
        sessionToken: graph.consuming.sessionToken,
        fallbackLocale: "ca",
        now: () => confirmedAt,
      }),
    ).resolves.toEqual({ status: "ready", locale: "es" });
    await expect(
      db.dataExportAuthorization.findMany(),
    ).resolves.toEqual([
      {
        sessionId: graph.consuming.id,
        confirmedAt,
        expiresAt: new Date(graph.scope.now.getTime() + 15 * 60_000),
      },
    ]);
    await expect(
      service.verifyPersonalDataExport({
        rawToken,
        sessionToken: graph.initiating.sessionToken,
        fallbackLocale: "es",
        now: () => confirmedAt,
      }),
    ).resolves.toEqual({ status: "invalid", locale: "es" });

    const afterSessions = await db.session.findMany({
      where: { userId: graph.owner.id },
      select: { id: true, createdAt: true, authenticatedAt: true },
      orderBy: { id: "asc" },
    });
    expect(afterSessions).toEqual(beforeSessions);
  });

  it("never accepts a credential belonging to another purpose", async () => {
    const graph = await seedAccount("export-purpose-isolation");
    const rawToken = Buffer.alloc(32, 13).toString("base64url");
    const { hashPersonalDataExportToken } = await import(
      "@/modules/account/data-export/token"
    );
    const token = hashPersonalDataExportToken(rawToken, secret);
    await db.verificationToken.create({
      data: {
        identifier: graph.owner.normalizedEmail,
        token,
        expires: new Date(graph.scope.now.getTime() + 15 * 60_000),
        purpose: "LOGIN",
      },
    });

    await expect(
      service.verifyPersonalDataExport({
        rawToken,
        sessionToken: graph.initiating.sessionToken,
        fallbackLocale: "ca",
        now: () => graph.scope.now,
      }),
    ).resolves.toEqual({ status: "invalid", locale: "ca" });
    await expect(
      db.verificationToken.count({ where: { token } }),
    ).resolves.toBe(1);
    await expect(db.dataExportAuthorization.count()).resolves.toBe(0);
  });

  it("compensates a rejected delivery without invalidating a prior delivered link", async () => {
    const graph = await seedAccount("export-delivery-compensation");
    const prior = await persistedCredential(
      graph.owner,
      new Date(graph.scope.now.getTime() - 60_000),
      "ca",
    );
    http.enqueue({ status: 503, body: "{}" });

    await expect(
      service.issuePersonalDataExport({
        sessionToken: graph.initiating.sessionToken,
        locale: "es",
        origin,
        now: () => graph.scope.now,
      }),
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      db.verificationToken.findMany({
        where: {
          identifier: graph.owner.normalizedEmail,
          purpose: "ACCOUNT_DATA_EXPORT",
        },
        select: { token: true, locale: true, deliveredAt: true },
      }),
    ).resolves.toEqual([
      { token: prior.persisted.token, locale: "ca", deliveredAt: new Date(graph.scope.now.getTime() - 60_000) },
    ]);
  });

  it("compensates a provider timeout without removing a prior delivered link", async () => {
    const graph = await seedAccount("export-delivery-timeout");
    const prior = await persistedCredential(
      graph.owner,
      new Date(graph.scope.now.getTime() - 60_000),
    );
    http.enqueue({ delayMs: 3_000, body: "{}" });

    await expect(
      service.issuePersonalDataExport({
        sessionToken: graph.initiating.sessionToken,
        locale: "es",
        origin,
        now: () => graph.scope.now,
      }),
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      db.verificationToken.findMany({
        where: {
          identifier: graph.owner.normalizedEmail,
          purpose: "ACCOUNT_DATA_EXPORT",
        },
        select: { token: true },
      }),
    ).resolves.toEqual([{ token: prior.persisted.token }]);
  });

  it("invalidates an older link only after a newer delivery succeeds", async () => {
    const graph = await seedAccount("export-delivery-supersession");
    await expect(
      service.issuePersonalDataExport({
        sessionToken: graph.initiating.sessionToken,
        locale: "en",
        origin,
        now: () => graph.scope.now,
      }),
    ).resolves.toEqual({ status: "sent" });
    const olderRawToken = capturedRawToken();

    await expect(
      service.issuePersonalDataExport({
        sessionToken: graph.initiating.sessionToken,
        locale: "ca",
        origin,
        now: () => new Date(graph.scope.now.getTime() + 1_000),
      }),
    ).resolves.toEqual({ status: "sent" });
    const newerRawToken = capturedRawToken();

    expect(newerRawToken).not.toBe(olderRawToken);
    await expect(
      service.verifyPersonalDataExport({
        rawToken: olderRawToken,
        sessionToken: graph.initiating.sessionToken,
        fallbackLocale: "es",
        now: () => new Date(graph.scope.now.getTime() + 2_000),
      }),
    ).resolves.toEqual({ status: "invalid", locale: "es" });
    await expect(
      service.verifyPersonalDataExport({
        rawToken: newerRawToken,
        sessionToken: graph.initiating.sessionToken,
        fallbackLocale: "en",
        now: () => new Date(graph.scope.now.getTime() + 2_000),
      }),
    ).resolves.toEqual({ status: "ready", locale: "ca" });
  });

  it("rejects malformed and expired credentials without consuming stored state", async () => {
    const graph = await seedAccount("export-invalid-credentials");
    const expired = await persistedCredential(graph.owner, graph.scope.now, "es");
    await db.verificationToken.update({
      where: { token: expired.persisted.token },
      data: { expires: graph.scope.now },
    });

    await expect(
      service.verifyPersonalDataExport({
        rawToken: "malformed",
        sessionToken: graph.initiating.sessionToken,
        fallbackLocale: "ca",
        now: () => graph.scope.now,
      }),
    ).resolves.toEqual({ status: "invalid", locale: "ca" });
    await expect(
      service.verifyPersonalDataExport({
        rawToken: expired.raw,
        sessionToken: graph.initiating.sessionToken,
        fallbackLocale: "ca",
        now: () => graph.scope.now,
      }),
    ).resolves.toEqual({
      status: "invalid",
      locale: "es",
      auditOutcome: "confirmation_expired",
    });
    await expect(
      db.verificationToken.count({ where: { token: expired.persisted.token } }),
    ).resolves.toBe(1);
    await expect(db.dataExportAuthorization.count()).resolves.toBe(0);
  });

  it("preserves a valid token for a different account or revoked Session", async () => {
    const graph = await seedAccount("export-ineligible-session");
    const foreign = await seedAccount("export-foreign-session");
    const credential = await persistedCredential(graph.owner, graph.scope.now, "es");

    await expect(
      service.verifyPersonalDataExport({
        rawToken: credential.raw,
        sessionToken: foreign.initiating.sessionToken,
        fallbackLocale: "ca",
        now: () => graph.scope.now,
      }),
    ).resolves.toEqual({ status: "invalid", locale: "es" });
    await db.session.delete({ where: { id: graph.initiating.id } });
    await expect(
      service.verifyPersonalDataExport({
        rawToken: credential.raw,
        sessionToken: graph.initiating.sessionToken,
        fallbackLocale: "ca",
        now: () => graph.scope.now,
      }),
    ).resolves.toEqual({ status: "invalid", locale: "es" });
    await expect(
      db.verificationToken.count({ where: { token: credential.persisted.token } }),
    ).resolves.toBe(1);
    await expect(db.dataExportAuthorization.count()).resolves.toBe(0);
  });

  it("allows only one concurrent confirmation to consume and grant", async () => {
    const graph = await seedAccount("export-concurrent-confirmation");
    const credential = await persistedCredential(graph.owner, graph.scope.now);

    const results = await Promise.all([
      service.verifyPersonalDataExport({
        rawToken: credential.raw,
        sessionToken: graph.initiating.sessionToken,
        fallbackLocale: "en",
        now: () => graph.scope.now,
      }),
      service.verifyPersonalDataExport({
        rawToken: credential.raw,
        sessionToken: graph.initiating.sessionToken,
        fallbackLocale: "en",
        now: () => graph.scope.now,
      }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual(["invalid", "ready"]);
    await expect(
      db.dataExportAuthorization.count({
        where: { sessionId: graph.initiating.id },
      }),
    ).resolves.toBe(1);
  });

  it("rolls back credential consumption when grant creation fails", async () => {
    const graph = await seedAccount("export-confirmation-rollback");
    const credential = await persistedCredential(graph.owner, graph.scope.now, "ca");
    const removeFailure = await installAuthorizationFailure(
      db,
      graph.initiating.id,
    );

    try {
      await expect(
        service.verifyPersonalDataExport({
          rawToken: credential.raw,
          sessionToken: graph.initiating.sessionToken,
          fallbackLocale: "en",
          now: () => graph.scope.now,
        }),
      ).resolves.toEqual({ status: "invalid", locale: "ca" });
    } finally {
      await removeFailure();
    }

    await expect(
      db.verificationToken.count({ where: { token: credential.persisted.token } }),
    ).resolves.toBe(1);
    await expect(
      db.dataExportAuthorization.findUnique({
        where: { sessionId: graph.initiating.id },
      }),
    ).resolves.toBeNull();
  });
});