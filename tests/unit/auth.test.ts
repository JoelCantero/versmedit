// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { AUTH_EMAIL_ENABLED: false as boolean, PROJECT_NAME: "versmedit" },
  smtp: null as null | { server: object; from: string },
  emailProvider: vi.fn((options: unknown) => ({ id: "email", options })),
  classifySmtpResult: vi.fn<
    (_identifier: string, _result: { accepted: unknown[]; rejected: unknown[] }) =>
      { status: "accepted" } | { status: "rejected"; category: "recipient" }
  >(() => ({ status: "accepted" })),
  classifySmtpError: vi.fn(() => ({
    status: "unknown" as const,
    category: "connection" as const,
  })),
  markProviderUnavailable: vi.fn(),
  createSignupToken: vi.fn(() => ({ raw: "raw-token" })),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
  closeTransport: vi.fn(),
  getPublishedVerificationToken: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/auth-adapter", () => ({ hardenAdapter: (adapter: unknown) => adapter }));
vi.mock("@/lib/db", () => ({
  db: { verificationToken: { deleteMany: mocks.deleteMany } },
}));
vi.mock("@/lib/email", () => ({
  getEmailProviderConfig: () => (mocks.env.AUTH_EMAIL_ENABLED ? mocks.smtp : null),
  formatEmailSubject: (template: string, projectName: string) =>
    template.replaceAll("{projectName}", () => projectName),
  classifySmtpResult: mocks.classifySmtpResult,
  classifySmtpError: mocks.classifySmtpError,
}));
vi.mock("@/lib/provider-availability", () => ({
  isProviderWideFailure: (outcome: { category: string }) => outcome.category !== "recipient",
  markProviderUnavailable: mocks.markProviderUnavailable,
}));
vi.mock("@/lib/env", () => ({ getEnv: () => mocks.env }));
vi.mock("next-auth/providers/email", () => ({ default: mocks.emailProvider }));
vi.mock("@/modules/signup/token", () => ({ createSignupToken: mocks.createSignupToken }));
vi.mock("@/modules/login/verification-context", () => ({
  getPublishedVerificationToken: mocks.getPublishedVerificationToken,
}));
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
    mocks.classifySmtpError.mockClear();
    mocks.markProviderUnavailable.mockReset();
    mocks.markProviderUnavailable.mockResolvedValue(undefined);
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
    mocks.getPublishedVerificationToken.mockReset();
    mocks.getPublishedVerificationToken.mockResolvedValue({
      identifier: "member@example.test",
      token: "hashed-token",
    });
    mocks.deleteMany.mockReset();
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("keeps database sessions for 30 days and refreshes them daily", async () => {
    const { authOptions } = await import("@/lib/auth");

    expect(authOptions.session).toEqual({
      strategy: "database",
      maxAge: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
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

    expect(authOptions.providers).toHaveLength(2);
    expect(mocks.emailProvider).toHaveBeenCalledWith(
      expect.objectContaining({ maxAge: 900, from: "noreply@example.test" }),
    );
    expect(authOptions.providers.map((provider) =>
      typeof provider === "function" ? "function" : provider.id,
    )).toEqual(["email", "signup"]);
  });

  it("keeps the signup provider callback-only", async () => {
    mocks.env.AUTH_EMAIL_ENABLED = true;
    mocks.smtp = { server: { host: "smtp.example.test" }, from: "noreply@example.test" };

    await import("@/lib/auth");
    const signupOptions = mocks.emailProvider.mock.calls[1]?.[0] as {
      sendVerificationRequest: () => Promise<void>;
    };

    expect(signupOptions).toBeTruthy();
    await expect(signupOptions.sendVerificationRequest()).rejects.toThrow(
      /cannot initiate delivery/i,
    );
  });

  it("localizes verification redirects to the callback locale", async () => {
    const { authOptions } = await import("@/lib/auth");
    const redirect = authOptions.callbacks?.redirect;
    expect(redirect).toBeTypeOf("function");

    expect(
      redirect!({
        url: "/api/auth/error?error=Verification&callbackUrl=%2Fes",
        baseUrl: "https://example.test",
      }),
    ).toBe("https://example.test/es/login/error");

    expect(
      redirect!({
        url: "/api/auth/signin?error=Verification&reason=used&callbackUrl=%2Fca",
        baseUrl: "https://example.test",
      }),
    ).toBe("https://example.test/ca/login/error");
  });

  it("keeps same-origin redirects and blocks cross-origin redirects", async () => {
    const { authOptions } = await import("@/lib/auth");
    const redirect = authOptions.callbacks?.redirect;
    expect(redirect).toBeTypeOf("function");

    expect(
      redirect!({
        url: "https://example.test/login/error?callbackUrl=%2Fca&error=Verification",
        baseUrl: "https://example.test",
      }),
    ).toBe("https://example.test/ca/login/error");

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

    expect(authOptions.pages?.error).toBe("/login/error");
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
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    ["%2Fes", "Tu enlace de acceso a versmedit", "Usa este enlace para iniciar sesión"],
    ["%2Fca", "El teu enllaç d'accés a versmedit", "Utilitza aquest enllaç per iniciar sessió"],
  ])("localizes mail for callback %s", async (callbackUrl, subject, text) => {
    mocks.env.AUTH_EMAIL_ENABLED = true;
    mocks.smtp = { server: { host: "smtp.example.test" }, from: "noreply@example.test" };
    await import("@/lib/auth");
    const providerOptions = mocks.emailProvider.mock.calls[0]?.[0] as {
      sendVerificationRequest: (params: {
        identifier: string;
        url: string;
        provider: { server: object; from: string };
      }) => Promise<void>;
    };

    await providerOptions.sendVerificationRequest({
      identifier: "member@example.test",
      url: `https://example.test/api/auth/callback/email?callbackUrl=${callbackUrl}`,
      provider: { server: {}, from: "noreply@example.test" },
    });

    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ subject, text: expect.stringContaining(text) }),
    );
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
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        identifier: "member@example.test",
        token: "hashed-token",
      },
    });
    expect(mocks.markProviderUnavailable).not.toHaveBeenCalled();
  });

  it("opens the shared cooldown after a provider connection failure", async () => {
    mocks.env.AUTH_EMAIL_ENABLED = true;
    mocks.smtp = { server: { host: "smtp.example.test" }, from: "noreply@example.test" };
    mocks.sendMail.mockRejectedValue(Object.assign(new Error("connection failed"), {
      code: "ECONNREFUSED",
    }));

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
        provider: { server: {}, from: "noreply@example.test" },
      }),
    ).rejects.toThrow("connection failed");

    expect(mocks.classifySmtpError).toHaveBeenCalled();
    expect(mocks.markProviderUnavailable).toHaveBeenCalledOnce();
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "member@example.test", token: "hashed-token" },
    });
  });

  it("does not print delivery secrets while compensating a failure", async () => {
    const smtpCredentialFixture = ["smtp", "credential", "fixture"].join("-");
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    mocks.env.AUTH_EMAIL_ENABLED = true;
    mocks.smtp = {
      server: { host: "smtp.example.test", auth: { pass: smtpCredentialFixture } },
      from: "noreply@example.test",
    };
    mocks.sendMail.mockRejectedValue(new Error("transport unavailable"));

    await import("@/lib/auth");
    const providerOptions = mocks.emailProvider.mock.calls[0]?.[0] as {
      sendVerificationRequest: (params: {
        identifier: string;
        url: string;
        provider: { server: object; from: string };
      }) => Promise<void>;
    };
    await expect(providerOptions.sendVerificationRequest({
      identifier: "private@example.test",
      url: "https://example.test/api/auth/callback/email?token=raw-token-value",
      provider: mocks.smtp,
    })).rejects.toThrow();

    const serializedOutput = JSON.stringify(consoleSpies.flatMap((spy) => spy.mock.calls));
    for (const sensitiveValue of [
      "private@example.test",
      "raw-token-value",
      "hashed-token",
      smtpCredentialFixture,
    ]) {
      expect(serializedOutput).not.toContain(sensitiveValue);
    }
  });
});