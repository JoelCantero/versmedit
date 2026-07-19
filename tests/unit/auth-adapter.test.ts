// @vitest-environment node

import type { Adapter } from "next-auth/adapters";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
  deleteMany: vi.fn(),
  transaction: vi.fn(),
  publishVerificationToken: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({
  db: { $transaction: mocks.transaction, $queryRaw: mocks.queryRaw },
}));
vi.mock("@/modules/login/verification-context", () => ({
  publishVerificationToken: mocks.publishVerificationToken,
}));

import { hardenAdapter } from "@/lib/auth-adapter";

describe("hardenAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) =>
      callback({
        $executeRaw: mocks.executeRaw,
        verificationToken: {
          deleteMany: mocks.deleteMany,
        },
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
      where: { identifier: created.identifier },
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
});