// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestEmailBrand } from "../helpers/email-brand";

const mocks = vi.hoisted(() => ({
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
    PROJECT_NAME: "Example Workspace",
    MAIL: { enabled: true, brand: mocks.brand },
  }),
}));

import {
  buildAccountDeletionEmail,
  sendAccountDeletionEmail,
} from "@/modules/account/deletion/email";

const brand = createTestEmailBrand("Example Workspace");
mocks.brand = brand;

const localeCopy = {
  en: {
    subject: "Confirm your Example Workspace account deletion",
    introduction:
      "Authenticate with this link to continue reviewing permanent account deletion.",
    action: "Continue account deletion",
  },
  es: {
    subject: "Confirma la eliminación de tu cuenta de Example Workspace",
    introduction:
      "Autentícate con este enlace para seguir revisando la eliminación permanente de la cuenta.",
    action: "Continuar con la eliminación de la cuenta",
  },
  ca: {
    subject: "Confirma l'eliminació del teu compte de Example Workspace",
    introduction:
      "Autentica't amb aquest enllaç per continuar revisant l'eliminació permanent del compte.",
    action: "Continua amb l'eliminació del compte",
  },
} as const;

describe("account deletion email", () => {
  beforeEach(() => {
    mocks.brand = brand;
    mocks.sendTransactionalEmail.mockReset();
    mocks.sendTransactionalEmail.mockResolvedValue({
      accepted: true,
      providerMessageId: null,
      provider: "brevo",
      category: "accepted",
    });
  });

  it.each(Object.entries(localeCopy))(
    "renders one branded %s deletion credential",
    async (locale, copy) => {
      const message = await buildAccountDeletionEmail(
        {
          recipient: "person@example.test",
          rawToken: "raw_deletion_token",
          locale: locale as keyof typeof localeCopy,
          origin: "https://app.example.test",
        },
        brand,
      );
      const expectedUrl =
        "https://app.example.test/api/account/deletion/verify?token=raw_deletion_token";

      expect(message).toMatchObject({
        recipient: "person@example.test",
        locale,
        subject: copy.subject,
      });
      expect(message.text).toContain(copy.introduction);
      expect(message.text).toContain(copy.action);
      expect(message.text).toContain(expectedUrl);
      expect(message.html).toMatch(/<!doctype html/i);
      expect(message.html).toContain("Example Workspace");
      expect(message.html).toContain("support@example.test");
      expect(message.html).toContain(`href="${expectedUrl}"`);
      expect(message.text.match(/raw_deletion_token/gu)).toHaveLength(1);
      const credentialDestinations = [
        ...message.html.matchAll(/href="([^"]*raw_deletion_token[^"]*)"/gu),
      ].map((match) => match[1]);
      expect(new Set(credentialDestinations)).toEqual(new Set([expectedUrl]));
      expect(message.html).not.toContain("person@example.test");
    },
  );

  it("escapes brand content and submits once through the common boundary", async () => {
    const unsafeBrand = createTestEmailBrand("<Example Workspace & Co>");
    mocks.brand = unsafeBrand;
    const options = {
      recipient: "person@example.test",
      rawToken: "raw_deletion_token",
      locale: "ca" as const,
      origin: "https://app.example.test",
    };
    const message = await buildAccountDeletionEmail(options, unsafeBrand);

    expect(message.subject).toContain("<Example Workspace & Co>");
    expect(message.html).toContain("&lt;Example Workspace &amp; Co&gt;");
    expect(message.html).not.toContain("<Example Workspace & Co>");

    await expect(sendAccountDeletionEmail(options)).resolves.toEqual(
      expect.objectContaining({ accepted: true }),
    );
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledOnce();
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(message);
    expect(mocks.sendTransactionalEmail.mock.calls[0]?.[0]).not.toHaveProperty(
      "from",
    );
  });
});
