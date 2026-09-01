// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailBrand } from "@/lib/email/presentation";
import { createTestEmailBrand } from "../helpers/email-brand";
import { getTestProjectName } from "../helpers/project-name";

const mocks = vi.hoisted(() => ({
  env: {
    PROJECT_NAME: "",
    MAIL: { enabled: false } as
      | { enabled: false }
      | {
          enabled: true;
          provider: "brevo";
          fromEmail: string;
          brand: EmailBrand;
        },
  },
  sendTransactionalEmail: vi.fn(),
  createSignupToken: vi.fn(() => ({ raw: "raw-token" })),
  getPublishedVerificationToken: vi.fn(),
  deleteMany: vi.fn(),
}));
const projectName = getTestProjectName();
const brand = createTestEmailBrand(projectName);
mocks.env.PROJECT_NAME = projectName;

vi.mock("server-only", () => ({}));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("@/lib/auth-adapter", () => ({
  hardenAdapter: (adapter: unknown) => adapter,
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    verificationToken: { deleteMany: mocks.deleteMany },
  },
}));
vi.mock("@/lib/email/index", () => ({
  sendTransactionalEmail: mocks.sendTransactionalEmail,
}));
vi.mock("@/lib/env", () => ({ getEnv: () => mocks.env }));
vi.mock("@/modules/signup/token", () => ({
  createSignupToken: mocks.createSignupToken,
}));
vi.mock("@/modules/login/verification-context", () => ({
  getPublishedVerificationToken: mocks.getPublishedVerificationToken,
}));

interface AuthEmailProvider {
  id: string;
  type: "email";
  name: string;
  from: string;
  maxAge: number;
  generateVerificationToken: () => string;
  sendVerificationRequest: (params: {
    identifier: string;
    url: string;
  }) => Promise<void>;
}

async function configuredProviders() {
  const { authOptions } = await import("@/lib/auth");
  return authOptions.providers as unknown as AuthEmailProvider[];
}

describe("authOptions", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.env.MAIL = { enabled: false };
    mocks.sendTransactionalEmail.mockReset();
    mocks.sendTransactionalEmail.mockResolvedValue({
      accepted: true,
      providerMessageId: null,
      provider: "brevo",
      category: "accepted",
    });
    mocks.createSignupToken.mockReset();
    mocks.createSignupToken.mockReturnValue({ raw: "raw-token" });
    mocks.getPublishedVerificationToken.mockReset();
    mocks.getPublishedVerificationToken.mockResolvedValue({
      identifier: "member@example.test",
      token: "hashed-token",
      code: "7K2QM9XPTR",
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

  it("registers no email provider when the global mail gate is disabled", async () => {
    expect(await configuredProviders()).toEqual([]);
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("registers login plus callback-only signup and deletion providers", async () => {
    mocks.env.MAIL = {
      enabled: true,
      provider: "brevo",
      fromEmail: "no-reply@example.test",
      brand,
    };

    const providers = await configuredProviders();

    expect(providers).toHaveLength(3);
    expect(providers.map(({ id, type, from, maxAge }) => ({ id, type, from, maxAge })))
      .toEqual([
        {
          id: "email",
          type: "email",
          from: "no-reply@example.test",
          maxAge: 5 * 60,
        },
        {
          id: "signup",
          type: "email",
          from: "no-reply@example.test",
          maxAge: 15 * 60,
        },
        {
          id: "account-deletion",
          type: "email",
          from: "no-reply@example.test",
          maxAge: 15 * 60,
        },
      ]);
    expect(providers[0]?.generateVerificationToken()).toBe("raw-token");
    await expect(
      providers[1]?.sendVerificationRequest({
        identifier: "member@example.test",
        url: "https://app.example.test/unused",
      }),
    ).rejects.toThrow(/cannot initiate delivery/i);
    await expect(
      providers[2]?.sendVerificationRequest({
        identifier: "member@example.test",
        url: "https://app.example.test/unused",
      }),
    ).rejects.toThrow(/cannot initiate delivery/i);
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });

  it.each([
    [
      "en",
      "/",
      `Your login code for ${projectName}`,
      "Use the button below to sign in",
    ],
    [
      "es",
      "/es",
      `Tu código de acceso a ${projectName}`,
      "Usa el botón de abajo para iniciar sesión",
    ],
    [
      "ca",
      "/ca",
      `El teu codi d'accés a ${projectName}`,
      "Utilitza el botó de sota per iniciar sessió",
    ],
  ] as const)(
    "sends localized %s subject, text, HTML, and link through the common boundary",
    async (locale, callbackUrl, subject, copy) => {
      mocks.env.MAIL = {
        enabled: true,
        provider: "brevo",
        fromEmail: "no-reply@example.test",
        brand,
      };
      const [provider] = await configuredProviders();
      const url =
        `https://app.example.test/api/auth/callback/email?token=raw-token` +
        `&callbackUrl=${encodeURIComponent(callbackUrl)}`;

      await provider!.sendVerificationRequest({
        identifier: "member@example.test",
        url,
      });

      expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          recipient: "member@example.test",
          locale,
          subject,
          text: expect.stringContaining(copy),
          html: expect.stringMatching(/<!doctype html/i),
        }),
      );
      const sent = mocks.sendTransactionalEmail.mock.calls[0]?.[0] as {
        html: string;
        text: string;
      };
      expect(sent.html).toContain(url.replaceAll("&", "&amp;"));
      expect(sent.text).toContain(url);
      expect(sent.html).toContain("support@example.test");
      expect(mocks.deleteMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    "authentication",
    "rate_limited",
    "recipient_rejected",
    "provider_unavailable",
    "invalid_request",
    "unknown",
  ] as const)("invalidates the exact published token once for %s", async (category) => {
    mocks.env.MAIL = {
      enabled: true,
      provider: "brevo",
      fromEmail: "no-reply@example.test",
      brand,
    };
    mocks.sendTransactionalEmail.mockResolvedValue({
      accepted: false,
      providerMessageId: null,
      provider: "brevo",
      category,
    });
    const [provider] = await configuredProviders();

    await expect(
      provider!.sendVerificationRequest({
        identifier: "member@example.test",
        url: "https://app.example.test/api/auth/callback/email?token=raw-token",
      }),
    ).rejects.toThrow("Email provider did not accept submission");

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        identifier: "member@example.test",
        token: "hashed-token",
      },
    });
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledOnce();
    expect(mocks.deleteMany).toHaveBeenCalledOnce();
  });

  it("compensates an indeterminate boundary exception without exposing it", async () => {
    mocks.env.MAIL = {
      enabled: true,
      provider: "brevo",
      fromEmail: "no-reply@example.test",
      brand,
    };
    mocks.sendTransactionalEmail.mockRejectedValue(
      new Error("private provider response"),
    );
    const [provider] = await configuredProviders();

    await expect(
      provider!.sendVerificationRequest({
        identifier: "member@example.test",
        url: "https://app.example.test/api/auth/callback/email?token=raw-token",
      }),
    ).rejects.toThrow("Email provider did not accept submission");
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledOnce();
    expect(mocks.deleteMany).toHaveBeenCalledOnce();
  });

  it("localizes verification redirects and blocks cross-origin redirects", async () => {
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
        url: "https://evil.example.test/private",
        baseUrl: "https://example.test",
      }),
    ).toBe("https://example.test/");
  });
});