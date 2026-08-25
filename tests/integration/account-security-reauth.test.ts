// @vitest-environment node

import "dotenv/config";

import { createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createAccountSecurityFixtureScope } from "../helpers/account-security";
import { createHttpMailProvider } from "../helpers/http-mail-provider";
import { getTestProjectName } from "../helpers/project-name";

vi.mock("server-only", () => ({}));

const loggerMocks = vi.hoisted(() => ({
  providerInfo: vi.fn(),
  providerWarn: vi.fn(),
  routeInfo: vi.fn(),
  routeWarn: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: loggerMocks.providerInfo,
    warn: loggerMocks.providerWarn,
    child: () => ({
      info: loggerMocks.providerInfo,
      warn: loggerMocks.providerWarn,
    }),
  },
  getRequestLogger: () => ({
    info: loggerMocks.routeInfo,
    warn: loggerMocks.routeWarn,
  }),
}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const secret = "account-security-integration-secret-32-chars";
const origin = "https://app.example.test";
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
] as const;

type Database = (typeof import("@/lib/db"))["db"];
type IssueReauthentication =
  (typeof import("@/modules/account/security/service"))["issueAccountSecurityReauthentication"];
type VerifyReauthentication =
  (typeof import("@/modules/account/security/service"))["verifyAccountSecurityReauthentication"];
type VerifyRoute =
  (typeof import("@/app/api/account/security/verify/route"))["GET"];

async function waitingAdvisoryLockCount(database: Database) {
  const [result] = await database.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM pg_locks
    WHERE "locktype" = 'advisory' AND NOT "granted"
  `;
  return result?.count ?? 0;
}

async function installSessionAuthenticationFailure(
  database: Database,
  sessionId: string,
) {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const functionName = `test_security_refresh_failure_${suffix}`;
  const triggerName = `test_security_refresh_trigger_${suffix}`;
  const escapedSessionId = sessionId.replaceAll("'", "''");

  await database.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'injected account security refresh failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await database.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE UPDATE OF "authenticatedAt" ON "Session"
    FOR EACH ROW WHEN (OLD."id" = '${escapedSessionId}')
    EXECUTE FUNCTION "${functionName}"()
  `);

  return async () => {
    await database.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "Session"`,
    );
    await database.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${functionName}"()`,
    );
  };
}

