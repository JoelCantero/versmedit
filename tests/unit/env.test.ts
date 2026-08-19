import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { validateEnv } from "@/lib/env";

describe("validateEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PROJECT_NAME;
    delete process.env.DATABASE_URL;
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_URL;
    delete process.env.LOG_LEVEL;
    delete process.env.MAIL_ENABLED;
    delete process.env.MAIL_PROVIDER;
    delete process.env.MAIL_API_KEY;
    delete process.env.MAIL_API_SECRET;
    delete process.env.MAIL_FROM;
    delete process.env.MAIL_API_BASE_URL;
    delete process.env.MAIL_FROM_NAME;
    delete process.env.TRUST_PROXY_HEADERS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws when required env vars are missing", () => {
    expect(() => validateEnv(process.env)).toThrow(/DATABASE_URL/);
  });

  it("returns a normalized config when required env vars are present", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";

    const env = validateEnv(process.env);

    expect(env).toMatchObject({
      PROJECT_NAME: "test-app",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
      AUTH_SECRET: "test-auth-secret-at-least-32-chars-long",
      NEXTAUTH_URL: "https://app.example.com",
    });
  });

  it("rejects a canonical auth URL with a path", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com/untrusted-base";

    expect(() => validateEnv(process.env)).toThrow(/NEXTAUTH_URL/);
  });

  it("throws when AUTH_SECRET is shorter than 32 characters", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "too-short";
    process.env.NEXTAUTH_URL = "https://app.example.com";

    expect(() => validateEnv(process.env)).toThrow(/AUTH_SECRET/);
  });

  it("accepts a recognized LOG_LEVEL", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.LOG_LEVEL = "debug";

    expect(validateEnv(process.env)).toMatchObject({ LOG_LEVEL: "debug" });
  });

  it("throws when LOG_LEVEL is not a recognized level", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.LOG_LEVEL = "verbose";

    expect(() => validateEnv(process.env)).toThrow(/LOG_LEVEL/);
  });

  it("treats an empty LOG_LEVEL as unset", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.LOG_LEVEL = "";

    expect(validateEnv(process.env)).toMatchObject({ LOG_LEVEL: undefined });
  });

  it("keeps all transactional email disabled by default", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";

    expect(validateEnv(process.env)).toMatchObject({
      MAIL: { enabled: false },
      TRUST_PROXY_HEADERS: false,
    });
  });

  it("does not let provider credentials enable a disabled gate", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.MAIL_ENABLED = "false";
    process.env.MAIL_PROVIDER = "mailjet";
    process.env.MAIL_API_KEY = "unused-key";
    process.env.MAIL_API_SECRET = "unused-secret";
    process.env.MAIL_FROM = "unused@example.test";

    expect(validateEnv(process.env).MAIL).toEqual({ enabled: false });
  });

  it("normalizes complete Brevo configuration and drops a Mailjet secret", () => {
    process.env.PROJECT_NAME = "  test-app  ";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.MAIL_ENABLED = "true";
    process.env.MAIL_PROVIDER = "brevo";
    process.env.MAIL_API_KEY = "brevo-key";
    process.env.MAIL_API_SECRET = "must-not-survive";
    process.env.MAIL_FROM = "no-reply@example.test";

    expect(validateEnv(process.env).MAIL).toEqual({
      enabled: true,
      provider: "brevo",
      apiKey: "brevo-key",
      fromEmail: "no-reply@example.test",
      senderName: "test-app",
      sendTimeoutMs: 2_500,
      healthTimeoutMs: 1_500,
      responseLimitBytes: 65_536,
    });
  });

  it("normalizes complete Mailjet configuration", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.MAIL_ENABLED = "true";
    process.env.MAIL_PROVIDER = "mailjet";
    process.env.MAIL_API_KEY = "mailjet-key";
    process.env.MAIL_API_SECRET = "mailjet-secret";
    process.env.MAIL_FROM = "no-reply@example.test";

    expect(validateEnv(process.env).MAIL).toEqual({
      enabled: true,
      provider: "mailjet",
      apiKey: "mailjet-key",
      apiSecret: "mailjet-secret",
      fromEmail: "no-reply@example.test",
      senderName: "test-app",
      sendTimeoutMs: 2_500,
      healthTimeoutMs: 1_500,
      responseLimitBytes: 65_536,
    });
  });

  it.each(["1", "yes", "TRUE", " true "])(
    "rejects invalid MAIL_ENABLED value %j",
    (value) => {
      process.env.PROJECT_NAME = "test-app";
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
      process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
      process.env.NEXTAUTH_URL = "https://app.example.com";
      process.env.MAIL_ENABLED = value;

      expect(() => validateEnv(process.env)).toThrow(/MAIL_ENABLED/);
    },
  );

  it.each([undefined, "resend", "Brevo"])(
    "rejects enabled unsupported provider %j",
    (provider) => {
      process.env.PROJECT_NAME = "test-app";
      process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
      process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
      process.env.NEXTAUTH_URL = "https://app.example.com";
      process.env.MAIL_ENABLED = "true";
      if (provider) process.env.MAIL_PROVIDER = provider;
      process.env.MAIL_API_KEY = "provider-key";
      process.env.MAIL_FROM = "no-reply@example.test";

      expect(() => validateEnv(process.env)).toThrow(/MAIL_PROVIDER/);
    },
  );

  it.each([
    ["MAIL_API_KEY", "brevo", undefined],
    ["MAIL_API_SECRET", "mailjet", "provider-key"],
    ["MAIL_FROM", "brevo", "provider-key"],
  ])("requires %s for enabled %s", (field, provider, apiKey) => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.MAIL_ENABLED = "true";
    process.env.MAIL_PROVIDER = provider;
    if (apiKey) process.env.MAIL_API_KEY = apiKey;
    if (field !== "MAIL_FROM") process.env.MAIL_FROM = "no-reply@example.test";

    expect(() => validateEnv(process.env)).toThrow(new RegExp(field));
  });

  it.each([
    ["MAIL_FROM", "Display Name <no-reply@example.test>"],
    ["MAIL_FROM", "not-an-email"],
    ["PROJECT_NAME", "x".repeat(71)],
    ["PROJECT_NAME", "unsafe\nname"],
  ])("rejects invalid %s", (field, value) => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.MAIL_ENABLED = "true";
    process.env.MAIL_PROVIDER = "brevo";
    process.env.MAIL_API_KEY = "provider-key";
    process.env.MAIL_FROM = "no-reply@example.test";
    process.env[field] = value;

    expect(() => validateEnv(process.env)).toThrow(new RegExp(field));
  });

  it("keeps validation errors redacted and ignores unsupported endpoint variables", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.MAIL_ENABLED = "true";
    process.env.MAIL_PROVIDER = "brevo";
    process.env.MAIL_API_KEY = "fixture-private-api-key";
    process.env.MAIL_FROM = "private-invalid-sender";
    process.env.MAIL_API_BASE_URL = "https://attacker.example";
    process.env.MAIL_FROM_NAME = "Injected Sender";

    expect(() => validateEnv(process.env)).toThrow(/MAIL_FROM/);
    try {
      validateEnv(process.env);
    } catch (error) {
      const output = String(error);
      expect(output).not.toContain("fixture-private-api-key");
      expect(output).not.toContain("private-invalid-sender");
      expect(output).not.toContain("attacker.example");
    }

    process.env.MAIL_FROM = "no-reply@example.test";
    const env = validateEnv(process.env);
    expect(env).not.toHaveProperty("MAIL_API_BASE_URL");
    expect(env).not.toHaveProperty("MAIL_FROM_NAME");
  });

  it("normalizes an explicitly trusted proxy boundary", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.TRUST_PROXY_HEADERS = "true";

    expect(validateEnv(process.env)).toMatchObject({ TRUST_PROXY_HEADERS: true });
  });
});
