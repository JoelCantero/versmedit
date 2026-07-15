// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  executeRaw: vi.fn(() => Promise.resolve(0)),
  logWarn: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    $executeRaw: mocks.executeRaw,
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: mocks.logWarn },
}));

import { consumeSharedRateLimit } from "@/lib/shared-rate-limit";

describe("consumeSharedRateLimit", () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset();
    mocks.executeRaw.mockReset();
    mocks.logWarn.mockClear();
    vi.spyOn(Math, "random").mockReturnValue(1);
  });

  it("returns the atomic PostgreSQL counter result", async () => {
    mocks.queryRaw.mockResolvedValue([
      { count: 2, retryAfterSeconds: 900 },
    ]);

    await expect(
      consumeSharedRateLimit({ key: "client", limit: 3, windowMs: 900_000 }),
    ).resolves.toEqual({
      allowed: true,
      remaining: 1,
      retryAfterSeconds: 900,
    });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("does not fail the decision when probabilistic cleanup fails", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    mocks.queryRaw.mockResolvedValue([{ count: 1, retryAfterSeconds: 60 }]);
    mocks.executeRaw.mockRejectedValue(new Error("cleanup unavailable"));

    await expect(
      consumeSharedRateLimit({ key: "client", limit: 3, windowMs: 60_000 }),
    ).resolves.toMatchObject({ allowed: true });
    await vi.waitFor(() => expect(mocks.logWarn).toHaveBeenCalledOnce());
  });

  it("rejects invalid limits and missing database results", async () => {
    await expect(
      consumeSharedRateLimit({ key: "client", limit: 0, windowMs: 1 }),
    ).rejects.toThrow(/positive integers/);

    mocks.queryRaw.mockResolvedValue([]);
    await expect(
      consumeSharedRateLimit({ key: "client", limit: 1, windowMs: 1 }),
    ).rejects.toThrow(/did not return/);
  });
});