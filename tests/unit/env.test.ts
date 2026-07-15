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
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_SECURE;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    delete process.env.SMTP_FROM;
    delete process.env.AUTH_EMAIL_ENABLED;
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

  it("normalizes a complete SMTP configuration", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "mailer";
    process.env.SMTP_PASSWORD = "mail-secret";
    process.env.SMTP_FROM = "App <no-reply@example.com>";
    process.env.AUTH_EMAIL_ENABLED = "true";

    expect(validateEnv(process.env)).toMatchObject({
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "mail-secret",
      SMTP_FROM: "App <no-reply@example.com>",
      AUTH_EMAIL_ENABLED: true,
    });
  });

  it("keeps email authentication disabled by default", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";

    expect(validateEnv(process.env)).toMatchObject({
      AUTH_EMAIL_ENABLED: false,
      TRUST_PROXY_HEADERS: false,
    });
  });

  it("normalizes an explicitly trusted proxy boundary", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.TRUST_PROXY_HEADERS = "true";

    expect(validateEnv(process.env)).toMatchObject({ TRUST_PROXY_HEADERS: true });
  });

  it("rejects enabling email authentication without SMTP", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.AUTH_EMAIL_ENABLED = "true";

    expect(() => validateEnv(process.env)).toThrow(/AUTH_EMAIL_ENABLED/);
  });

  it("rejects partial or invalid SMTP configuration", () => {
    process.env.PROJECT_NAME = "test-app";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/app";
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-chars-long";
    process.env.NEXTAUTH_URL = "https://app.example.com";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "not-a-port";

    expect(() => validateEnv(process.env)).toThrow(/SMTP_/);
  });
});
