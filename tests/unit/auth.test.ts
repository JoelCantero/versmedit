// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { AUTH_EMAIL_ENABLED: false as boolean },
  smtp: null as null | { server: object; from: string },
  emailProvider: vi.fn((options: unknown) => ({ id: "email", options })),
}));

vi.mock("server-only", () => ({}));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/auth-adapter", () => ({ hardenAdapter: (adapter: unknown) => adapter }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email", () => ({ getSmtpConfig: () => mocks.smtp }));
vi.mock("@/lib/env", () => ({ getEnv: () => mocks.env }));
vi.mock("next-auth/providers/email", () => ({ default: mocks.emailProvider }));

describe("authOptions", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.env.AUTH_EMAIL_ENABLED = false;
    mocks.smtp = null;
    mocks.emailProvider.mockClear();
  });

  it("does not enable email auth from SMTP configuration alone", async () => {
    mocks.smtp = { server: { host: "smtp.example.test" }, from: "noreply@example.test" };

    const { authOptions } = await import("@/lib/auth");

    expect(authOptions.providers).toEqual([]);
    expect(mocks.emailProvider).not.toHaveBeenCalled();
  });

  it("enables email auth only when the explicit gate and SMTP are present", async () => {
    mocks.env.AUTH_EMAIL_ENABLED = true;
    mocks.smtp = { server: { host: "smtp.example.test" }, from: "noreply@example.test" };

    const { authOptions } = await import("@/lib/auth");

    expect(authOptions.providers).toHaveLength(1);
    expect(mocks.emailProvider).toHaveBeenCalledWith(
      expect.objectContaining({ maxAge: 900, from: "noreply@example.test" }),
    );
  });
});