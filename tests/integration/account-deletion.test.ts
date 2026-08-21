// @vitest-environment node

import "dotenv/config";

import { createHash } from "node:crypto";

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccountDeletionFixtureScope } from "../helpers/account-deletion";

vi.mock("server-only", () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  infrastructureWarn: vi.fn(),
  databaseWarn: vi.fn(),
  databaseError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: loggerMocks.infrastructureWarn,
    child: () => ({
      warn: loggerMocks.databaseWarn,
      error: loggerMocks.databaseError,
    }),
  },
  getRequestLogger: () => ({ info: loggerMocks.info, warn: loggerMocks.warn }),
}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

const failureStages = [
  ["policy", "PolicyAcceptance", (graph: SeededGraph) => `OLD."userId" = '${graph.owner.id}'`],
  ["token", "VerificationToken", (graph: SeededGraph) => `OLD."identifier" = '${graph.owner.normalizedEmail}'`],
  ["address bucket", "RateLimitBucket", (graph: SeededGraph) => `OLD."key" = '${graph.buckets[0]!.key}'`],
  ["account cascade", "Account", (graph: SeededGraph) => `OLD."userId" = '${graph.owner.id}'`],
  ["session cascade", "Session", (graph: SeededGraph) => `OLD."userId" = '${graph.owner.id}'`],
  ["user", "User", (graph: SeededGraph) => `OLD."id" = '${graph.owner.id}'`],
] as const;

type SeededGraph = Awaited<
  ReturnType<ReturnType<typeof createAccountDeletionFixtureScope>["seedFullGraph"]>
>;

async function readTargetedGraph(database: typeof import("@/lib/db").db, graph: SeededGraph) {
  const userId = graph.owner.id;
  const identifier = graph.owner.normalizedEmail;
  const addressKey = graph.buckets[0]!.key;
  const [users, accounts, sessions, acceptances, tokens, addressBuckets] =
    await Promise.all([
      database.user.count({ where: { id: userId } }),
      database.account.count({ where: { userId } }),
      database.session.count({ where: { userId } }),
      database.policyAcceptance.count({ where: { userId } }),
      database.verificationToken.count({ where: { identifier } }),
      database.rateLimitBucket.count({ where: { key: addressKey } }),
    ]);
  return { users, accounts, sessions, acceptances, tokens, addressBuckets };
}

async function installFailureTrigger(
  database: typeof import("@/lib/db").db,
  table: string,
  condition: string,
  suffix: string,
) {
  const safeSuffix = suffix.replaceAll("-", "_");
  const functionName = `test_account_deletion_failure_${safeSuffix}`;
  const triggerName = `test_account_deletion_trigger_${safeSuffix}`;
  await database.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'injected account deletion failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await database.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE DELETE ON "${table}"
    FOR EACH ROW WHEN (${condition})
    EXECUTE FUNCTION "${functionName}"()
  `);
  return async () => {
    await database.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS "${triggerName}" ON "${table}"`,
    );
    await database.$executeRawUnsafe(
      `DROP FUNCTION IF EXISTS "${functionName}"()`,
    );
  };
}

