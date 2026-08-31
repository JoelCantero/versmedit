// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  executeRaw: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  activationTokenFindUnique: vi.fn(),
  activationUserFindUnique: vi.fn(),
  tokenDeleteMany: vi.fn(),
  tokenCreate: vi.fn(),
  tokenUpdateMany: vi.fn(),
  createSignupCredential: vi.fn(),
  hashSignupToken: vi.fn(),
  sendOnboardingEmail: vi.fn(),
  sendActiveAccountEmail: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: mocks.transaction,
    verificationToken: { findUnique: mocks.activationTokenFindUnique },
    user: { findUnique: mocks.activationUserFindUnique },
  },
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    AUTH_SECRET: "test-auth-secret",
    NEXTAUTH_URL: "https://app.example.test",
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.logInfo, warn: mocks.logWarn },
}));
vi.mock("@/modules/signup/token", () => ({
  createSignupCredential: mocks.createSignupCredential,
  hashSignupToken: mocks.hashSignupToken,
}));
vi.mock("@/modules/signup/email", () => ({
  sendOnboardingEmail: mocks.sendOnboardingEmail,
  sendActiveAccountEmail: mocks.sendActiveAccountEmail,
}));

import {
  evaluateSignupActivationSession,
  preflightSignupActivation,
  processSignup,
  resolveSignupActivationFailure,
  waitForAcceptedSignup,
} from "@/modules/signup/service";

const request = {
  name: "José O’Neil",
  email: "person@example.test",
  policyAccepted: true as const,
  locale: "es" as const,
  csrfToken: "csrf",
};
const issuedAt = new Date("2026-08-18T12:00:00.000Z");
const expires = new Date("2026-08-18T12:15:00.000Z");
const activationCheckedAt = new Date("2026-08-18T12:10:00.000Z");
const rawActivationToken = "a".repeat(43);
const activationToken = {
  identifier: request.email,
  token: "hashed-activation-token",
  expires,
  purpose: "SIGNUP",
  locale: "es",
  deliveredAt: issuedAt,
};
const activationUser = {
  id: "pending-user",
  status: "PENDING",
};
const activationCandidate = {
  userId: activationUser.id,
  identifier: activationToken.identifier,
  tokenHash: activationToken.token,
  locale: "es" as const,
};

