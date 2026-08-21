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
  expireAccountSessionCookies,
  readAccountSessionToken,
  resolveAccountDeletionSession,
} from "@/modules/account/deletion/session";

describe("account deletion session cookies", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["next-auth.session-token=plain-token", "plain-token"],
    ["__Secure-next-auth.session-token=secure-token", "secure-token"],
    ["other=value; next-auth.session-token=encoded%20token", "encoded token"],
  ])("reads the supported exact cookie from %s", (cookieHeader, expected) => {
    expect(readAccountSessionToken(cookieHeader)).toBe(expected);
  });

  it.each([
    "authjs.session-token=unsupported",
    "sessionToken=forged",
    "next-auth.session-token=%E0%A4%A",
    "",
  ])("rejects an unsupported or malformed cookie %j", (cookieHeader) => {
    expect(readAccountSessionToken(cookieHeader)).toBeNull();
  });

  it("expires both supported cookie variants", () => {
    expect(expireAccountSessionCookies()).toEqual([
      expect.stringMatching(/^next-auth\.session-token=;.*Max-Age=0.*HttpOnly.*SameSite=Lax/i),
      expect.stringMatching(/^__Secure-next-auth\.session-token=;.*Max-Age=0.*HttpOnly.*Secure.*SameSite=Lax/i),
    ]);
  });

  it("resolves only an active, unexpired, recently authenticated exact session", async () => {
    const now = new Date("2026-08-21T12:00:00.000Z");
    mocks.sessionFindUnique.mockResolvedValue({
      sessionToken: "exact",
      userId: "owner",
      expires: new Date("2026-08-22T12:00:00.000Z"),
      authenticatedAt: new Date("2026-08-21T11:55:00.000Z"),
      user: {
        id: "owner",
        email: "Owner@Example.test",
        normalizedEmail: "owner@example.test",
        status: "ACTIVE",
      },
    });

    await expect(resolveAccountDeletionSession("exact", now)).resolves.toEqual({
      status: "recent",
      sessionToken: "exact",
      userId: "owner",
      email: "Owner@Example.test",
      normalizedEmail: "owner@example.test",
    });
  });

  it.each([
    [null, "unauthenticated"],
    [
      {
        expires: new Date("2026-08-21T11:59:59.000Z"),
        authenticatedAt: new Date("2026-08-21T11:59:00.000Z"),
        user: { status: "ACTIVE" },
      },
      "unauthenticated",
    ],
    [
      {
        expires: new Date("2026-08-22T12:00:00.000Z"),
        authenticatedAt: null,
        user: { status: "ACTIVE" },
      },
      "stale",
    ],
    [
      {
        expires: new Date("2026-08-22T12:00:00.000Z"),
        authenticatedAt: new Date("2026-08-21T11:49:59.999Z"),
        user: { status: "ACTIVE" },
      },
      "stale",
    ],
    [
      {
        expires: new Date("2026-08-22T12:00:00.000Z"),
        authenticatedAt: new Date("2026-08-21T11:59:00.000Z"),
        user: { status: "PENDING" },
      },
      "unauthenticated",
    ],
  ])("returns %s without disclosing account state", async (record, expectedStatus) => {
    mocks.sessionFindUnique.mockResolvedValue(record);
    await expect(
      resolveAccountDeletionSession("exact", new Date("2026-08-21T12:00:00.000Z")),
    ).resolves.toEqual({ status: expectedStatus });
  });
});