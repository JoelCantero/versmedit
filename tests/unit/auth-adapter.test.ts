// @vitest-environment node

import type { Adapter } from "next-auth/adapters";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
  publishVerificationToken: vi.fn(),
  getLoginCodeAuthorization: vi.fn(),
  userFindFirst: vi.fn(),
  getSignupActivationAuthorization: vi.fn(),
  tokenFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  acceptanceCreate: vi.fn(),
  sessionCreate: vi.fn(),
  sessionDeleteMany: vi.fn(),
  sessionFindMany: vi.fn(),
  getAccountDeletionVerificationAuthorization: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    $queryRaw: mocks.queryRaw,
    user: { findFirst: mocks.userFindFirst },
  },
}));
vi.mock("@/modules/login/verification-context", () => ({
  publishVerificationToken: mocks.publishVerificationToken,
  getLoginCodeAuthorization: mocks.getLoginCodeAuthorization,
}));
vi.mock("@/modules/signup/verification-context", () => ({
  getSignupActivationAuthorization: mocks.getSignupActivationAuthorization,
}));
vi.mock("@/modules/account/deletion/verification-context", () => ({
  getAccountDeletionVerificationAuthorization:
    mocks.getAccountDeletionVerificationAuthorization,
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ AUTH_SECRET: "test-auth-secret-value-0000000000" }),
}));

import { hardenAdapter } from "@/lib/auth-adapter";

