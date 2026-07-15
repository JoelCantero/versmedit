// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getSmtpConfig } from "@/lib/email";
import type { Env } from "@/lib/env";

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

  it("builds an authenticated SMTP transport", () => {
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
        auth: { user: "mailer", pass: "mail-secret" },
      },
      from: "App <no-reply@example.com>",
    });
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
});