async function getWaitingAdvisoryLockCount(
  database: typeof import("@/lib/db").db,
) {
  const [result] = await database.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM pg_locks
    WHERE "locktype" = 'advisory' AND NOT "granted"
  `;
  return result?.count ?? 0;
}

async function waitForWaitingAdvisoryLocks(
  database: typeof import("@/lib/db").db,
  minimum: number,
) {
  await vi.waitFor(
    async () => {
      expect(await getWaitingAdvisoryLockCount(database)).toBeGreaterThanOrEqual(
        minimum,
      );
    },
    { timeout: 5_000, interval: 10 },
  );
}

async function installDeletionBarrier(
  database: typeof import("@/lib/db").db,
  userId: string,
) {
  if (!/^[A-Za-z0-9_-]+$/u.test(userId)) {
    throw new Error("invalid account deletion fixture user id");
  }
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const functionName = `test_account_deletion_barrier_${suffix}`;
  const triggerName = `test_account_deletion_barrier_trigger_${suffix}`;
  const barrierKey = Math.floor(Math.random() * 1_000_000_000) + 1;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const coordinator = new Client({ connectionString });
  let released = false;

  await database.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_advisory_xact_lock(${barrierKey}::bigint);
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql
  `);
  await database.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE DELETE ON "User"
    FOR EACH ROW WHEN (OLD."id" = '${userId}')
    EXECUTE FUNCTION "${functionName}"()
  `);
  await coordinator.connect();
  await coordinator.query("SELECT pg_advisory_lock($1::bigint)", [barrierKey]);

  const release = async () => {
    if (released) return;
    released = true;
    await coordinator.query("SELECT pg_advisory_unlock($1::bigint)", [
      barrierKey,
    ]);
  };

  return {
    release,
    cleanup: async () => {
      await release();
      await database.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "User"`,
      );
      await database.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS "${functionName}"()`,
      );
      await coordinator.end();
    },
  };
}

function createDeletionRequest(options: {
  origin: string;
  secret: string;
  sessionToken: string;
}) {
  const csrfToken = crypto.randomUUID();
  const csrfHash = createHash("sha256")
    .update(`${csrfToken}${options.secret}`)
    .digest("hex");
  const csrfCookie = encodeURIComponent(`${csrfToken}|${csrfHash}`);

  return {
    csrfToken,
    request: new NextRequest(`${options.origin}/api/account/deletion`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `next-auth.session-token=${options.sessionToken}; next-auth.csrf-token=${csrfCookie}`,
        host: new URL(options.origin).host,
        origin: options.origin,
      },
      body: JSON.stringify({
        csrfToken,
        locale: "en",
        confirmation: "permanently_delete",
      }),
    }),
  };
}

describe.skipIf(!runIntegrationTests)("permanent account deletion integration", () => {
  const scopes: Array<ReturnType<typeof createAccountDeletionFixtureScope>> = [];

  beforeEach(() => {
    Object.values(loggerMocks).forEach((mock) => mock.mockReset());
  });

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    await Promise.all(scopes.splice(0).map((scope) => scope.cleanup(db)));
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.$disconnect();
  });

  it("removes the complete account graph and only its address bucket atomically", async () => {
    const { db } = await import("@/lib/db");
    const { deleteCurrentAccount } = await import(
      "@/modules/account/deletion/service"
    );
    const scope = createAccountDeletionFixtureScope();
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const addressBucket = graph.buckets[0]!;
    const retainedClientKeys = graph.buckets.slice(1).map((bucket) => bucket.key);

    await expect(
      deleteCurrentAccount({ sessionToken: graph.sessions[0]!.sessionToken }),
    ).resolves.toEqual({ status: "completed" });

    await expect(db.user.count({ where: { id: graph.owner.id } })).resolves.toBe(0);
    await expect(db.account.count({ where: { userId: graph.owner.id } })).resolves.toBe(0);
    await expect(db.session.count({ where: { userId: graph.owner.id } })).resolves.toBe(0);
    await expect(
      db.policyAcceptance.count({ where: { userId: graph.owner.id } }),
    ).resolves.toBe(0);
    await expect(
      db.verificationToken.count({
        where: { identifier: graph.owner.normalizedEmail },
      }),
    ).resolves.toBe(0);
    await expect(
      db.rateLimitBucket.count({ where: { key: addressBucket.key } }),
    ).resolves.toBe(0);
    await expect(
      db.rateLimitBucket.count({ where: { key: { in: retainedClientKeys } } }),
    ).resolves.toBe(retainedClientKeys.length);
  });

  it.each([
    ["committed", false, 200, "info", "delete_completed"],
    ["rolled back", true, 500, "warn", "delete_failed"],
  ] as const)(
    "emits only sanitized outcome metadata when deletion is %s",
    async (_case, rollback, expectedStatus, level, outcome) => {
      const { db } = await import("@/lib/db");
      const { getEnv } = await import("@/lib/env");
      const { POST } = await import("@/app/api/account/deletion/route");
      const scope = createAccountDeletionFixtureScope();
      scopes.push(scope);
      const graph = await scope.seedFullGraph(db);
      scope.clientBucket("final", "untrusted-direct-client");
      const env = getEnv();
      const { csrfToken, request } = createDeletionRequest({
        origin: new URL(env.NEXTAUTH_URL).origin,
        secret: env.AUTH_SECRET,
        sessionToken: graph.sessions[0]!.sessionToken,
      });
      const removeFailure = rollback
        ? await installFailureTrigger(
            db,
            "User",
            `OLD."id" = '${graph.owner.id}'`,
            crypto.randomUUID(),
          )
        : undefined;

      let response: Response;
      try {
        response = await POST(request);
      } finally {
        await removeFailure?.();
      }

      expect(response.status).toBe(expectedStatus);
      const targetLogger = loggerMocks[level];
      expect(targetLogger).toHaveBeenCalledWith(
        { outcome, durationMs: expect.any(Number) },
        "account deletion completed",
      );
      const serializedLogs = JSON.stringify([
        ...loggerMocks.info.mock.calls,
        ...loggerMocks.warn.mock.calls,
      ]);
      for (const sensitiveValue of [
        graph.owner.id,
        graph.owner.email,
        graph.owner.normalizedEmail,
        graph.sessions[0]!.sessionToken,
        csrfToken,
        "injected account deletion failure",
      ]) {
        expect(serializedLogs).not.toContain(sensitiveValue);
      }
    },
  );

  it.each(failureStages)(
    "rolls back the complete graph after an injected %s-stage failure and retries",
    async (_stage, table, conditionFor) => {
      const { db } = await import("@/lib/db");
      const { deleteCurrentAccount } = await import(
        "@/modules/account/deletion/service"
      );
      const scope = createAccountDeletionFixtureScope();
      scopes.push(scope);
      const graph = await scope.seedFullGraph(db);
      const before = await readTargetedGraph(db, graph);
      const removeTrigger = await installFailureTrigger(
        db,
        table,
        conditionFor(graph),
        crypto.randomUUID(),
      );

      try {
        await expect(
          deleteCurrentAccount({ sessionToken: graph.sessions[0]!.sessionToken }),
        ).resolves.toEqual({ status: "deletion_failed" });
      } finally {
        await removeTrigger();
      }

      await expect(readTargetedGraph(db, graph)).resolves.toEqual(before);
      await expect(
        deleteCurrentAccount({ sessionToken: graph.sessions[0]!.sessionToken }),
      ).resolves.toEqual({ status: "completed" });
      await expect(db.user.count({ where: { id: graph.owner.id } })).resolves.toBe(0);
    },
  );

  it("converges two confirmations authorized before the deletion lock", async () => {
    const { db } = await import("@/lib/db");
    const { deleteCurrentAccount } = await import(
      "@/modules/account/deletion/service"
    );
    const scope = createAccountDeletionFixtureScope();
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const sessionToken = graph.sessions[0]!.sessionToken;

    const results = await Promise.all([
      deleteCurrentAccount({ sessionToken }),
      deleteCurrentAccount({ sessionToken }),
    ]);
    expect(results.map(({ status }) => status).sort()).toEqual([
      "completed",
      "concurrent_completed",
    ]);
    await expect(db.user.count({ where: { id: graph.owner.id } })).resolves.toBe(0);

    await expect(deleteCurrentAccount({ sessionToken })).resolves.toEqual({
      status: "unauthenticated",
    });
  });

  it.each(["session", "login token"] as const)(
    "leaves no attributable %s created concurrently with deletion",
    async (createdKind) => {
      const { hardenAdapter } = await import("@/lib/auth-adapter");
      const { db } = await import("@/lib/db");
      const { deleteCurrentAccount } = await import(
        "@/modules/account/deletion/service"
      );
      const scope = createAccountDeletionFixtureScope();
      scopes.push(scope);
      const graph = await scope.seedFullGraph(db);
      const adapter = hardenAdapter(PrismaAdapter(db));
      const waitingBefore = await getWaitingAdvisoryLockCount(db);
      const barrier = await installDeletionBarrier(db, graph.owner.id);
      let deletion:
        | Promise<Awaited<ReturnType<typeof deleteCurrentAccount>>>
        | undefined;
      let creation: Promise<unknown> | undefined;
      let results: PromiseSettledResult<unknown>[] = [];

      try {
        deletion = deleteCurrentAccount({
          sessionToken: graph.sessions[0]!.sessionToken,
        });
        await waitForWaitingAdvisoryLocks(db, waitingBefore + 1);
        creation = Promise.resolve(
          createdKind === "session"
            ? adapter.createSession!({
                sessionToken: crypto.randomUUID(),
                userId: graph.owner.id,
                expires: new Date(Date.now() + 60_000),
              })
            : adapter.createVerificationToken!({
                identifier: graph.owner.normalizedEmail,
                token: crypto.randomUUID(),
                expires: new Date(Date.now() + 60_000),
              }),
        );
        await waitForWaitingAdvisoryLocks(db, waitingBefore + 2);
        await barrier.release();
        results = await Promise.allSettled([deletion, creation]);
      } finally {
        await barrier.release();
        await Promise.allSettled(
          [deletion, creation].filter(
            (operation): operation is Promise<unknown> => operation !== undefined,
          ),
        );
        await barrier.cleanup();
      }

      const [deletionResult, creationResult] = results;

      expect(deletionResult).toEqual({
        status: "fulfilled",
        value: { status: "completed" },
      });
      expect(creationResult?.status).toBe("rejected");
      await expect(db.user.count({ where: { id: graph.owner.id } })).resolves.toBe(0);
      await expect(
        db.session.count({ where: { userId: graph.owner.id } }),
      ).resolves.toBe(0);
      await expect(
        db.verificationToken.count({
          where: { identifier: graph.owner.normalizedEmail },
        }),
      ).resolves.toBe(0);
    },
  );
});