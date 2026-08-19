// @vitest-environment node

import type { Adapter } from "next-auth/adapters";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
  publishVerificationToken: vi.fn(),
  userFindFirst: vi.fn(),
  getSignupActivationAuthorization: vi.fn(),
  tokenFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  acceptanceCreate: vi.fn(),
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
}));
vi.mock("@/modules/signup/verification-context", () => ({
  getSignupActivationAuthorization: mocks.getSignupActivationAuthorization,
}));

import { hardenAdapter } from "@/lib/auth-adapter";

describe("hardenAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSignupActivationAuthorization.mockReturnValue(null);
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
      }),
    );
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

  it("serializes replacement, deletes predecessors, creates, and publishes the exact token", async () => {
    const created = {
      identifier: "member@example.test",
      token: "hashed-token",
      expires: new Date("2026-07-19T12:15:00Z"),
    };
    const adapter = hardenAdapter({} as Adapter);

    await expect(adapter.createVerificationToken!(created)).resolves.toEqual(created);
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { identifier: created.identifier, purpose: "LOGIN" },
    });
    expect(mocks.publishVerificationToken).toHaveBeenCalledWith({
      identifier: created.identifier,
      token: created.token,
    });
    expect(
      mocks.executeRaw.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.deleteMany.mock.invocationCallOrder[0]!);
    expect(
      mocks.deleteMany.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.executeRaw.mock.invocationCallOrder[1]!);
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