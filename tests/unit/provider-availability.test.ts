// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    rateLimitBucket: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  },
}));

import {
  getProviderAvailability,
  isProviderWideFailure,
  markProviderUnavailable,
} from "@/lib/provider-availability";

describe("provider availability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a fixed-key 60-second marker", async () => {
    const now = new Date("2026-07-19T12:00:00Z");
    await markProviderUnavailable(now);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "auth:email:provider:unavailable" },
        create: expect.objectContaining({
          key: "auth:email:provider:unavailable",
          resetAt: new Date("2026-07-19T12:01:00Z"),
        }),
      }),
    );
  });

  it("returns a positive retry duration from shared state", async () => {
    mocks.findUnique.mockResolvedValue({ resetAt: new Date("2026-07-19T12:00:30Z") });
    await expect(
      getProviderAvailability(new Date("2026-07-19T12:00:00Z")),
    ).resolves.toEqual({ available: false, retryAfterSeconds: 30 });
  });

  it("treats expired state as available", async () => {
    mocks.findUnique.mockResolvedValue({ resetAt: new Date("2026-07-19T11:59:00Z") });
    await expect(
      getProviderAvailability(new Date("2026-07-19T12:00:00Z")),
    ).resolves.toEqual({ available: true, retryAfterSeconds: 0 });
  });

  it("does not classify recipient rejection as provider-wide", () => {
    expect(isProviderWideFailure({ status: "rejected", category: "recipient" })).toBe(false);
    expect(isProviderWideFailure({ status: "unknown", category: "connection" })).toBe(true);
  });
});