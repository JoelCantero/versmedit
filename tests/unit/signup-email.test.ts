// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/index", () => ({
  sendTransactionalEmail: mocks.sendTransactionalEmail,
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ PROJECT_NAME: "versmedit" }),
}));

import {
  buildActiveAccountEmail,
  buildOnboardingEmail,
  sendActiveAccountEmail,
  sendOnboardingEmail,
} from "@/modules/signup/email";

const projectName = "versmedit";

const localeCopy = {
  en: {
    onboardingSubject: `Complete your ${projectName} signup`,
    onboardingText: "Finish creating your account within 15 minutes",
    activeSubject: `A ${projectName} account already exists`,
    activeText: "An account already exists for this email address. Sign in instead.",
    loginPath: "/login",
  },
  es: {
    onboardingSubject: `Completa tu registro en ${projectName}`,
    onboardingText: "Termina de crear tu cuenta en un plazo de 15 minutos",
    activeSubject: `Ya existe una cuenta de ${projectName}`,
    activeText: "Ya existe una cuenta para esta dirección de correo. Inicia sesión.",
    loginPath: "/es/login",
  },
  ca: {
    onboardingSubject: `Completa el teu registre a ${projectName}`,
    onboardingText: "Acaba de crear el teu compte en un termini de 15 minuts",
    activeSubject: `Ja existeix un compte de ${projectName}`,
    activeText: "Ja existeix un compte per a aquesta adreça electrònica. Inicia la sessió.",
    loginPath: "/ca/login",
  },
} as const;

describe("signup email", () => {
  beforeEach(() => {
    mocks.sendTransactionalEmail.mockReset();
    mocks.sendTransactionalEmail.mockResolvedValue({
      accepted: true,
      providerMessageId: null,
      provider: "brevo",
      category: "accepted",
    });
  });

  it.each(Object.entries(localeCopy))(
    "builds a credential-bearing %s onboarding email",
    (locale, copy) => {
      const message = buildOnboardingEmail(
        {
          recipient: "person@example.test",
          rawToken: "raw_signup_token",
          locale: locale as keyof typeof localeCopy,
          origin: "https://app.example.test",
        },
        projectName,
      );

      expect(message).toMatchObject({
        recipient: "person@example.test",
        locale,
        subject: copy.onboardingSubject,
      });
      expect(message.text).toContain(copy.onboardingText);
      expect(message.text).toContain(
        "https://app.example.test/api/signup/activate?token=raw_signup_token",
      );
      expect(message.html).toContain("raw_signup_token");
      expect(message.text).not.toContain("person@example.test");
    },
  );

  it.each(Object.entries(localeCopy))(
    "builds a credential-free %s active-account notice",
    (locale, copy) => {
      const message = buildActiveAccountEmail(
        {
          recipient: "person@example.test",
          locale: locale as keyof typeof localeCopy,
          origin: "https://app.example.test",
        },
        projectName,
      );

      expect(message).toMatchObject({
        recipient: "person@example.test",
        locale,
        subject: copy.activeSubject,
      });
      expect(message.text).toContain(copy.activeText);
      expect(message.text).toContain(`https://app.example.test${copy.loginPath}`);
      expect(`${message.text}${message.html}`).not.toMatch(
        /token=|\/api\/signup\/activate/i,
      );
    },
  );

  it.each(Object.keys(localeCopy) as Array<keyof typeof localeCopy>)(
    "submits the complete %s onboarding message through the common boundary",
    async (locale) => {
      const options = {
        recipient: "person@example.test",
        rawToken: "raw_signup_token",
        locale,
        origin: "https://app.example.test",
      };

      await expect(sendOnboardingEmail(options)).resolves.toEqual(
        expect.objectContaining({ accepted: true }),
      );

      expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(
        buildOnboardingEmail(options, projectName),
      );
      expect(mocks.sendTransactionalEmail.mock.calls[0]?.[0]).not.toHaveProperty(
        "from",
      );
    },
  );

  it.each(Object.keys(localeCopy) as Array<keyof typeof localeCopy>)(
    "submits the credential-free %s active-account notice through the common boundary",
    async (locale) => {
      const options = {
        recipient: "person@example.test",
        locale,
        origin: "https://app.example.test",
      };

      await expect(sendActiveAccountEmail(options)).resolves.toEqual(
        expect.objectContaining({ accepted: true }),
      );

      const message = buildActiveAccountEmail(options, projectName);
      expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(message);
      expect(`${message.text}${message.html}`).not.toMatch(
        /token=|\/api\/signup\/activate/i,
      );
    },
  );
});