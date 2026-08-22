// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sessionFindUnique: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    session: { findUnique: mocks.sessionFindUnique },
  },
}));

import {
  isRecentlyAuthenticated,
  readAccountSessionToken,
  resolveActiveAccountSession,
} from "@/modules/account/session";

describe("shared account session boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["next-auth.session-token=plain-token", "plain-token"],
    ["__Secure-next-auth.session-token=secure-token", "secure-token"],
    [
      "next-auth.session-token=shared; __Secure-next-auth.session-token=shared",
      "shared",
    ],
    ["other=value; next-auth.session-token=encoded%20token", "encoded token"],
  ])("reads one exact supported cookie from %s", (cookieHeader, expected) => {
    expect(readAccountSessionToken(cookieHeader)).toBe(expected);
  });

  it.each([
    "authjs.session-token=unsupported",
    "sessionToken=forged",
    "next-auth.session-token=%E0%A4%A",
    "next-auth.session-token=one; __Secure-next-auth.session-token=two",
    "",
  ])("rejects unsupported, malformed, or conflicting cookies %j", (cookieHeader) => {
    expect(readAccountSessionToken(cookieHeader)).toBeNull();
  });

  it.each([
    [new Date("2026-08-22T12:00:00.000Z"), true],
    [new Date("2026-08-22T11:50:00.000Z"), true],
    [new Date("2026-08-22T11:49:59.999Z"), false],
    [new Date("2026-08-22T12:00:00.001Z"), false],
    [null, false],
  ])("calculates the inclusive ten-minute freshness window", (value, expected) => {
    expect(
      isRecentlyAuthenticated(value, new Date("2026-08-22T12:00:00.000Z")),
    ).toBe(expected);
  });

  it("resolves the exact unexpired session and active account", async () => {
    const now = new Date("2026-08-22T12:00:00.000Z");
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-id",
      sessionToken: "exact-token",
      userId: "owner",
      expires: new Date("2026-08-23T12:00:00.000Z"),
      authenticatedAt: new Date("2026-08-22T11:55:00.000Z"),
      user: {
        id: "owner",
        email: "Owner@Example.test",
        normalizedEmail: "owner@example.test",
        status: "ACTIVE",
      },
    });

    await expect(resolveActiveAccountSession("exact-token", now)).resolves.toEqual({
      sessionId: "session-id",
      sessionToken: "exact-token",
      userId: "owner",
      email: "Owner@Example.test",
      normalizedEmail: "owner@example.test",
      recentlyAuthenticated: true,
    });
    expect(mocks.sessionFindUnique).toHaveBeenCalledWith({
      where: { sessionToken: "exact-token" },
      select: {
        id: true,
        sessionToken: true,
        userId: true,
        expires: true,
        authenticatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            normalizedEmail: true,
            status: true,
          },
        },
      },
    });
  });

  it.each([
    [null],
    [
      {
        id: "expired",
        expires: new Date("2026-08-22T12:00:00.000Z"),
        user: { status: "ACTIVE" },
      },
    ],
    [
      {
        id: "inactive",
        expires: new Date("2026-08-23T12:00:00.000Z"),
        user: { status: "PENDING" },
      },
    ],
  ])("fails closed for a missing, expired, or inactive session", async (record) => {
    mocks.sessionFindUnique.mockResolvedValue(record);
    await expect(
      resolveActiveAccountSession(
        "exact-token",
        new Date("2026-08-22T12:00:00.000Z"),
      ),
    ).resolves.toBeNull();
  });
});