describe("signup service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) =>
      callback({
        $executeRaw: mocks.executeRaw,
        user: {
          findUnique: mocks.userFindUnique,
          create: mocks.userCreate,
        },
        verificationToken: {
          deleteMany: mocks.tokenDeleteMany,
          create: mocks.tokenCreate,
          updateMany: mocks.tokenUpdateMany,
        },
      }),
    );
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({
      id: "pending-user",
      normalizedEmail: request.email,
      status: "PENDING",
    });
    mocks.tokenCreate.mockResolvedValue({ identifier: request.email });
    mocks.tokenUpdateMany.mockResolvedValue({ count: 1 });
    mocks.createSignupCredential.mockReturnValue({
      raw: "raw-signup-token",
      persisted: { token: "hashed-signup-token", expires },
    });
    mocks.hashSignupToken.mockReturnValue(activationToken.token);
    mocks.activationTokenFindUnique.mockResolvedValue(activationToken);
    mocks.activationUserFindUnique.mockResolvedValue(activationUser);
    mocks.sendOnboardingEmail.mockResolvedValue({ accepted: true });
    mocks.sendActiveAccountEmail.mockResolvedValue({ accepted: true });
  });

  describe("activation verification", () => {
    it.each([
      ["unknown token", null, "en"],
      [
        "wrong token purpose",
        { ...activationToken, purpose: "ACCOUNT_DELETION", locale: "ca" },
        "ca",
      ],
      [
        "unconfirmed delivery",
        { ...activationToken, deliveredAt: null, locale: "ca" },
        "ca",
      ],
      [
        "expiry at the verification boundary",
        { ...activationToken, expires: activationCheckedAt, locale: "ca" },
        "ca",
      ],
    ])("maps %s to an invalid link", async (_name, storedToken, locale) => {
      mocks.activationTokenFindUnique.mockResolvedValue(storedToken);

      await expect(
        preflightSignupActivation(rawActivationToken, {
          now: () => activationCheckedAt,
        }),
      ).resolves.toEqual({ status: "invalid_link", locale });

      expect(mocks.activationUserFindUnique).not.toHaveBeenCalled();
    });

    it.each([
      ["missing", null],
      ["active", { ...activationUser, status: "ACTIVE" }],
    ])("rejects a %s signup account", async (_name, user) => {
      mocks.activationUserFindUnique.mockResolvedValue(user);

      await expect(
        preflightSignupActivation(rawActivationToken, {
          now: () => activationCheckedAt,
        }),
      ).resolves.toEqual({ status: "invalid_link", locale: "es" });
    });

    it("returns the minimal candidate and falls back to English locale", async () => {
      mocks.activationTokenFindUnique.mockResolvedValue({
        ...activationToken,
        locale: "unsupported",
      });

      await expect(
        preflightSignupActivation(rawActivationToken, {
          now: () => activationCheckedAt,
        }),
      ).resolves.toEqual({
        status: "eligible_candidate",
        candidate: { ...activationCandidate, locale: "en" },
      });

      expect(mocks.hashSignupToken).toHaveBeenCalledWith(
        rawActivationToken,
        "test-auth-secret",
      );
      expect(mocks.activationTokenFindUnique).toHaveBeenCalledWith({
        where: { token: activationToken.token },
      });
      expect(mocks.activationUserFindUnique).toHaveBeenCalledWith({
        where: { normalizedEmail: activationToken.identifier },
        select: { id: true, status: true },
      });
    });

    it.each([
      [null, "eligible"],
      [activationUser.id, "eligible"],
      ["another-user", "session_conflict"],
    ] as const)(
      "maps current session %s to %s",
      (currentUserId, status) => {
        const result = evaluateSignupActivationSession(
          activationCandidate,
          currentUserId,
        );

        expect(result).toEqual(
          status === "eligible"
            ? { status, candidate: activationCandidate }
            : { status, locale: activationCandidate.locale },
        );
      },
    );

    it("distinguishes durable activation followed by session failure", async () => {
      mocks.activationTokenFindUnique.mockResolvedValue(null);
      mocks.activationUserFindUnique.mockResolvedValue({ status: "ACTIVE" });

      await expect(
        resolveSignupActivationFailure(activationCandidate),
      ).resolves.toEqual({ status: "session_failed", locale: "es" });

      expect(mocks.activationTokenFindUnique).toHaveBeenCalledWith({
        where: { token: activationCandidate.tokenHash },
        select: { token: true },
      });
      expect(mocks.activationUserFindUnique).toHaveBeenCalledWith({
        where: { id: activationCandidate.userId },
        select: { status: true },
      });
    });

    it.each([
      ["token remains", { token: activationToken.token }, { status: "ACTIVE" }],
      ["user remains pending", null, { status: "PENDING" }],
      ["user is missing", null, null],
    ])("uses the generic fallback when %s", async (_name, token, user) => {
      mocks.activationTokenFindUnique.mockResolvedValue(token);
      mocks.activationUserFindUnique.mockResolvedValue(user);

      await expect(
        resolveSignupActivationFailure(activationCandidate),
      ).resolves.toEqual({ status: "invalid_link", locale: "es" });
    });
  });

  it("creates one pending account and link-bound candidate snapshot", async () => {
    await expect(
      processSignup(request, { now: () => issuedAt }),
    ).resolves.toEqual({ outcome: "onboarding_sent" });

    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: {
        email: request.email,
        normalizedEmail: request.email,
        name: null,
        status: "PENDING",
      },
      select: {
        id: true,
        normalizedEmail: true,
        status: true,
      },
    });
    expect(mocks.tokenCreate).toHaveBeenCalledWith({
      data: {
        identifier: request.email,
        token: "hashed-signup-token",
        expires,
        purpose: "SIGNUP",
        proposedName: request.name,
        locale: request.locale,
        termsVersion: "2026-08-18-draft",
        privacyVersion: "2026-08-18-draft",
        acceptedAt: issuedAt,
        createdAt: issuedAt,
        deliveredAt: null,
      },
    });
    expect(mocks.sendOnboardingEmail).toHaveBeenCalledWith({
      recipient: request.email,
      rawToken: "raw-signup-token",
      locale: request.locale,
      origin: "https://app.example.test",
    });
    expect(mocks.tokenUpdateMany).toHaveBeenCalledWith({
      where: {
        identifier: request.email,
        token: "hashed-signup-token",
        purpose: "SIGNUP",
        deliveredAt: null,
      },
      data: { deliveredAt: issuedAt },
    });
  });

  it("reuses a normalized pending account and replaces its candidate", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "pending-user",
      normalizedEmail: request.email,
      status: "PENDING",
    });

    await processSignup(request, { now: () => issuedAt });

    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.tokenDeleteMany).toHaveBeenCalledWith({
      where: { identifier: request.email, purpose: "SIGNUP" },
    });
    expect(mocks.tokenCreate).toHaveBeenCalledOnce();
  });

  it("leaves an active account immutable and sends only a login notice", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "active-user",
      normalizedEmail: request.email,
      status: "ACTIVE",
    });

    await expect(
      processSignup(request, { now: () => issuedAt }),
    ).resolves.toEqual({ outcome: "active_notice_sent" });

    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.createSignupCredential).not.toHaveBeenCalled();
    expect(mocks.tokenDeleteMany).not.toHaveBeenCalled();
    expect(mocks.tokenCreate).not.toHaveBeenCalled();
    expect(mocks.sendActiveAccountEmail).toHaveBeenCalledWith({
      recipient: request.email,
      locale: request.locale,
      origin: "https://app.example.test",
    });
  });

  it("acquires the identity advisory lock before lifecycle lookup", async () => {
    await processSignup(request, { now: () => issuedAt });
    expect(mocks.executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.userFindUnique.mock.invocationCallOrder[0]!,
    );
  });

  it.each([
    "authentication",
    "rate_limited",
    "recipient_rejected",
    "provider_unavailable",
    "invalid_request",
    "unknown",
  ] as const)("removes only the failed new token for %s and never restores a predecessor", async (category) => {
    mocks.sendOnboardingEmail.mockResolvedValue({
      accepted: false,
      category,
    });

    await expect(
      processSignup(request, { now: () => issuedAt }),
    ).resolves.toEqual({ outcome: "onboarding_delivery_failed" });

    expect(mocks.transaction).toHaveBeenCalledTimes(2);
    expect(mocks.tokenDeleteMany).toHaveBeenLastCalledWith({
      where: {
        identifier: request.email,
        token: "hashed-signup-token",
        purpose: "SIGNUP",
      },
    });
    expect(mocks.sendOnboardingEmail).toHaveBeenCalledOnce();
    expect(mocks.tokenUpdateMany).not.toHaveBeenCalled();
  });

  it("maps a non-accepted active-account notice without issuing credentials", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "active-user",
      normalizedEmail: request.email,
      status: "ACTIVE",
    });
    mocks.sendActiveAccountEmail.mockResolvedValue({
      accepted: false,
      category: "provider_unavailable",
    });

    await expect(
      processSignup(request, { now: () => issuedAt }),
    ).resolves.toEqual({ outcome: "active_notice_failed" });

    expect(mocks.sendActiveAccountEmail).toHaveBeenCalledOnce();
    expect(mocks.createSignupCredential).not.toHaveBeenCalled();
    expect(mocks.tokenCreate).not.toHaveBeenCalled();
    expect(mocks.tokenUpdateMany).not.toHaveBeenCalled();
  });

  it("leaves a failed-delivery token provisional when compensation also fails", async () => {
    mocks.sendOnboardingEmail.mockResolvedValue({
      accepted: false,
      category: "recipient_rejected",
    });
    const transactionImplementation = mocks.transaction.getMockImplementation();
    mocks.transaction
      .mockImplementationOnce(transactionImplementation!)
      .mockRejectedValueOnce(new Error("cleanup unavailable"));

    await expect(
      processSignup(request, { now: () => issuedAt }),
    ).resolves.toEqual({ outcome: "onboarding_delivery_failed" });

    expect(mocks.tokenCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveredAt: null }) }),
    );
    expect(mocks.tokenUpdateMany).not.toHaveBeenCalled();
  });

  it("maps isolated persistence failure privately and logs no sensitive data", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      processSignup(request, { now: () => issuedAt }),
    ).resolves.toEqual({ outcome: "processing_failed" });

    const serializedLogs = JSON.stringify([
      ...mocks.logInfo.mock.calls,
      ...mocks.logWarn.mock.calls,
    ]);
    for (const sensitive of [
      request.name,
      request.email,
      "raw-signup-token",
      "hashed-signup-token",
      "2026-08-18-draft",
      "pending-user",
    ]) {
      expect(serializedLogs).not.toContain(sensitive);
    }
  });

  it("applies the accepted floor relative to request start", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const now = vi.fn()
      .mockReturnValueOnce(1_125)
      .mockReturnValueOnce(1_549)
      .mockReturnValue(1_550);
    await expect(
      waitForAcceptedSignup({
        startedAt: 1_000,
        now,
        random: () => 0.5,
        sleep,
      }),
    ).resolves.toBeUndefined();

    expect(sleep.mock.calls).toEqual([[425], [1]]);
  });
});