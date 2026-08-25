// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as emailPresentation from "@/lib/email/presentation";
import { createTestEmailBrand } from "../helpers/email-brand";

const mocks = vi.hoisted(() => ({
  projectName: "",
  brand: undefined as ReturnType<
    typeof import("../helpers/email-brand").createTestEmailBrand
  > | undefined,
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/index", () => ({
  sendTransactionalEmail: mocks.sendTransactionalEmail,
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    PROJECT_NAME: mocks.projectName,
    MAIL: { enabled: true, brand: mocks.brand },
  }),
}));

import {
  buildActiveAccountEmail,
  buildOnboardingEmail,
  sendActiveAccountEmail,
  sendOnboardingEmail,
} from "@/modules/signup/email";
import { getTestProjectName } from "../helpers/project-name";

const projectName = getTestProjectName();
mocks.projectName = projectName;
const brand = createTestEmailBrand(projectName);
mocks.brand = brand;

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
    async (locale, copy) => {
      const message = await buildOnboardingEmail(
        {
          recipient: "person@example.test",
          rawToken: "raw_signup_token",
          locale: locale as keyof typeof localeCopy,
          origin: "https://app.example.test",
        },
        brand,
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
      expect(message.html).toMatch(/<!doctype html/i);
      expect(message.html).toContain(projectName);
      expect(message.html).toContain("support@example.test");
      expect(message.html).toContain("Example Workspace, S.L.");
      expect(message.html).toContain("raw_signup_token");
      expect(message.text).not.toContain("person@example.test");
    },
  );

  it.each(Object.entries(localeCopy))(
    "builds a credential-free %s active-account notice",
    async (locale, copy) => {
      const message = await buildActiveAccountEmail(
        {
          recipient: "person@example.test",
          locale: locale as keyof typeof localeCopy,
          origin: "https://app.example.test",
        },
        brand,
      );

      expect(message).toMatchObject({
        recipient: "person@example.test",
        locale,
        subject: copy.activeSubject,
      });
      expect(message.text).toContain(copy.activeText);
      expect(message.text).toContain(`https://app.example.test${copy.loginPath}`);
      expect(message.html).toMatch(/<!doctype html/i);
      expect(message.html).toContain(projectName);
      expect(message.html).toContain("support@example.test");
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
        await buildOnboardingEmail(options, brand),
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

      const message = await buildActiveAccountEmail(options, brand);
      expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(message);
      expect(`${message.text}${message.html}`).not.toMatch(
        /token=|\/api\/signup\/activate/i,
      );
    },
  );

  it("finishes presentation before making a delivery attempt", async () => {
    vi.spyOn(emailPresentation, "renderEmailPresentation").mockRejectedValueOnce(
      new Error("simulated presentation failure"),
    );

    await expect(
      sendOnboardingEmail({
        recipient: "person@example.test",
        rawToken: "raw_signup_token",
        locale: "en",
        origin: "https://app.example.test",
      }),
    ).rejects.toThrow("simulated presentation failure");
    expect(mocks.sendTransactionalEmail).not.toHaveBeenCalled();
  });
});