describe("hardenAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSignupActivationAuthorization.mockReturnValue(null);
    mocks.getAccountDeletionVerificationAuthorization.mockReturnValue(null);
    mocks.getLoginCodeAuthorization.mockReturnValue(null);
    mocks.sessionFindMany.mockResolvedValue([]);
    mocks.sessionDeleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.mockImplementation((callback) =>
      callback({
        $executeRaw: mocks.executeRaw,
        user: {
          findUnique: mocks.userFindUnique,
          update: mocks.userUpdate,
        },
        verificationToken: {
          deleteMany: mocks.deleteMany,
          findUnique: mocks.tokenFindUnique,
        },
        policyAcceptance: { create: mocks.acceptanceCreate },
        session: {
          create: mocks.sessionCreate,
          deleteMany: mocks.sessionDeleteMany,
          findMany: mocks.sessionFindMany,
        },
      }),
    );
  });

  it("serializes session creation and records one captured creation time", async () => {
    const originalCreateSession = vi.fn();
    const adapter = hardenAdapter({ createSession: originalCreateSession } as Adapter);
    const session = {
      sessionToken: "fresh-session",
      userId: "active-user",
      expires: new Date("2026-08-22T12:00:00.000Z"),
    };
    const capturedAt = new Date("2026-08-22T10:00:00.000Z");
    mocks.sessionCreate.mockImplementation(({ data }) => Promise.resolve(data));
    vi.useFakeTimers();
    vi.setSystemTime(capturedAt);

    try {
      await expect(adapter.createSession!(session)).resolves.toEqual({
        ...session,
        createdAt: capturedAt,
        authenticatedAt: capturedAt,
      });
      expect(mocks.executeRaw).toHaveBeenCalledOnce();
      expect(mocks.executeRaw.mock.calls[0]?.[0]).toMatchObject({
        values: [session.userId],
      });
      expect(mocks.sessionFindMany).toHaveBeenCalledWith({
        where: { userId: session.userId, expires: { gt: capturedAt } },
        select: { id: true },
        orderBy: [
          { createdAt: { sort: "asc", nulls: "first" } },
          { id: "asc" },
        ],
      });
      expect(mocks.sessionCreate).toHaveBeenCalledWith({
        data: {
          ...session,
          createdAt: capturedAt,
          authenticatedAt: capturedAt,
        },
      });
      expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.sessionFindMany.mock.invocationCallOrder[0]!,
      );
      expect(originalCreateSession).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicts the null-first deterministic oldest prior row before inserting at the cap", async () => {
    const adapter = hardenAdapter({ createSession: vi.fn() } as Adapter);
    const session = {
      sessionToken: "new-session",
      userId: "active-user",
      expires: new Date("2026-08-23T12:00:00.000Z"),
    };
    mocks.sessionFindMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, index) => ({
        id: index === 0 ? "legacy-null" : `prior-${index}`,
      })),
    );
    mocks.sessionCreate.mockImplementation(({ data }) => Promise.resolve(data));

    await adapter.createSession!(session);

    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: session.userId,
        id: { in: ["legacy-null"] },
      },
    });
    expect(mocks.sessionDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sessionCreate.mock.invocationCallOrder[0]!,
    );
  });

  it("defensively reduces an existing over-cap account to 19 prior active rows", async () => {
    const adapter = hardenAdapter({} as Adapter);
    const priorRows = Array.from({ length: 23 }, (_, index) => ({
      id: `prior-${String(index + 1).padStart(2, "0")}`,
    }));
    mocks.sessionFindMany.mockResolvedValue(priorRows);
    mocks.sessionCreate.mockImplementation(({ data }) => Promise.resolve(data));

    await adapter.createSession!({
      sessionToken: "new-session",
      userId: "active-user",
      expires: new Date("2026-08-23T12:00:00.000Z"),
    });

    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({
      where: {
        userId: "active-user",
        id: {
          in: ["prior-01", "prior-02", "prior-03", "prior-04"],
        },
      },
    });
  });

  it("does not evict below the cap", async () => {
    const adapter = hardenAdapter({} as Adapter);
    mocks.sessionFindMany.mockResolvedValue(
      Array.from({ length: 19 }, (_, index) => ({ id: `prior-${index}` })),
    );
    mocks.sessionCreate.mockImplementation(({ data }) => Promise.resolve(data));

    await adapter.createSession!({
      sessionToken: "new-session",
      userId: "active-user",
      expires: new Date("2026-08-23T12:00:00.000Z"),
    });

    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("keeps eviction and insertion in one rollback boundary when insertion fails", async () => {
    const adapter = hardenAdapter({ createSession: vi.fn() } as Adapter);
    const originalRows = Array.from({ length: 20 }, (_, index) => `prior-${index}`);
    const persistedRows = [...originalRows];
    const insertError = new Error("insert failed");
    mocks.sessionFindMany.mockResolvedValue(
      originalRows.map((id) => ({ id })),
    );
    mocks.sessionDeleteMany.mockImplementation(({ where }) => {
      for (const id of where.id.in) {
        persistedRows.splice(persistedRows.indexOf(id), 1);
      }
      return Promise.resolve({ count: where.id.in.length });
    });
    mocks.sessionCreate.mockRejectedValue(insertError);
    mocks.transaction.mockImplementation(async (callback) => {
      const snapshot = [...persistedRows];
      try {
        return await callback({
          $executeRaw: mocks.executeRaw,
          session: {
            create: mocks.sessionCreate,
            deleteMany: mocks.sessionDeleteMany,
            findMany: mocks.sessionFindMany,
          },
        });
      } catch (error) {
        persistedRows.splice(0, persistedRows.length, ...snapshot);
        throw error;
      }
    });

    await expect(
      adapter.createSession!({
        sessionToken: "new-session",
        userId: "active-user",
        expires: new Date("2026-08-23T12:00:00.000Z"),
      }),
    ).rejects.toBe(insertError);
    expect(mocks.sessionDeleteMany).toHaveBeenCalledOnce();
    expect(persistedRows).toEqual(originalRows);
  });
  it("treats a missing stale session as already deleted", async () => {
    const deleteSession = vi.fn().mockRejectedValue({ code: "P2025" });
    const adapter = hardenAdapter({ deleteSession } as Adapter);

    await expect(adapter.deleteSession!("stale-token")).resolves.toBeNull();
  });

  it("rethrows unexpected database errors", async () => {
    const error = new Error("database unavailable");
    const adapter = hardenAdapter({
      deleteSession: vi.fn().mockRejectedValue(error),
    } as Adapter);

    await expect(adapter.deleteSession!("token")).rejects.toBe(error);
  });

  it("prevents authentication from creating unknown users", async () => {
    const createUser = vi.fn();
    const adapter = hardenAdapter({ createUser } as Adapter);

    await expect(
      adapter.createUser!({
        id: "new-user",
        email: "unknown@example.test",
        emailVerified: null,
      }),
    ).rejects.toThrow(/cannot create users/);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("resolves generic email lookup only through active normalized accounts", async () => {
    const activeUser = {
      id: "active-user",
      name: "Active User",
      email: "Person@Example.test",
      emailVerified: new Date("2026-08-18T10:00:00Z"),
      image: null,
    };
    const originalLookup = vi.fn();
    mocks.userFindFirst.mockResolvedValue(activeUser);
    const adapter = hardenAdapter({ getUserByEmail: originalLookup } as Adapter);

    await expect(
      adapter.getUserByEmail!("  PERSON@example.test "),
    ).resolves.toEqual(activeUser);
    expect(mocks.userFindFirst).toHaveBeenCalledWith({
      where: {
        normalizedEmail: "person@example.test",
        status: "ACTIVE",
      },
    });
    expect(originalLookup).not.toHaveBeenCalled();
  });

  it("returns null for pending normalized accounts", async () => {
    mocks.userFindFirst.mockResolvedValue(null);
    const adapter = hardenAdapter({} as Adapter);

    await expect(
      adapter.getUserByEmail!("pending@example.test"),
    ).resolves.toBeNull();
  });

  it("adds safe methods when an adapter omits deleteSession", async () => {
    const adapter = {} as Adapter;
    const hardened = hardenAdapter(adapter);

    await expect(hardened.deleteSession!("missing")).resolves.toBeNull();
  });

  it("locks email then user before replacing and publishing the exact login token", async () => {
    const created = {
      identifier: "member@example.test",
      token: "hashed-token",
      expires: new Date("2026-07-19T12:15:00Z"),
    };
    const adapter = hardenAdapter({} as Adapter);
    mocks.userFindUnique.mockResolvedValue({
      id: "active-user",
      status: "ACTIVE",
    });

    await expect(adapter.createVerificationToken!(created)).resolves.toEqual(created);
    expect(mocks.executeRaw).toHaveBeenCalledTimes(3);
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { normalizedEmail: created.identifier },
      select: { id: true, status: true },
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { identifier: created.identifier, purpose: "LOGIN" },
    });
    expect(mocks.publishVerificationToken).toHaveBeenCalledWith({
      identifier: created.identifier,
      token: created.token,
      code: expect.stringMatching(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/),
    });
    expect(
      mocks.executeRaw.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.userFindUnique.mock.invocationCallOrder[0]!);
    expect(
      mocks.userFindUnique.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.executeRaw.mock.invocationCallOrder[1]!);
    expect(mocks.executeRaw.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.deleteMany.mock.invocationCallOrder[0]!,
    );
    expect(mocks.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.executeRaw.mock.invocationCallOrder[2]!,
    );
  });

  it("does not create or publish a login token after its account was deleted", async () => {
    const token = {
      identifier: "deleted@example.test",
      token: "hashed-token",
      expires: new Date("2026-08-22T12:15:00Z"),
    };
    mocks.userFindUnique.mockResolvedValue(null);
    const adapter = hardenAdapter({} as Adapter);

    await expect(adapter.createVerificationToken!(token)).rejects.toThrow(
      /authentication account is unavailable/i,
    );
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.publishVerificationToken).not.toHaveBeenCalled();
  });

  it("atomically consumes only the matching token", async () => {
    const consumed = {
      identifier: "member@example.test",
      token: "hashed-token",
      expires: new Date("2026-07-19T12:15:00Z"),
    };
    mocks.queryRaw.mockResolvedValueOnce([consumed]).mockResolvedValueOnce([]);
    const adapter = hardenAdapter({} as Adapter);

    await expect(adapter.useVerificationToken!({
      identifier: consumed.identifier,
      token: consumed.token,
    })).resolves.toEqual(consumed);
    await expect(adapter.useVerificationToken!({
      identifier: consumed.identifier,
      token: consumed.token,
    })).resolves.toBeNull();
  });

  it("atomically activates a pending user and persists the signup snapshot in context", async () => {
    const token = {
      identifier: "pending@example.test",
      token: "signup-hash",
      expires: new Date(Date.now() + 60_000),
      purpose: "SIGNUP",
      proposedName: "Pending Person",
      locale: "es",
      termsVersion: "terms-v1",
      privacyVersion: "privacy-v1",
      acceptedAt: new Date("2026-08-18T12:00:00Z"),
      deliveredAt: new Date("2026-08-18T12:00:01Z"),
    };
    mocks.getSignupActivationAuthorization.mockReturnValue({
      identifier: token.identifier,
      token: token.token,
    });
    mocks.tokenFindUnique.mockResolvedValue(token);
    mocks.userFindUnique.mockResolvedValue({
      id: "pending-user",
      status: "PENDING",
    });
    mocks.userUpdate.mockResolvedValue({ id: "pending-user" });
    mocks.acceptanceCreate.mockResolvedValue({ id: "acceptance" });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const adapter = hardenAdapter({} as Adapter);

    await expect(
      adapter.useVerificationToken!({
        identifier: token.identifier,
        token: token.token,
      }),
    ).resolves.toEqual({
      identifier: token.identifier,
      token: token.token,
      expires: token.expires,
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "pending-user" },
      data: {
        name: token.proposedName,
        status: "ACTIVE",
        emailVerified: expect.any(Date),
      },
    });
    expect(mocks.acceptanceCreate).toHaveBeenCalledWith({
      data: {
        userId: "pending-user",
        termsVersion: token.termsVersion,
        privacyVersion: token.privacyVersion,
        acceptedAt: token.acceptedAt,
      },
    });
  });

  it("rejects signup purpose without an activation context", async () => {
    mocks.queryRaw.mockResolvedValue([]);
    const adapter = hardenAdapter({} as Adapter);

    await expect(
      adapter.useVerificationToken!({
        identifier: "pending@example.test",
        token: "signup-hash",
      }),
    ).resolves.toBeNull();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("consumes a delivered deletion token only in its exact request context", async () => {
    const token = {
      identifier: "active@example.test",
      token: "deletion-hash",
      expires: new Date(Date.now() + 60_000),
      purpose: "ACCOUNT_DELETION",
      locale: "ca",
      deliveredAt: new Date(),
    };
    mocks.getAccountDeletionVerificationAuthorization.mockReturnValue({
      identifier: token.identifier,
      token: token.token,
    });
    mocks.tokenFindUnique.mockResolvedValue(token);
    mocks.userFindUnique.mockResolvedValue({
      id: "active-user",
      status: "ACTIVE",
    });
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const adapter = hardenAdapter({} as Adapter);

    await expect(
      adapter.useVerificationToken!({
        identifier: token.identifier,
        token: token.token,
      }),
    ).resolves.toEqual({
      identifier: token.identifier,
      token: token.token,
      expires: token.expires,
    });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        identifier: token.identifier,
        token: token.token,
        purpose: "ACCOUNT_DELETION",
      },
    });
  });

  it("rejects a provisional signup token that was not confirmed delivered", async () => {
    mocks.getSignupActivationAuthorization.mockReturnValue({
      identifier: "pending@example.test",
      token: "signup-hash",
    });
    mocks.tokenFindUnique.mockResolvedValue({
      identifier: "pending@example.test",
      token: "signup-hash",
      expires: new Date(Date.now() + 60_000),
      purpose: "SIGNUP",
      proposedName: "Pending Person",
      locale: "en",
      termsVersion: "terms-v1",
      privacyVersion: "privacy-v1",
      acceptedAt: new Date(),
      deliveredAt: null,
    });
    const adapter = hardenAdapter({} as Adapter);

    await expect(
      adapter.useVerificationToken!({
        identifier: "pending@example.test",
        token: "signup-hash",
      }),
    ).resolves.toBeNull();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ["replayed", null, { id: "pending-user", status: "PENDING" }],
    ["stale", { identifier: "pending@example.test", token: "newer-hash" }, { id: "pending-user", status: "PENDING" }],
    ["active", { identifier: "pending@example.test", token: "signup-hash" }, { id: "active-user", status: "ACTIVE" }],
  ])("rejects %s signup activation without mutation", async (_case, storedToken, user) => {
    mocks.getSignupActivationAuthorization.mockReturnValue({
      identifier: "pending@example.test",
      token: "signup-hash",
    });
    mocks.tokenFindUnique.mockResolvedValue(
      storedToken
        ? {
            ...storedToken,
            expires: new Date(Date.now() + 60_000),
            purpose: "SIGNUP",
            proposedName: "Pending Person",
            locale: "en",
            termsVersion: "terms-v1",
            privacyVersion: "privacy-v1",
            acceptedAt: new Date(),
            deliveredAt: new Date(),
          }
        : null,
    );
    mocks.userFindUnique.mockResolvedValue(user);
    const adapter = hardenAdapter({} as Adapter);

    await expect(
      adapter.useVerificationToken!({
        identifier: "pending@example.test",
        token: "signup-hash",
      }),
    ).resolves.toBeNull();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.acceptanceCreate).not.toHaveBeenCalled();
  });
});