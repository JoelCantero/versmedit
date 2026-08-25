// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestEmailBrand } from "../helpers/email-brand";

const mocks = vi.hoisted(() => ({
  projectName: "VersMedit",
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
  buildAccountSecurityEmail,
  sendAccountSecurityEmail,
} from "@/modules/account/security/email";

const brand = createTestEmailBrand("VersMedit");
mocks.brand = brand;

const localeCopy = {
  en: {
    subject: "Confirm your VersMedit account security action",
    introduction:
      "Authenticate with this link to return to Account Security. You will need to choose and confirm the action again.",
    action: "Continue to Account Security",
  },
  es: {
    subject: "Confirma una acción de seguridad en tu cuenta de VersMedit",
    introduction:
      "Autentícate con este enlace para volver a Seguridad de la cuenta. Tendrás que elegir y confirmar la acción de nuevo.",
    action: "Ir a Seguridad de la cuenta",
  },
  ca: {
    subject: "Confirma una acció de seguretat al teu compte de VersMedit",
    introduction:
      "Autentica't amb aquest enllaç per tornar a Seguretat del compte. Hauràs de tornar a triar i confirmar l'acció.",
    action: "Ves a Seguretat del compte",
  },
} as const;

describe("account security email", () => {
  beforeEach(() => {
    mocks.projectName = "VersMedit";
    mocks.sendTransactionalEmail.mockReset();
    mocks.sendTransactionalEmail.mockResolvedValue({
      accepted: true,
      providerMessageId: null,
      provider: "brevo",
      category: "accepted",
    });
  });

  it.each(Object.entries(localeCopy))(
    "builds one intended credential-bearing %s verification link",
    async (locale, copy) => {
      const message = await buildAccountSecurityEmail(
        {
          recipient: "person@example.test",
          rawToken: "raw_security_token",
          locale: locale as keyof typeof localeCopy,
          origin: "https://app.example.test",
        },
        brand,
      );
      const expectedUrl =
        "https://app.example.test/api/account/security/verify?token=raw_security_token";

      expect(message).toMatchObject({
        recipient: "person@example.test",
        locale,
        subject: copy.subject,
      });
      expect(message.text).toContain(copy.introduction);
      expect(message.text).toContain(expectedUrl);
      expect(message.html).toMatch(/<!doctype html/i);
      expect(message.html).toContain("VersMedit");
      expect(message.html).toContain("support@example.test");
      expect(message.html).toContain(`href="${expectedUrl}"`);
      expect(message.text).not.toContain("person@example.test");
    },
  );

  it("escapes branded HTML content and never interpolates the recipient", async () => {
    const unsafeBrand = createTestEmailBrand("<VersMedit & Co>");
    const message = await buildAccountSecurityEmail(
      {
        recipient: "person@example.test",
        rawToken: "raw_security_token",
        locale: "ca",
        origin: "https://app.example.test",
      },
      unsafeBrand,
    );

    expect(message.subject).toContain("<VersMedit & Co>");
    expect(message.html).toContain("Autentica&#x27;t");
    expect(message.html).not.toContain("Autentica't");
    expect(message.html).not.toContain("person@example.test");
    expect(message.html).not.toContain("<VersMedit & Co>");
  });

  it.each(Object.keys(localeCopy) as Array<keyof typeof localeCopy>)(
    "submits the complete %s message through the common provider boundary",
    async (locale) => {
      const options = {
        recipient: "person@example.test",
        rawToken: "raw_security_token",
        locale,
        origin: "https://app.example.test",
      };

      await expect(sendAccountSecurityEmail(options)).resolves.toEqual(
        expect.objectContaining({ accepted: true }),
      );

      expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(
        await buildAccountSecurityEmail(options, brand),
      );
      expect(mocks.sendTransactionalEmail.mock.calls[0]?.[0]).not.toHaveProperty(
        "from",
      );
    },
  );
});