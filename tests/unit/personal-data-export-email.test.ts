// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectName: "VersMedit",
  sendTransactionalEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/index", () => ({
  sendTransactionalEmail: mocks.sendTransactionalEmail,
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({ PROJECT_NAME: mocks.projectName }),
}));

import {
  buildPersonalDataExportEmail,
  sendPersonalDataExportEmail,
} from "@/modules/account/data-export/email";

const localeCopy = {
  en: {
    subject: "Confirm your VersMedit personal data export",
    action: "Confirm data export",
  },
  es: {
    subject: "Confirma la exportación de tus datos personales de VersMedit",
    action: "Confirmar la exportación de datos",
  },
  ca: {
    subject: "Confirma l'exportació de les teves dades personals de VersMedit",
    action: "Confirma l'exportació de dades",
  },
} as const;

describe("personal data export email", () => {
  beforeEach(() => {
    mocks.projectName = "VersMedit";
    mocks.sendTransactionalEmail.mockReset();
    mocks.sendTransactionalEmail.mockResolvedValue({ accepted: true });
  });

  it.each(Object.entries(localeCopy))(
    "builds one intended localized %s confirmation link",
    (locale, copy) => {
      const rawToken = Buffer.alloc(32, 5).toString("base64url");
      const message = buildPersonalDataExportEmail(
        {
          recipient: "private@example.test",
          rawToken,
          locale: locale as keyof typeof localeCopy,
          origin: "https://app.example.test",
        },
        mocks.projectName,
      );
      const expectedUrl = `https://app.example.test/api/account/data-export/verify?token=${rawToken}&locale=${locale}`;

      expect(message).toMatchObject({
        recipient: "private@example.test",
        locale,
        subject: copy.subject,
      });
      expect(message.text).toContain(`${copy.action}: ${expectedUrl}`);
      expect(message.html.match(/<a\s/gu)).toHaveLength(1);
      expect(message.html.match(/href=/gu)).toHaveLength(1);
      expect(message.html).toContain(`href="${expectedUrl.replace("&", "&amp;")}"`);
      expect(message.subject).not.toContain("private@example.test");
      expect(expectedUrl).not.toContain("private%40example.test");
    },
  );

  it("escapes project content in HTML and submits through the common provider", async () => {
    mocks.projectName = "<VersMedit & Co>";
    const options = {
      recipient: "private@example.test",
      rawToken: Buffer.alloc(32, 6).toString("base64url"),
      locale: "en" as const,
      origin: "https://app.example.test",
    };

    const message = buildPersonalDataExportEmail(options, mocks.projectName);
    expect(message.html).not.toContain("<VersMedit & Co>");
    expect(message.html).toContain("&lt;VersMedit &amp; Co&gt;");
    await sendPersonalDataExportEmail(options);
    expect(mocks.sendTransactionalEmail).toHaveBeenCalledWith(
      message,
      undefined,
      undefined,
      { logAttempt: false },
    );
  });
});