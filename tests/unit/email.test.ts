// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  providerFindUnique: vi.fn(),
  providerUpsert: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    rateLimitBucket: {
      findUnique: mocks.providerFindUnique,
      upsert: mocks.providerUpsert,
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: mocks.logInfo,
    warn: mocks.logWarn,
    error: mocks.logError,
  },
}));

import {
  classifySmtpError,
  classifySmtpResult,
  getEmailProviderConfig,
  getSmtpConfig,
} from "@/lib/email";
import type { Env } from "@/lib/env";
import {
  getProviderAvailability,
  isProviderWideFailure,
  markProviderUnavailable,
} from "@/lib/provider-availability";

const baseEnv: Env = {
  PROJECT_NAME: "test-app",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
  AUTH_SECRET: "test-auth-secret-at-least-32-chars-long",
  NEXTAUTH_URL: "http://localhost:3000",
  AUTH_EMAIL_ENABLED: false,
  TRUST_PROXY_HEADERS: false,
};

describe("getSmtpConfig", () => {
  it("disables email when SMTP is not configured", () => {
    expect(getSmtpConfig(baseEnv)).toBeNull();
  });

  it("builds an authenticated SMTP transport with the project name as sender", () => {
    expect(
      getSmtpConfig({
        ...baseEnv,
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "mail-secret",
        SMTP_FROM: "App <no-reply@example.com>",
      }),
    ).toEqual({
      server: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
        auth: { user: "mailer", pass: "mail-secret" },
      },
      from: '"test-app" <no-reply@example.com>',
    });
  });

  it("adds the project name when SMTP_FROM is a bare address", () => {
    expect(
      getSmtpConfig({
        ...baseEnv,
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "mail-secret",
        SMTP_FROM: "no-reply@example.com",
      })?.from,
    ).toBe('"test-app" <no-reply@example.com>');
  });

  it("infers implicit TLS for port 465", () => {
    const config = getSmtpConfig({
      ...baseEnv,
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 465,
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "mail-secret",
      SMTP_FROM: "App <no-reply@example.com>",
    });

    expect(config?.server.secure).toBe(true);
  });

  it("requires both the feature gate and complete SMTP configuration", () => {
    expect(getEmailProviderConfig(baseEnv)).toBeNull();
    expect(
      getEmailProviderConfig({
        ...baseEnv,
        AUTH_EMAIL_ENABLED: true,
        SMTP_HOST: "smtp.example.com",
        SMTP_USER: "mailer",
        SMTP_PASSWORD: "mail-secret",
        SMTP_FROM: "no-reply@example.com",
      }),
    ).not.toBeNull();
  });
});

describe("SMTP outcome classification", () => {
  it("accepts only when the intended recipient is accepted and not rejected", () => {
    expect(
      classifySmtpResult("person@example.test", {
        accepted: ["person@example.test"],
        rejected: [],
      }),
    ).toEqual({ status: "accepted" });
    expect(
      classifySmtpResult("person@example.test", {
        accepted: ["other@example.test"],
        rejected: [],
      }),
    ).toEqual({ status: "unknown", category: "partial" });
  });

  it("classifies intended-recipient and SMTP 5xx rejection definitively", () => {
    expect(
      classifySmtpResult("person@example.test", {
        accepted: [],
        rejected: ["person@example.test"],
      }),
    ).toEqual({ status: "rejected", category: "recipient" });
    expect(classifySmtpError({ responseCode: 550 })).toEqual({
      status: "rejected",
      category: "smtp_5xx",
    });
  });

  it("defaults transient and unclassified errors to unknown", () => {
    expect(classifySmtpError({ responseCode: 450 })).toEqual({
      status: "unknown",
      category: "smtp_4xx",
    });
    expect(classifySmtpError({ code: "ETIMEDOUT" })).toEqual({
      status: "unknown",
      category: "timeout",
    });
    expect(classifySmtpError(new Error("provider detail"))).toEqual({
      status: "unknown",
      category: "unclassified",
    });
  });
});

describe("account-independent email provider health", () => {
  it("opens shared health only for transport-level connection and timeout failures", () => {
    for (const category of ["connection", "timeout"] as const) {
      expect(isProviderWideFailure({ status: "unknown", category })).toBe(true);
    }

    for (const category of [
      "recipient",
      "smtp_5xx",
      "smtp_4xx",
      "partial",
      "unclassified",
    ] as const) {
      expect(isProviderWideFailure({ status: "unknown", category })).toBe(false);
    }
  });

  it("transitions one account-independent cooldown marker from available to unavailable and back", async () => {
    const now = new Date("2026-08-18T12:00:00.000Z");
    const resetAt = new Date("2026-08-18T12:01:00.000Z");
    mocks.providerFindUnique.mockResolvedValueOnce(null);

    await expect(getProviderAvailability(now)).resolves.toEqual({
      available: true,
      retryAfterSeconds: 0,
    });
    await markProviderUnavailable(now);
    expect(mocks.providerUpsert).toHaveBeenCalledWith({
      where: { key: "auth:email:provider:unavailable" },
      create: {
        key: "auth:email:provider:unavailable",
        count: 1,
        resetAt,
      },
      update: { count: 1, resetAt },
    });

    mocks.providerFindUnique.mockResolvedValue({ resetAt });
    await expect(getProviderAvailability(now)).resolves.toEqual({
      available: false,
      retryAfterSeconds: 60,
    });
    await expect(
      getProviderAvailability(new Date("2026-08-18T12:01:00.000Z")),
    ).resolves.toEqual({ available: true, retryAfterSeconds: 0 });
  });

  it("never emits recipient or lifecycle-sensitive delivery data to logs", async () => {
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const sensitiveValues = [
      "private@example.test",
      "Private Person",
      "raw-token-value",
      "https://app.example.test/api/signup/activate?token=raw-token-value",
      "2026-08-18T12:00:00.000Z",
      "account-id-123",
      "session-token-456",
    ];

    classifySmtpResult(sensitiveValues[0]!, {
      accepted: [],
      rejected: [sensitiveValues[0]!],
    });
    classifySmtpError(
      Object.assign(new Error(sensitiveValues.join(" ")), {
        code: "ECONNREFUSED",
      }),
    );

    const serializedOutput = JSON.stringify([
      ...mocks.logInfo.mock.calls,
      ...mocks.logWarn.mock.calls,
      ...mocks.logError.mock.calls,
      ...consoleSpies.flatMap((spy) => spy.mock.calls),
    ]);
    for (const sensitiveValue of sensitiveValues) {
      expect(serializedOutput).not.toContain(sensitiveValue);
    }
    for (const spy of consoleSpies) spy.mockRestore();
  });
});