describe.skipIf(!runIntegrationTests)(
  "account security reauthentication integration",
  () => {
    let db: Database;
    let issueReauthentication: IssueReauthentication;
    let verifyReauthentication: VerifyReauthentication;
    let verifyRoute: VerifyRoute;
    let http: ReturnType<typeof createHttpMailProvider>;
    const scopes: Array<ReturnType<typeof createAccountSecurityFixtureScope>> = [];

    beforeAll(async () => {
      for (const key of managedEnv) originalEnv.set(key, process.env[key]);
      Object.assign(process.env, {
        PROJECT_NAME: getTestProjectName(),
        AUTH_SECRET: secret,
        NEXTAUTH_URL: origin,
        MAIL_ENABLED: "true",
        MAIL_PROVIDER: "brevo",
        MAIL_API_KEY: "account-security-integration-key",
        MAIL_API_SECRET: "",
        MAIL_FROM: "no-reply@example.test",
        BRAND_COLOR: "#0057B8",
        SUPPORT_EMAIL: "support@example.test",
        MAIL_LOGO_URL: "https://assets.example.test/mail/logo.png",
        TRUST_PROXY_HEADERS: "false",
      });
      vi.resetModules();
      http = createHttpMailProvider();
      vi.doMock("@/lib/email/http", async (importOriginal) => ({
        ...(await importOriginal<typeof import("@/lib/email/http")>()),
        nativeProviderHttpClient: http.client,
      }));
      db = (await import("@/lib/db")).db;
      const service = await import("@/modules/account/security/service");
      issueReauthentication = service.issueAccountSecurityReauthentication;
      verifyReauthentication = service.verifyAccountSecurityReauthentication;
      verifyRoute = (await import("@/app/api/account/security/verify/route")).GET;
    });

    beforeEach(() => {
      http.requests.splice(0);
      Object.values(loggerMocks).forEach((mock) => mock.mockReset());
    });

    afterEach(async () => {
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

    function createScope(label: string, now = new Date("2026-08-22T12:00:00.000Z")) {
      const scope = createAccountSecurityFixtureScope({ label, now });
      scopes.push(scope);
      return scope;
    }

    function trackAccountArtifacts(
      scope: ReturnType<typeof createAccountSecurityFixtureScope>,
      owner: ReturnType<ReturnType<typeof createAccountSecurityFixtureScope>["account"]>,
    ) {
      scope.verificationToken(owner);
      scope.addressBucket(owner);
    }

    async function seedActiveAccount(
      label: string,
      options: { sessionCount?: number; now?: Date } = {},
    ) {
      const scope = createScope(label, options.now);
      const owner = scope.account();
      trackAccountArtifacts(scope, owner);
      const current = scope.currentSession(owner, {
        authenticatedAt: new Date(scope.now.getTime() - 60 * 60_000),
      });
      const others = Array.from(
        { length: Math.max(0, (options.sessionCount ?? 2) - 1) },
        (_, index) =>
          scope.activeSession(owner, {
            id: `${scope.scopeId}-other-${String(index + 1).padStart(2, "0")}`,
            sessionToken: `${scope.scopeId}-other-token-${index + 1}`,
            createdAt: new Date(scope.now.getTime() - (index + 1) * 60_000),
          }),
      );
      await db.user.create({ data: owner });
      await db.session.createMany({ data: [current, ...others] });
      return { scope, owner, current, others };
    }

    function providerSubmissions() {
      return http.requests.filter((request) => request.method === "POST");
    }

    function capturedRawTokens() {
      return providerSubmissions().flatMap((request) => {
        const match = request.body?.match(/token=([A-Za-z0-9_-]{43})/u);
        return match?.[1] ? [match[1]] : [];
      });
    }

    function hashRawToken(rawToken: string) {
      return createHash("sha256")
        .update(`${rawToken}${secret}`)
        .digest("hex");
    }

    async function issue(
      graph: Awaited<ReturnType<typeof seedActiveAccount>>,
      locale: "en" | "es" | "ca" = "en",
    ) {
      return issueReauthentication({
        sessionToken: graph.current.sessionToken,
        locale,
        origin,
        now: () => graph.scope.now,
      });
    }

    it("enforces exactly three attempts per normalized address before delivery", async () => {
      const graph = await seedActiveAccount("security-address-limit");

      for (const locale of ["en", "es", "ca"] as const) {
        await expect(issue(graph, locale)).resolves.toEqual({ status: "sent" });
      }
      const blocked = await issue(graph, "en");

      expect(blocked).toEqual({
        status: "rate_limited",
        retryAfter: expect.any(Number),
      });
      expect(blocked.status === "rate_limited" && blocked.retryAfter).toBeGreaterThan(0);
      expect(providerSubmissions()).toHaveLength(3);
      for (const request of providerSubmissions()) {
        expect(request.body).toContain(graph.owner.email);
      }
      await expect(
        db.verificationToken.findMany({
          where: {
            identifier: graph.owner.normalizedEmail,
            purpose: "ACCOUNT_SECURITY",
          },
        }),
      ).resolves.toEqual([
        expect.objectContaining({ locale: "ca", deliveredAt: graph.scope.now }),
      ]);
    });

    it("persists a provisional credential and marks it delivered using one checkedAt", async () => {
      const graph = await seedActiveAccount("security-provisional");
      http.enqueue({ delayMs: 100, body: "{}" });
      const now = vi.fn(() => graph.scope.now);

      const issuance = issueReauthentication({
        sessionToken: graph.current.sessionToken,
        locale: "es",
        origin,
        now,
      });
      await vi.waitFor(async () => {
        expect(providerSubmissions()).toHaveLength(1);
        await expect(
          db.verificationToken.findFirst({
            where: {
              identifier: graph.owner.normalizedEmail,
              purpose: "ACCOUNT_SECURITY",
            },
            select: { deliveredAt: true },
          }),
        ).resolves.toEqual({ deliveredAt: null });
      });

      await expect(issuance).resolves.toEqual({ status: "sent" });
      expect(now).toHaveBeenCalledOnce();
      await expect(
        db.verificationToken.findFirst({
          where: {
            identifier: graph.owner.normalizedEmail,
            purpose: "ACCOUNT_SECURITY",
          },
        }),
      ).resolves.toMatchObject({
        locale: "es",
        createdAt: graph.scope.now,
        deliveredAt: graph.scope.now,
        expires: new Date(graph.scope.now.getTime() + 10 * 60_000),
      });
    });

    it("compensates only the failed provisional credential when a newer delivery supersedes it", async () => {
      const graph = await seedActiveAccount("security-compensation");
      http.enqueue({ status: 500, delayMs: 100, body: "{}" }, { body: "{}" });

      const first = issue(graph, "en");
      await vi.waitFor(() => expect(providerSubmissions()).toHaveLength(1));
      const second = issue(graph, "ca");

      await expect(second).resolves.toEqual({ status: "sent" });
      await expect(first).resolves.toEqual({ status: "unavailable" });
      const [firstRaw, secondRaw] = capturedRawTokens();
      expect(firstRaw).toBeTruthy();
      expect(secondRaw).toBeTruthy();
      await expect(
        db.verificationToken.findMany({
          where: {
            identifier: graph.owner.normalizedEmail,
            purpose: "ACCOUNT_SECURITY",
          },
          select: { token: true, locale: true, deliveredAt: true },
        }),
      ).resolves.toEqual([
        {
          token: hashRawToken(secondRaw!),
          locale: "ca",
          deliveredAt: graph.scope.now,
        },
      ]);
      await expect(
        db.verificationToken.count({ where: { token: hashRawToken(firstRaw!) } }),
      ).resolves.toBe(0);
    });

    it("invalidates a delivered credential when a later delivery supersedes it", async () => {
      const graph = await seedActiveAccount("security-superseded");
      await expect(issue(graph, "en")).resolves.toEqual({ status: "sent" });
      const firstRaw = capturedRawTokens().at(-1)!;
      await expect(issue(graph, "es")).resolves.toEqual({ status: "sent" });
      const secondRaw = capturedRawTokens().at(-1)!;

      expect(secondRaw).not.toBe(firstRaw);
      await expect(
        verifyReauthentication({
          rawToken: firstRaw,
          sessionToken: graph.current.sessionToken,
          now: () => graph.scope.now,
        }),
      ).resolves.toEqual({ status: "invalid_link", locale: "en" });
      await expect(
        db.verificationToken.findMany({
          where: {
            identifier: graph.owner.normalizedEmail,
            purpose: "ACCOUNT_SECURITY",
          },
          select: { token: true },
        }),
      ).resolves.toEqual([{ token: hashRawToken(secondRaw) }]);
      await expect(
        verifyReauthentication({
          rawToken: secondRaw,
          sessionToken: graph.current.sessionToken,
          now: () => graph.scope.now,
        }),
      ).resolves.toEqual({ status: "reauthenticated", locale: "es" });
    });

    it("does not consume an expired delivered credential", async () => {
      const graph = await seedActiveAccount("security-expired-token");
      await expect(issue(graph, "ca")).resolves.toEqual({ status: "sent" });
      const rawToken = capturedRawTokens().at(-1)!;
      await db.verificationToken.update({
        where: { token: hashRawToken(rawToken) },
        data: { expires: graph.scope.now },
      });

      await expect(
        verifyReauthentication({
          rawToken,
          sessionToken: graph.current.sessionToken,
          now: () => graph.scope.now,
        }),
      ).resolves.toEqual({ status: "invalid_link", locale: "ca" });
      await expect(
        db.verificationToken.count({ where: { token: hashRawToken(rawToken) } }),
      ).resolves.toBe(1);
      await expect(
        db.session.findUnique({
          where: { id: graph.current.id },
          select: { authenticatedAt: true },
        }),
      ).resolves.toEqual({ authenticatedAt: graph.current.authenticatedAt });
    });

    it.each(["same-device", "same-account-cross-device"] as const)(
      "consumes exactly once and refreshes only the %s session in place",
      async (mode) => {
        const graph = await seedActiveAccount(`security-consume-${mode}`);
        await expect(issue(graph, "es")).resolves.toEqual({ status: "sent" });
        const rawToken = capturedRawTokens().at(-1)!;
        const consuming =
          mode === "same-device" ? graph.current : graph.others[0]!;
        const before = await db.session.findMany({
          where: { userId: graph.owner.id },
          select: { id: true, createdAt: true, authenticatedAt: true },
          orderBy: { id: "asc" },
        });
        const consumedAt = new Date(graph.scope.now.getTime() + 60_000);

        await expect(
          verifyReauthentication({
            rawToken,
            sessionToken: consuming.sessionToken,
            now: () => consumedAt,
          }),
        ).resolves.toEqual({ status: "reauthenticated", locale: "es" });
        await expect(
          verifyReauthentication({
            rawToken,
            sessionToken: consuming.sessionToken,
            now: () => consumedAt,
          }),
        ).resolves.toEqual({ status: "invalid_link", locale: "en" });

        const after = await db.session.findMany({
          where: { userId: graph.owner.id },
          select: { id: true, createdAt: true, authenticatedAt: true },
          orderBy: { id: "asc" },
        });
        expect(after).toHaveLength(before.length);
        expect(after.map(({ id, createdAt }) => ({ id, createdAt }))).toEqual(
          before.map(({ id, createdAt }) => ({ id, createdAt })),
        );
        for (const row of after) {
          const previous = before.find(({ id }) => id === row.id)!;
          expect(row.authenticatedAt).toEqual(
            row.id === consuming.id ? consumedAt : previous.authenticatedAt,
          );
        }
        await expect(
          db.verificationToken.count({ where: { token: hashRawToken(rawToken) } }),
        ).resolves.toBe(0);
      },
    );

    it("serializes two callback consumers and refreshes the session once", async () => {
      const graph = await seedActiveAccount("security-concurrent-callback");
      await expect(issue(graph, "en")).resolves.toEqual({ status: "sent" });
      const rawToken = capturedRawTokens().at(-1)!;
      const checkedAt = new Date(graph.scope.now.getTime() + 60_000);
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is required");
      const coordinator = new Client({ connectionString });
      const waitingBefore = await waitingAdvisoryLockCount(db);
      let first: ReturnType<VerifyReauthentication> | undefined;
      let second: ReturnType<VerifyReauthentication> | undefined;

      await coordinator.connect();
      try {
        await coordinator.query(
          "SELECT pg_advisory_lock(hashtextextended($1, 0))",
          [graph.owner.normalizedEmail],
        );
        first = verifyReauthentication({
          rawToken,
          sessionToken: graph.current.sessionToken,
          now: () => checkedAt,
        });
        second = verifyReauthentication({
          rawToken,
          sessionToken: graph.current.sessionToken,
          now: () => checkedAt,
        });
        await vi.waitFor(
          async () => {
            expect(await waitingAdvisoryLockCount(db)).toBeGreaterThanOrEqual(
              waitingBefore + 2,
            );
          },
          { timeout: 5_000, interval: 10 },
        );
      } finally {
        await coordinator.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [graph.owner.normalizedEmail],
        );
        await Promise.allSettled([
          first ?? Promise.resolve(),
          second ?? Promise.resolve(),
        ]);
        await coordinator.end();
      }

      const results = await Promise.all([first!, second!]);
      expect(results.map(({ status }) => status).sort()).toEqual([
        "invalid_link",
        "reauthenticated",
      ]);
      await expect(
        db.verificationToken.count({ where: { token: hashRawToken(rawToken) } }),
      ).resolves.toBe(0);
      await expect(
        db.session.findUnique({
          where: { id: graph.current.id },
          select: { authenticatedAt: true },
        }),
      ).resolves.toEqual({ authenticatedAt: checkedAt });
    });

    it("rolls back token consumption when the in-place freshness update fails", async () => {
      const graph = await seedActiveAccount("security-callback-rollback");
      await expect(issue(graph, "es")).resolves.toEqual({ status: "sent" });
      const rawToken = capturedRawTokens().at(-1)!;
      const checkedAt = new Date(graph.scope.now.getTime() + 60_000);
      const removeFailure = await installSessionAuthenticationFailure(
        db,
        graph.current.id,
      );

      try {
        await expect(
          verifyReauthentication({
            rawToken,
            sessionToken: graph.current.sessionToken,
            now: () => checkedAt,
          }),
        ).resolves.toEqual({ status: "invalid_link", locale: "es" });
      } finally {
        await removeFailure();
      }

      await expect(
        db.verificationToken.count({ where: { token: hashRawToken(rawToken) } }),
      ).resolves.toBe(1);
      await expect(
        db.session.findUnique({
          where: { id: graph.current.id },
          select: { authenticatedAt: true },
        }),
      ).resolves.toEqual({ authenticatedAt: graph.current.authenticatedAt });
      await expect(
        verifyReauthentication({
          rawToken,
          sessionToken: graph.current.sessionToken,
          now: () => checkedAt,
        }),
      ).resolves.toEqual({ status: "reauthenticated", locale: "es" });
    });

    it.each([
      ["signed-out", "invalid_link"],
      ["expired-session", "invalid_link"],
      ["inactive-account", "invalid_link"],
      ["conflicting-account", "session_conflict"],
    ] as const)(
      "does not consume a valid token for an ineligible %s callback",
      async (kind, expectedStatus) => {
        const graph = await seedActiveAccount(`security-ineligible-${kind}`);
        await expect(issue(graph, "ca")).resolves.toEqual({ status: "sent" });
        const rawToken = capturedRawTokens().at(-1)!;
        const beforeAuthentication = graph.current.authenticatedAt;
        let sessionToken: string | null = graph.current.sessionToken;

        if (kind === "signed-out") {
          sessionToken = null;
        } else if (kind === "expired-session") {
          await db.session.update({
            where: { id: graph.current.id },
            data: { expires: graph.scope.now },
          });
        } else if (kind === "inactive-account") {
          await db.user.update({
            where: { id: graph.owner.id },
            data: { status: "PENDING" },
          });
        } else {
          const conflictingOwner = graph.scope.account();
          trackAccountArtifacts(graph.scope, conflictingOwner);
          const conflictingSession = graph.scope.currentSession(
            conflictingOwner,
            {
              id: `${graph.scope.scopeId}-conflicting-current`,
              sessionToken: `${graph.scope.scopeId}-conflicting-token`,
            },
          );
          await db.user.create({ data: conflictingOwner });
          await db.session.create({ data: conflictingSession });
          sessionToken = conflictingSession.sessionToken;
        }

        await expect(
          verifyReauthentication({
            rawToken,
            sessionToken,
            now: () => new Date(graph.scope.now.getTime() + 1),
          }),
        ).resolves.toEqual({ status: expectedStatus, locale: "ca" });
        await expect(
          db.verificationToken.count({ where: { token: hashRawToken(rawToken) } }),
        ).resolves.toBe(1);
        await expect(
          db.session.findUnique({
            where: { id: graph.current.id },
            select: { authenticatedAt: true },
          }),
        ).resolves.toEqual({ authenticatedAt: beforeAuthentication });
      },
    );

    it("keeps LOGIN, SIGNUP, and ACCOUNT_DELETION credentials purpose-isolated", async () => {
      const graph = await seedActiveAccount("security-purpose-isolation");
      const credentials = (["LOGIN", "SIGNUP", "ACCOUNT_DELETION"] as const).map(
        (purpose, index) => {
          const raw = Buffer.alloc(32, index + 11).toString("base64url");
          return {
            raw,
            record: graph.scope.verificationToken(graph.owner, purpose, {
              token: hashRawToken(raw),
            }),
          };
        },
      );
      await db.verificationToken.createMany({
        data: credentials.map(({ record }) => record),
      });

      for (const credential of credentials) {
        await expect(
          verifyReauthentication({
            rawToken: credential.raw,
            sessionToken: graph.current.sessionToken,
            now: () => graph.scope.now,
          }),
        ).resolves.toEqual({ status: "invalid_link", locale: "en" });
      }
      await expect(
        db.verificationToken.count({
          where: {
            identifier: graph.owner.normalizedEmail,
            purpose: { in: ["LOGIN", "SIGNUP", "ACCOUNT_DELETION"] },
          },
        }),
      ).resolves.toBe(3);

      await expect(issue(graph, "en")).resolves.toEqual({ status: "sent" });
      await expect(
        db.verificationToken.count({
          where: {
            identifier: graph.owner.normalizedEmail,
            purpose: { in: ["LOGIN", "SIGNUP", "ACCOUNT_DELETION"] },
          },
        }),
      ).resolves.toBe(3);
    });

    it("keeps the exact 20-session set and emits no Set-Cookie on callback", async () => {
      const graph = await seedActiveAccount("security-cap-callback", {
        sessionCount: 20,
        now: new Date(),
      });
      await expect(issue(graph, "ca")).resolves.toEqual({ status: "sent" });
      const rawToken = capturedRawTokens().at(-1)!;
      const before = await db.session.findMany({
        where: { userId: graph.owner.id },
        select: { id: true, createdAt: true, authenticatedAt: true },
        orderBy: { id: "asc" },
      });

      const response = await verifyRoute(
        new NextRequest(
          `${origin}/api/account/security/verify?token=${rawToken}`,
          {
            headers: {
              cookie: `next-auth.session-token=${graph.current.sessionToken}`,
              host: "app.example.test",
            },
          },
        ),
      );

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `${origin}/ca/account/security?state=reauthenticated`,
      );
      expect(response.headers.getSetCookie()).toEqual([]);
      const after = await db.session.findMany({
        where: { userId: graph.owner.id },
        select: { id: true, createdAt: true, authenticatedAt: true },
        orderBy: { id: "asc" },
      });
      expect(after).toHaveLength(20);
      expect(after.map(({ id, createdAt }) => ({ id, createdAt }))).toEqual(
        before.map(({ id, createdAt }) => ({ id, createdAt })),
      );
      for (const row of after) {
        const previous = before.find(({ id }) => id === row.id)!;
        if (row.id === graph.current.id) {
          expect(row.authenticatedAt!.getTime()).toBeGreaterThan(
            previous.authenticatedAt!.getTime(),
          );
        } else {
          expect(row.authenticatedAt).toEqual(previous.authenticatedAt);
        }
      }
    });
  },
);