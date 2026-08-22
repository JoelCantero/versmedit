// @vitest-environment node

import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { NextRequest } from "next/server";
import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createAccountSecurityFixtureScope } from "../helpers/account-security";

vi.mock("server-only", () => ({}));

const loggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: loggerMocks.info,
    warn: loggerMocks.warn,
    child: () => ({ info: loggerMocks.info, warn: loggerMocks.warn }),
  },
  getRequestLogger: () => ({
    info: loggerMocks.info,
    warn: loggerMocks.warn,
  }),
}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

async function waitingAdvisoryLockCount(
  database: typeof import("@/lib/db").db,
) {
  const [result] = await database.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS "count"
    FROM pg_locks
    WHERE "locktype" = 'advisory' AND NOT "granted"
  `;
  return result?.count ?? 0;
}

async function installSessionDeleteFailure(
  database: typeof import("@/lib/db").db,
  sessionId: string,
) {
  const suffix = randomUUID().replaceAll("-", "");
  const functionName = `test_account_security_failure_${suffix}`;
  const triggerName = `test_account_security_trigger_${suffix}`;
  const escapedSessionId = sessionId.replaceAll("'", "''");

  await database.$executeRawUnsafe(`
    CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'injected account security failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await database.$executeRawUnsafe(`
    CREATE TRIGGER "${triggerName}"
    BEFORE DELETE ON "Session"
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

async function seedRevocationGraph(
  database: typeof import("@/lib/db").db,
  scope: ReturnType<typeof createAccountSecurityFixtureScope>,
  authenticatedAt: Date | null = scope.now,
) {
  const owner = scope.account();
  const foreignOwner = scope.account();
  const current = scope.currentSession(owner, {
    createdAt: new Date(scope.now.getTime() - 60_000),
    authenticatedAt,
  });
  const target = scope.activeSession(owner, {
    id: `${scope.scopeId}-target`,
    sessionToken: `${scope.scopeId}-target-token`,
  });
  const sibling = scope.activeSession(owner, {
    id: `${scope.scopeId}-sibling`,
    sessionToken: `${scope.scopeId}-sibling-token`,
  });
  const expired = scope.expiredSession(owner, {
    id: `${scope.scopeId}-expired`,
    sessionToken: `${scope.scopeId}-expired-token`,
  });
  const foreign = scope.activeSession(foreignOwner, {
    id: `${scope.scopeId}-foreign`,
    sessionToken: `${scope.scopeId}-foreign-token`,
  });

  await database.user.createMany({ data: [owner, foreignOwner] });
  await database.session.createMany({
    data: [current, target, sibling, expired, foreign],
  });

  return { owner, foreignOwner, current, target, sibling, expired, foreign };
}

describe.skipIf(!runIntegrationTests)("account security integration", () => {
  const scopes: Array<ReturnType<typeof createAccountSecurityFixtureScope>> = [];

  beforeEach(() => {
    loggerMocks.info.mockReset();
    loggerMocks.warn.mockReset();
  });

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    await Promise.all(scopes.splice(0).map((scope) => scope.cleanup(db)));
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.$disconnect();
  });

  it("lists only owned active sessions with current first and immutable ordering", async () => {
    const { db } = await import("@/lib/db");
    const { listActiveAccountSessions } = await import(
      "@/modules/account/security/service"
    );
    const scope = createAccountSecurityFixtureScope({ label: "security-list" });
    scopes.push(scope);
    const owner = scope.account();
    const foreignOwner = scope.account();
    const current = scope.currentSession(owner, {
      createdAt: new Date(scope.now.getTime() - 60 * 60_000),
    });
    const newest = scope.activeSession(owner, {
      id: `${scope.scopeId}-newest`,
      createdAt: new Date(scope.now.getTime() - 60_000),
    });
    const equalLow = scope.activeSession(owner, {
      id: `${scope.scopeId}-equal-a`,
      createdAt: new Date(scope.now.getTime() - 5 * 60_000),
    });
    const equalHigh = scope.activeSession(owner, {
      id: `${scope.scopeId}-equal-z`,
      createdAt: new Date(scope.now.getTime() - 5 * 60_000),
    });
    const legacy = scope.legacyNullSession(owner, {
      id: `${scope.scopeId}-legacy`,
    });
    const expired = scope.expiredSession(owner);
    const foreign = scope.activeSession(foreignOwner);

    await db.user.createMany({ data: [owner, foreignOwner] });
    await db.session.createMany({
      data: [current, newest, equalLow, equalHigh, legacy, expired, foreign],
    });

    const sessions = await listActiveAccountSessions({
      sessionToken: current.sessionToken,
      now: () => scope.now,
    });

    expect(sessions).toEqual([
      {
        sessionId: current.id,
        createdAt: current.createdAt!.toISOString(),
        expires: current.expires.toISOString(),
        current: true,
        ordinal: 1,
      },
      {
        sessionId: newest.id,
        createdAt: newest.createdAt!.toISOString(),
        expires: newest.expires.toISOString(),
        current: false,
        ordinal: 2,
      },
      {
        sessionId: equalHigh.id,
        createdAt: equalHigh.createdAt!.toISOString(),
        expires: equalHigh.expires.toISOString(),
        current: false,
        ordinal: 3,
      },
      {
        sessionId: equalLow.id,
        createdAt: equalLow.createdAt!.toISOString(),
        expires: equalLow.expires.toISOString(),
        current: false,
        ordinal: 4,
      },
      {
        sessionId: legacy.id,
        createdAt: null,
        expires: legacy.expires.toISOString(),
        current: false,
        ordinal: 5,
      },
    ]);
    for (const session of sessions ?? []) {
      expect(Object.keys(session).sort()).toEqual([
        "createdAt",
        "current",
        "expires",
        "ordinal",
        "sessionId",
      ]);
    }
    const serialized = JSON.stringify(sessions);
    for (const forbiddenValue of [
      owner.id,
      owner.email,
      owner.normalizedEmail,
      current.sessionToken,
      foreign.id,
      foreign.sessionToken,
    ]) {
      expect(serialized).not.toContain(forbiddenValue);
    }
  });

  it("returns at most 20 rows while retaining an old exact current session", async () => {
    const { db } = await import("@/lib/db");
    const { listActiveAccountSessions } = await import(
      "@/modules/account/security/service"
    );
    const scope = createAccountSecurityFixtureScope({ label: "security-limit" });
    scopes.push(scope);
    const owner = scope.account();
    const current = scope.currentSession(owner, {
      createdAt: new Date(scope.now.getTime() - 24 * 60 * 60_000),
    });
    const others = Array.from({ length: 21 }, (_, index) =>
      scope.activeSession(owner, {
        id: `${scope.scopeId}-other-${String(index + 1).padStart(2, "0")}`,
        sessionToken: `${scope.scopeId}-other-token-${index + 1}`,
        createdAt: new Date(scope.now.getTime() - (index + 1) * 60_000),
      }),
    );

    await db.user.create({ data: owner });
    await db.session.createMany({ data: [current, ...others] });

    const sessions = await listActiveAccountSessions({
      sessionToken: current.sessionToken,
      now: () => scope.now,
    });

    expect(sessions).toHaveLength(20);
    expect(sessions?.[0]).toMatchObject({ sessionId: current.id, current: true });
    expect(sessions?.slice(1).map(({ sessionId }) => sessionId)).toEqual(
      others.slice(0, 19).map(({ id }) => id),
    );
  });

  it("waits for the user advisory lock and immediately invalidates only the target", async () => {
    const { db } = await import("@/lib/db");
    const { resolveActiveAccountSession } = await import(
      "@/modules/account/session"
    );
    const { revokeAccountSession } = await import(
      "@/modules/account/security/service"
    );
    const scope = createAccountSecurityFixtureScope({ label: "security-revoke" });
    scopes.push(scope);
    const graph = await seedRevocationGraph(db, scope);
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const coordinator = new Client({ connectionString });
    let revocation: ReturnType<typeof revokeAccountSession> | undefined;

    await coordinator.connect();
    try {
      await coordinator.query(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        [graph.owner.id],
      );
      const waitingBefore = await waitingAdvisoryLockCount(db);
      revocation = revokeAccountSession({
        sessionToken: graph.current.sessionToken,
        sessionId: graph.target.id,
        now: () => scope.now,
      });
      await vi.waitFor(
        async () => {
          expect(await waitingAdvisoryLockCount(db)).toBeGreaterThanOrEqual(
            waitingBefore + 1,
          );
        },
        { timeout: 5_000, interval: 10 },
      );
      await expect(
        db.session.count({ where: { id: graph.target.id } }),
      ).resolves.toBe(1);
    } finally {
      await coordinator.query(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        [graph.owner.id],
      );
      await revocation?.catch(() => undefined);
      await coordinator.end();
    }

    await expect(revocation).resolves.toEqual({ status: "completed" });
    await expect(
      db.session.findMany({
        where: { userId: graph.owner.id },
        select: { id: true },
        orderBy: { id: "asc" },
      }),
    ).resolves.toEqual(
      [graph.current, graph.expired, graph.sibling]
        .map(({ id }) => ({ id }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
    await expect(
      resolveActiveAccountSession(graph.target.sessionToken, scope.now),
    ).resolves.toBeNull();
    await expect(
      resolveActiveAccountSession(graph.current.sessionToken, scope.now),
    ).resolves.toEqual(expect.objectContaining({ sessionId: graph.current.id }));
    await expect(
      resolveActiveAccountSession(graph.sibling.sessionToken, scope.now),
    ).resolves.toEqual(expect.objectContaining({ sessionId: graph.sibling.id }));
  });

  it.each(["missing", "expired", "current", "foreign", "already-deleted"])(
    "returns the same completed no-op for a %s selector",
    async (targetState) => {
      const { db } = await import("@/lib/db");
      const { revokeAccountSession } = await import(
        "@/modules/account/security/service"
      );
      const scope = createAccountSecurityFixtureScope({
        label: `security-noop-${targetState}`,
      });
      scopes.push(scope);
      const graph = await seedRevocationGraph(db, scope);
      const sessionId =
        targetState === "missing"
          ? `${scope.scopeId}-missing`
          : targetState === "expired"
            ? graph.expired.id
            : targetState === "current"
              ? graph.current.id
              : targetState === "foreign"
                ? graph.foreign.id
                : graph.target.id;
      if (targetState === "already-deleted") {
        await db.session.delete({ where: { id: graph.target.id } });
      }
      const before = await db.session.findMany({
        where: { userId: { in: [graph.owner.id, graph.foreignOwner.id] } },
        select: { id: true },
        orderBy: { id: "asc" },
      });

      await expect(
        revokeAccountSession({
          sessionToken: graph.current.sessionToken,
          sessionId,
          now: () => scope.now,
        }),
      ).resolves.toEqual({ status: "completed" });

      await expect(
        db.session.findMany({
          where: { userId: { in: [graph.owner.id, graph.foreignOwner.id] } },
          select: { id: true },
          orderBy: { id: "asc" },
        }),
      ).resolves.toEqual(before);
    },
  );

  it("converges replayed revocation on the same completed outcome", async () => {
    const { db } = await import("@/lib/db");
    const { revokeAccountSession } = await import(
      "@/modules/account/security/service"
    );
    const scope = createAccountSecurityFixtureScope({ label: "security-replay" });
    scopes.push(scope);
    const graph = await seedRevocationGraph(db, scope);
    const command = {
      sessionToken: graph.current.sessionToken,
      sessionId: graph.target.id,
      now: () => scope.now,
    };

    await expect(revokeAccountSession(command)).resolves.toEqual({
      status: "completed",
    });
    await expect(revokeAccountSession(command)).resolves.toEqual({
      status: "completed",
    });
    await expect(
      db.session.count({ where: { id: graph.target.id } }),
    ).resolves.toBe(0);
  });

  it.each([
    ["missing", null],
    ["stale", new Date("2026-08-22T11:49:59.999Z")],
    ["future", new Date("2026-08-22T12:00:00.001Z")],
  ] as const)(
    "requires reauthentication for %s freshness evidence",
    async (_state, authenticatedAt) => {
      const { db } = await import("@/lib/db");
      const { revokeAccountSession } = await import(
        "@/modules/account/security/service"
      );
      const scope = createAccountSecurityFixtureScope({
        label: `security-freshness-${_state}`,
      });
      scopes.push(scope);
      const graph = await seedRevocationGraph(db, scope, authenticatedAt);

      await expect(
        revokeAccountSession({
          sessionToken: graph.current.sessionToken,
          sessionId: graph.target.id,
          now: () => scope.now,
        }),
      ).resolves.toEqual({ status: "reauthentication_required" });
      await expect(
        db.session.count({ where: { id: graph.target.id } }),
      ).resolves.toBe(1);
    },
  );

  it("rolls back an injected delete failure and returns a generic outcome", async () => {
    const { db } = await import("@/lib/db");
    const { revokeAccountSession } = await import(
      "@/modules/account/security/service"
    );
    const scope = createAccountSecurityFixtureScope({ label: "security-rollback" });
    scopes.push(scope);
    const graph = await seedRevocationGraph(db, scope);
    const removeFailure = await installSessionDeleteFailure(db, graph.target.id);

    try {
      await expect(
        revokeAccountSession({
          sessionToken: graph.current.sessionToken,
          sessionId: graph.target.id,
          now: () => scope.now,
        }),
      ).resolves.toEqual({ status: "revocation_failed" });
    } finally {
      await removeFailure();
    }

    await expect(
      db.session.findMany({
        where: { userId: graph.owner.id },
        select: { id: true },
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        { id: graph.current.id },
        { id: graph.target.id },
        { id: graph.sibling.id },
      ]),
    );
  });

  it("revokes every owned pre-lock session atomically while preserving the exact confirming row", async () => {
    const { db } = await import("@/lib/db");
    const { resolveActiveAccountSession } = await import(
      "@/modules/account/session"
    );
    const { revokeAllOtherAccountSessions } = await import(
      "@/modules/account/security/service"
    );
    const scope = createAccountSecurityFixtureScope({ label: "security-bulk" });
    scopes.push(scope);
    const freshBoundary = new Date(scope.now.getTime() - 10 * 60_000);
    const graph = await seedRevocationGraph(db, scope, freshBoundary);
    const createdWhileReviewOpen = scope.activeSession(graph.owner, {
      id: `${scope.scopeId}-created-during-review`,
      sessionToken: `${scope.scopeId}-created-during-review-token`,
      createdAt: new Date(scope.now.getTime() - 1_000),
    });
    await db.session.create({ data: createdWhileReviewOpen });

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const coordinator = new Client({ connectionString });
    const now = vi.fn(() => scope.now);
    let revocation: ReturnType<typeof revokeAllOtherAccountSessions> | undefined;

    await coordinator.connect();
    try {
      await coordinator.query(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        [graph.owner.id],
      );
      const waitingBefore = await waitingAdvisoryLockCount(db);
      revocation = revokeAllOtherAccountSessions({
        sessionToken: graph.current.sessionToken,
        now,
      });
      await vi.waitFor(
        async () => {
          expect(await waitingAdvisoryLockCount(db)).toBeGreaterThanOrEqual(
            waitingBefore + 1,
          );
        },
        { timeout: 5_000, interval: 10 },
      );
      await expect(
        db.session.findMany({
          where: { userId: graph.owner.id },
          select: { id: true },
        }),
      ).resolves.toHaveLength(5);
    } finally {
      await coordinator.query(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        [graph.owner.id],
      );
      await revocation?.catch(() => undefined);
      await coordinator.end();
    }

    await expect(revocation).resolves.toEqual({ status: "completed" });
    expect(now).toHaveBeenCalledOnce();
    await expect(
      db.session.findMany({
        where: { userId: graph.owner.id },
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: graph.current.id }]);
    await expect(
      db.session.findMany({
        where: { userId: graph.foreignOwner.id },
        select: { id: true },
      }),
    ).resolves.toEqual([{ id: graph.foreign.id }]);
    await expect(
      resolveActiveAccountSession(graph.current.sessionToken, scope.now),
    ).resolves.toEqual(expect.objectContaining({ sessionId: graph.current.id }));
    for (const revokedToken of [
      graph.target.sessionToken,
      graph.sibling.sessionToken,
      createdWhileReviewOpen.sessionToken,
    ]) {
      await expect(
        resolveActiveAccountSession(revokedToken, scope.now),
      ).resolves.toBeNull();
    }

    const createdAfterTransaction = scope.activeSession(graph.owner, {
      id: `${scope.scopeId}-created-after-transaction`,
      sessionToken: `${scope.scopeId}-created-after-transaction-token`,
      createdAt: new Date(scope.now.getTime() + 1_000),
    });
    await db.session.create({ data: createdAfterTransaction });

    await expect(
      db.session.findMany({
        where: { userId: graph.owner.id },
        select: { id: true },
        orderBy: { id: "asc" },
      }),
    ).resolves.toEqual(
      [graph.current, createdAfterTransaction]
        .map(({ id }) => ({ id }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
    await expect(
      resolveActiveAccountSession(
        createdAfterTransaction.sessionToken,
        scope.now,
      ),
    ).resolves.toEqual(
      expect.objectContaining({ sessionId: createdAfterTransaction.id }),
    );
  });

  it("rejects stale bulk confirmation without changing any session", async () => {
    const { db } = await import("@/lib/db");
    const { revokeAllOtherAccountSessions } = await import(
      "@/modules/account/security/service"
    );
    const scope = createAccountSecurityFixtureScope({
      label: "security-bulk-stale",
    });
    scopes.push(scope);
    const graph = await seedRevocationGraph(
      db,
      scope,
      new Date(scope.now.getTime() - 10 * 60_000 - 1),
    );
    const before = await db.session.findMany({
      where: { userId: graph.owner.id },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    await expect(
      revokeAllOtherAccountSessions({
        sessionToken: graph.current.sessionToken,
        now: () => scope.now,
      }),
    ).resolves.toEqual({ status: "reauthentication_required" });
    await expect(
      db.session.findMany({
        where: { userId: graph.owner.id },
        select: { id: true },
        orderBy: { id: "asc" },
      }),
    ).resolves.toEqual(before);
  });

  it("revalidates the exact confirming session after acquiring the user lock", async () => {
    const { db } = await import("@/lib/db");
    const { revokeAllOtherAccountSessions } = await import(
      "@/modules/account/security/service"
    );
    const scope = createAccountSecurityFixtureScope({
      label: "security-bulk-revalidate",
    });
    scopes.push(scope);
    const graph = await seedRevocationGraph(db, scope);
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const coordinator = new Client({ connectionString });
    const before = await db.session.findMany({
      where: { userId: graph.owner.id },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    let revocation: ReturnType<typeof revokeAllOtherAccountSessions> | undefined;

    await coordinator.connect();
    try {
      await coordinator.query(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        [graph.owner.id],
      );
      const waitingBefore = await waitingAdvisoryLockCount(db);
      revocation = revokeAllOtherAccountSessions({
        sessionToken: graph.current.sessionToken,
        now: () => scope.now,
      });
      await vi.waitFor(
        async () => {
          expect(await waitingAdvisoryLockCount(db)).toBeGreaterThanOrEqual(
            waitingBefore + 1,
          );
        },
        { timeout: 5_000, interval: 10 },
      );
      await db.session.update({
        where: { id: graph.current.id },
        data: { expires: scope.now },
      });
    } finally {
      await coordinator.query(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        [graph.owner.id],
      );
      await revocation?.catch(() => undefined);
      await coordinator.end();
    }

    await expect(revocation).resolves.toEqual({ status: "unauthenticated" });
    await expect(
      db.session.findMany({
        where: { userId: graph.owner.id },
        select: { id: true },
        orderBy: { id: "asc" },
      }),
    ).resolves.toEqual(before);
  });

  it("rolls back the complete bulk set when any owned deletion fails", async () => {
    const { db } = await import("@/lib/db");
    const { revokeAllOtherAccountSessions } = await import(
      "@/modules/account/security/service"
    );
    const scope = createAccountSecurityFixtureScope({
      label: "security-bulk-rollback",
    });
    scopes.push(scope);
    const graph = await seedRevocationGraph(db, scope);
    const before = await db.session.findMany({
      where: { userId: { in: [graph.owner.id, graph.foreignOwner.id] } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const removeFailure = await installSessionDeleteFailure(db, graph.sibling.id);

    try {
      await expect(
        revokeAllOtherAccountSessions({
          sessionToken: graph.current.sessionToken,
          now: () => scope.now,
        }),
      ).resolves.toEqual({ status: "revocation_failed" });
    } finally {
      await removeFailure();
    }

    await expect(
      db.session.findMany({
        where: { userId: { in: [graph.owner.id, graph.foreignOwner.id] } },
        select: { id: true },
        orderBy: { id: "asc" },
      }),
    ).resolves.toEqual(before);
  });

  it.each([
    ["inactive", "individual"],
    ["inactive", "bulk"],
    ["revoked", "individual"],
    ["revoked", "bulk"],
  ] as const)(
    "changes nothing for an %s current session during %s revocation",
    async (currentState, operation) => {
      const { db } = await import("@/lib/db");
      const {
        revokeAccountSession,
        revokeAllOtherAccountSessions,
      } = await import("@/modules/account/security/service");
      const scope = createAccountSecurityFixtureScope({
        label: `security-${currentState}-${operation}`,
      });
      scopes.push(scope);
      const graph = await seedRevocationGraph(db, scope);
      if (currentState === "inactive") {
        await db.user.update({
          where: { id: graph.owner.id },
          data: { status: "PENDING" },
        });
      } else {
        await db.session.delete({ where: { id: graph.current.id } });
      }
      const before = await db.session.findMany({
        where: { userId: graph.owner.id },
        select: { id: true },
        orderBy: { id: "asc" },
      });

      const result =
        operation === "individual"
          ? await revokeAccountSession({
              sessionToken: graph.current.sessionToken,
              sessionId: graph.target.id,
              now: () => scope.now,
            })
          : await revokeAllOtherAccountSessions({
              sessionToken: graph.current.sessionToken,
              now: () => scope.now,
            });

      expect(result).toEqual({ status: "unauthenticated" });
      await expect(
        db.session.findMany({
          where: { userId: graph.owner.id },
          select: { id: true },
          orderBy: { id: "asc" },
        }),
      ).resolves.toEqual(before);
    },
  );

  it("serializes queued individual, bulk, and creation operations to one permitted set", async () => {
    const { hardenAdapter } = await import("@/lib/auth-adapter");
    const { db } = await import("@/lib/db");
    const {
      revokeAccountSession,
      revokeAllOtherAccountSessions,
    } = await import("@/modules/account/security/service");
    const scope = createAccountSecurityFixtureScope({
      label: "security-concurrent-operations",
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await seedRevocationGraph(db, scope);
    const adapter = hardenAdapter(PrismaAdapter(db));
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const coordinator = new Client({ connectionString });
    const createdToken = `${scope.scopeId}-created-token`;
    const waitingBefore = await waitingAdvisoryLockCount(db);
    let individual: ReturnType<typeof revokeAccountSession> | undefined;
    let bulk: ReturnType<typeof revokeAllOtherAccountSessions> | undefined;
    let creation: ReturnType<NonNullable<typeof adapter.createSession>> | undefined;

    await coordinator.connect();
    try {
      await coordinator.query(
        "SELECT pg_advisory_lock(hashtextextended($1, 0))",
        [graph.owner.id],
      );
      individual = revokeAccountSession({
        sessionToken: graph.current.sessionToken,
        sessionId: graph.target.id,
        now: () => scope.now,
      });
      await vi.waitFor(
        async () => {
          expect(await waitingAdvisoryLockCount(db)).toBeGreaterThanOrEqual(
            waitingBefore + 1,
          );
        },
        { timeout: 5_000, interval: 10 },
      );
      bulk = revokeAllOtherAccountSessions({
        sessionToken: graph.current.sessionToken,
        now: () => scope.now,
      });
      await vi.waitFor(
        async () => {
          expect(await waitingAdvisoryLockCount(db)).toBeGreaterThanOrEqual(
            waitingBefore + 2,
          );
        },
        { timeout: 5_000, interval: 10 },
      );
      creation = Promise.resolve(
        adapter.createSession!({
          sessionToken: createdToken,
          userId: graph.owner.id,
          expires: new Date(scope.now.getTime() + 24 * 60 * 60_000),
        }),
      );
      await vi.waitFor(
        async () => {
          expect(await waitingAdvisoryLockCount(db)).toBeGreaterThanOrEqual(
            waitingBefore + 3,
          );
        },
        { timeout: 5_000, interval: 10 },
      );
    } finally {
      await coordinator.query(
        "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
        [graph.owner.id],
      );
      await Promise.allSettled([
        individual ?? Promise.resolve(),
        bulk ?? Promise.resolve(),
        creation ?? Promise.resolve(),
      ]);
      await coordinator.end();
    }

    await expect(individual).resolves.toEqual({ status: "completed" });
    await expect(bulk).resolves.toEqual({ status: "completed" });
    await expect(creation).resolves.toEqual(
      expect.objectContaining({ sessionToken: createdToken }),
    );
    const remaining = await db.session.findMany({
      where: { userId: graph.owner.id },
      select: { id: true, sessionToken: true },
    });
    expect(remaining).toHaveLength(2);
    expect(remaining).toEqual(
      expect.arrayContaining([
        { id: graph.current.id, sessionToken: graph.current.sessionToken },
        expect.objectContaining({ sessionToken: createdToken }),
      ]),
    );
    await expect(
      db.session.findUnique({ where: { sessionToken: graph.target.sessionToken } }),
    ).resolves.toBeNull();
  });

  it("serializes concurrent cap creations without evicting either new session", async () => {
    const { hardenAdapter } = await import("@/lib/auth-adapter");
    const { db } = await import("@/lib/db");
    const scope = createAccountSecurityFixtureScope({
      label: "security-concurrent-cap",
      now: new Date(),
    });
    scopes.push(scope);
    const owner = scope.account();
    const existing = Array.from({ length: 20 }, (_, index) =>
      scope.session(owner, {
        id: `${scope.scopeId}-existing-${String(index + 1).padStart(2, "0")}`,
        sessionToken: `${scope.scopeId}-existing-token-${index + 1}`,
        createdAt: new Date(scope.now.getTime() - (20 - index) * 60_000),
      }),
    );
    await db.user.create({ data: owner });
    await db.session.createMany({ data: existing });
    const adapter = hardenAdapter(PrismaAdapter(db));
    const newTokens = [
      `${scope.scopeId}-new-token-a`,
      `${scope.scopeId}-new-token-b`,
    ];

    await Promise.all(
      newTokens.map((sessionToken) =>
        adapter.createSession!({
          sessionToken,
          userId: owner.id,
          expires: new Date(scope.now.getTime() + 24 * 60 * 60_000),
        }),
      ),
    );

    const active = await db.session.findMany({
      where: { userId: owner.id, expires: { gt: scope.now } },
      select: { sessionToken: true },
    });
    expect(active).toHaveLength(20);
    expect(active).toEqual(
      expect.arrayContaining(newTokens.map((sessionToken) => ({ sessionToken }))),
    );
    expect(
      active.filter(({ sessionToken }) =>
        sessionToken.includes("-existing-token-"),
      ),
    ).toHaveLength(18);
  });

  it("emits only the fixed individual outcome from a live revocation route", async () => {
    const { db } = await import("@/lib/db");
    const { getEnv } = await import("@/lib/env");
    const { POST } = await import(
      "@/app/api/account/security/sessions/revoke/route"
    );
    const scope = createAccountSecurityFixtureScope({
      label: "security-live-log",
      now: new Date(),
    });
    scopes.push(scope);
    const graph = await seedRevocationGraph(db, scope);
    const env = getEnv();
    const canonical = new URL(env.NEXTAUTH_URL);
    const csrfToken = `${scope.scopeId}-csrf`;
    const csrfHash = createHash("sha256")
      .update(`${csrfToken}${env.AUTH_SECRET}`)
      .digest("hex");
    const requestBody = {
      csrfToken,
      locale: "en",
      confirmation: "revoke_session",
      sessionId: graph.target.id,
    };

    const response = await POST(
      new NextRequest(new URL("/api/account/security/sessions/revoke", canonical), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `next-auth.session-token=${graph.current.sessionToken}; next-auth.csrf-token=${encodeURIComponent(`${csrfToken}|${csrfHash}`)}`,
          host: canonical.host,
          origin: canonical.origin,
        },
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(200);
    expect(loggerMocks.info).toHaveBeenCalledExactlyOnceWith(
      { outcome: "revoke_session_completed" },
      "account security session revocation completed",
    );
    expect(loggerMocks.warn).not.toHaveBeenCalled();
    const serializedLogs = JSON.stringify(loggerMocks.info.mock.calls);
    for (const forbiddenValue of [
      graph.owner.id,
      graph.owner.email,
      graph.current.sessionToken,
      graph.target.id,
      csrfToken,
      "durationMs",
      "retryAfter",
      "requestBody",
    ]) {
      expect(serializedLogs).not.toContain(forbiddenValue);
    }
  });
});