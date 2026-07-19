// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { AUTH_EMAIL_ENABLED: false as boolean },
  smtp: null as null | { server: object; from: string },
  emailProvider: vi.fn((options: unknown) => ({ id: "email", options })),
  classifySmtpResult: vi.fn<
    (_identifier: string, _result: { accepted: unknown[]; rejected: unknown[] }) =>
      { status: "accepted" | "rejected"; category?: "recipient" }
  >(() => ({ status: "accepted" })),
  createSignupToken: vi.fn(() => ({ raw: "raw-token" })),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  closeTransport: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/auth-adapter", () => ({ hardenAdapter: (adapter: unknown) => adapter }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/email", () => ({
  getEmailProviderConfig: () => (mocks.env.AUTH_EMAIL_ENABLED ? mocks.smtp : null),
  classifySmtpResult: mocks.classifySmtpResult,
}));
vi.mock("@/lib/env", () => ({ getEnv: () => mocks.env }));
vi.mock("next-auth/providers/email", () => ({ default: mocks.emailProvider }));
vi.mock("@/modules/signup/token", () => ({ createSignupToken: mocks.createSignupToken }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport,
  },
}));

describe("authOptions", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.env.AUTH_EMAIL_ENABLED = false;
    mocks.smtp = null;
    mocks.emailProvider.mockClear();
    mocks.classifySmtpResult.mockReset();
    mocks.classifySmtpResult.mockReturnValue({ status: "accepted" });
    mocks.createSignupToken.mockReset();
    mocks.createSignupToken.mockReturnValue({ raw: "raw-token" });
    mocks.sendMail.mockReset();
    mocks.sendMail.mockResolvedValue({ accepted: ["member@example.test"], rejected: [] });
    mocks.closeTransport.mockReset();
    mocks.createTransport.mockReset();
    mocks.createTransport.mockReturnValue({
      sendMail: mocks.sendMail,
      close: mocks.closeTransport,
    });
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

  it("localizes verification redirects to the callback locale", async () => {
    const { authOptions } = await import("@/lib/auth");
    const redirect = authOptions.callbacks?.redirect;
    expect(redirect).toBeTypeOf("function");

    expect(
      redirect!({
        url: "/api/auth/error?error=Verification&callbackUrl=%2Fes%2Fsignup",
        baseUrl: "https://example.test",
      }),
    ).toBe("https://example.test/es/signup/error?reason=invalid");

    expect(
      redirect!({
        url: "/api/auth/signin?error=Verification&reason=used&callbackUrl=%2Fca%2Fsignup",
        baseUrl: "https://example.test",
      }),
    ).toBe("https://example.test/ca/signup/error?reason=used");
  });

  it("keeps same-origin redirects and blocks cross-origin redirects", async () => {
    const { authOptions } = await import("@/lib/auth");
    const redirect = authOptions.callbacks?.redirect;
    expect(redirect).toBeTypeOf("function");

    expect(
      redirect!({
        url: "https://example.test/signup/error?callbackUrl=%2Fca%2Fsignup&error=Verification",
        baseUrl: "https://example.test",
      }),
    ).toBe("https://example.test/ca/signup/error?callbackUrl=%2Fca%2Fsignup&error=Verification");

    expect(
      redirect!({
        url: "https://evil.example.test/pwn",
        baseUrl: "https://example.test",
      }),
    ).toBe("https://example.test/");
  });

  it("uses signup token generation and accepted transport classification", async () => {
    mocks.env.AUTH_EMAIL_ENABLED = true;
    mocks.smtp = { server: { host: "smtp.example.test" }, from: "noreply@example.test" };

    const { authOptions } = await import("@/lib/auth");
    const providerOptions = mocks.emailProvider.mock.calls[0]?.[0] as {
      generateVerificationToken: () => string;
      sendVerificationRequest: (params: {
        identifier: string;
        url: string;
        provider: { server: object; from: string };
      }) => Promise<void>;
      from: string;
    };

    expect(authOptions.pages?.error).toBe("/signup/error");
    expect(providerOptions.generateVerificationToken()).toBe("raw-token");
    expect(mocks.createSignupToken).toHaveBeenCalled();

    await providerOptions.sendVerificationRequest({
      identifier: "member@example.test",
      url: "https://example.test/api/auth/callback/email?token=abc",
      provider: {
        server: { host: "smtp.example.test" },
        from: "noreply@example.test",
      },
    });

    expect(mocks.createTransport).toHaveBeenCalledWith({ host: "smtp.example.test" });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "member@example.test", from: "noreply@example.test" }),
    );
    expect(mocks.classifySmtpResult).toHaveBeenCalledWith("member@example.test", {
      accepted: ["member@example.test"],
      rejected: [],
    });
    expect(mocks.closeTransport).toHaveBeenCalled();
  });

  it("throws when transport outcome is not accepted", async () => {
    mocks.env.AUTH_EMAIL_ENABLED = true;
    mocks.smtp = { server: { host: "smtp.example.test" }, from: "noreply@example.test" };
    mocks.classifySmtpResult.mockReturnValue({ status: "rejected", category: "recipient" });

    await import("@/lib/auth");
    const providerOptions = mocks.emailProvider.mock.calls[0]?.[0] as {
      sendVerificationRequest: (params: {
        identifier: string;
        url: string;
        provider: { server: object; from: string };
      }) => Promise<void>;
    };

    await expect(
      providerOptions.sendVerificationRequest({
        identifier: "member@example.test",
        url: "https://example.test/api/auth/callback/email?token=abc",
        provider: {
          server: { host: "smtp.example.test" },
          from: "noreply@example.test",
        },
      }),
    ).rejects.toThrow("email provider did not accept intended recipient");

    expect(mocks.closeTransport).toHaveBeenCalled();
  });
});