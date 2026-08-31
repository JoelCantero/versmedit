// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  tokenFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  hashAccountDeletionToken: vi.fn(),
  createAccountDeletionCredential: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    verificationToken: { findUnique: mocks.tokenFindUnique },
    user: { findUnique: mocks.userFindUnique },
  },
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ AUTH_SECRET: "test-auth-secret" }),
}));
vi.mock("@/modules/account/deletion/token", () => ({
  createAccountDeletionCredential: mocks.createAccountDeletionCredential,
  hashAccountDeletionToken: mocks.hashAccountDeletionToken,
}));

import {
  evaluateAccountDeletionVerificationSession,
  preflightAccountDeletionVerification,
} from "@/modules/account/deletion/service";

const checkedAt = new Date("2026-08-21T12:10:00.000Z");
const rawToken = "d".repeat(43);
const storedToken = {
  identifier: "person@example.test",
  token: "hashed-deletion-token",
  expires: new Date("2026-08-21T12:15:00.000Z"),
  purpose: "ACCOUNT_DELETION",
  locale: "es",
  deliveredAt: new Date("2026-08-21T12:00:00.000Z"),
};
const activeUser = {
  id: "active-user",
  status: "ACTIVE",
};
const candidate = {
  userId: activeUser.id,
  identifier: storedToken.identifier,
  tokenHash: storedToken.token,
  locale: "es" as const,
};

describe("account deletion verification service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashAccountDeletionToken.mockReturnValue(storedToken.token);
    mocks.tokenFindUnique.mockResolvedValue(storedToken);
    mocks.userFindUnique.mockResolvedValue(activeUser);
  });

  it.each([
    ["unknown token", null, "en"],
    [
      "wrong token purpose",
      { ...storedToken, purpose: "SIGNUP", locale: "ca" },
      "ca",
    ],
    [
      "unconfirmed delivery",
      { ...storedToken, deliveredAt: null, locale: "ca" },
      "ca",
    ],
    [
      "expiry at the verification boundary",
      { ...storedToken, expires: checkedAt, locale: "ca" },
      "ca",
    ],
  ])("maps %s to an invalid link", async (_name, token, locale) => {
    mocks.tokenFindUnique.mockResolvedValue(token);

    await expect(
      preflightAccountDeletionVerification(rawToken, {
        now: () => checkedAt,
      }),
    ).resolves.toEqual({ status: "invalid_link", locale });

    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["pending", { ...activeUser, status: "PENDING" }],
  ])("rejects a %s account", async (_name, user) => {
    mocks.userFindUnique.mockResolvedValue(user);

    await expect(
      preflightAccountDeletionVerification(rawToken, {
        now: () => checkedAt,
      }),
    ).resolves.toEqual({ status: "invalid_link", locale: "es" });
  });

  it("returns the minimal candidate and falls back to English locale", async () => {
    mocks.tokenFindUnique.mockResolvedValue({
      ...storedToken,
      locale: "unsupported",
    });

    await expect(
      preflightAccountDeletionVerification(rawToken, {
        now: () => checkedAt,
      }),
    ).resolves.toEqual({
      status: "eligible_candidate",
      candidate: { ...candidate, locale: "en" },
    });

    expect(mocks.hashAccountDeletionToken).toHaveBeenCalledWith(
      rawToken,
      "test-auth-secret",
    );
    expect(mocks.tokenFindUnique).toHaveBeenCalledWith({
      where: { token: storedToken.token },
    });
    expect(mocks.userFindUnique).toHaveBeenCalledWith({
      where: { normalizedEmail: storedToken.identifier },
      select: { id: true, status: true },
    });
  });

  it.each([
    [null, "eligible"],
    [activeUser.id, "eligible"],
    ["another-user", "session_conflict"],
  ] as const)("maps current session %s to %s", (currentUserId, status) => {
    const result = evaluateAccountDeletionVerificationSession(
      candidate,
      currentUserId,
    );

    expect(result).toEqual(
      status === "eligible"
        ? { status, candidate }
        : { status, locale: candidate.locale },
    );
  });
});