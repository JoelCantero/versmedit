// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  executeRaw: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
  tokenDeleteMany: vi.fn(),
  tokenCreate: vi.fn(),
  createSignupCredential: vi.fn(),
  sendOnboardingEmail: vi.fn(),
  sendActiveAccountEmail: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { $transaction: mocks.transaction },
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
}));
vi.mock("@/modules/signup/email", () => ({
  sendOnboardingEmail: mocks.sendOnboardingEmail,
  sendActiveAccountEmail: mocks.sendActiveAccountEmail,
}));

import {
  acceptedSignupResponse,
  processSignup,
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
    mocks.createSignupCredential.mockReturnValue({
      raw: "raw-signup-token",
      persisted: { token: "hashed-signup-token", expires },
    });
    mocks.sendOnboardingEmail.mockResolvedValue({ status: "accepted" });
    mocks.sendActiveAccountEmail.mockResolvedValue({ status: "accepted" });
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
      },
    });
    expect(mocks.sendOnboardingEmail).toHaveBeenCalledWith({
      recipient: request.email,
      rawToken: "raw-signup-token",
      locale: request.locale,
      origin: "https://app.example.test",
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
    expect(mocks.executeRaw).toHaveBeenCalledOnce();
    expect(mocks.executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.userFindUnique.mock.invocationCallOrder[0]!,
    );
  });

  it("removes only the failed new token and never restores a predecessor", async () => {
    mocks.sendOnboardingEmail.mockResolvedValue({
      status: "rejected",
      category: "recipient",
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
    const response = await acceptedSignupResponse({
      startedAt: 1_000,
      now: () => 1_125,
      random: () => 0.5,
      sleep,
    });

    expect(sleep).toHaveBeenCalledWith(425);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
  });
});