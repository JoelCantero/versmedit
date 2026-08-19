// @vitest-environment node

import { describe, expect, it } from "vitest";

import { serializeProviderJson } from "@/lib/email/http";
import {
  createSendResult,
  normalizeProviderMessageId,
  validateTransactionalEmail,
  type TransactionalEmail,
  type TransactionalEmailProvider,
} from "@/lib/email/types";

const message: TransactionalEmail = {
  recipient: "person@example.test",
  locale: "es",
  subject: "Asunto seguro",
  text: "Contenido de texto",
  html: "<p>Contenido HTML</p>",
};

describe("transactional email boundary", () => {
  it("accepts one complete localized message", () => {
    expect(validateTransactionalEmail(message)).toEqual(message);
  });

  it.each([
    ["recipient", { ...message, recipient: "not-an-email" }],
    ["locale", { ...message, locale: "fr" }],
    ["subject", { ...message, subject: "" }],
    ["subject controls", { ...message, subject: "unsafe\r\nsubject" }],
    ["text", { ...message, text: "" }],
    ["html", { ...message, html: "" }],
  ])("rejects an invalid %s without echoing message content", (_field, input) => {
    expect(() => validateTransactionalEmail(input)).toThrow("Invalid transactional email");

    try {
      validateTransactionalEmail(input);
    } catch (error) {
      expect(String(error)).not.toContain(message.recipient);
      expect(String(error)).not.toContain(message.text);
      expect(String(error)).not.toContain(message.html);
    }
  });

  it("creates exact four-field normalized results", () => {
    expect(createSendResult("brevo", "accepted", " provider-id ")).toEqual({
      accepted: true,
      providerMessageId: "provider-id",
      provider: "brevo",
      category: "accepted",
    });
    expect(createSendResult("mailjet", "rate_limited", "ignored-id")).toEqual({
      accepted: false,
      providerMessageId: null,
      provider: "mailjet",
      category: "rate_limited",
    });
  });

  it.each([
    [undefined, null],
    [null, null],
    ["", null],
    ["   ", null],
    ["ok-id", "ok-id"],
    [" safe-id ", "safe-id"],
    ["x".repeat(513), null],
    ["unsafe\u0000id", null],
    [42, null],
    [{ id: "nested" }, null],
  ])("normalizes provider identifier %j to %j", (input, expected) => {
    expect(normalizeProviderMessageId(input)).toBe(expected);
  });

  it("enforces the one MiB serialized request limit by UTF-8 bytes", () => {
    expect(serializeProviderJson({ content: "a".repeat(1_048_560) })).toContain(
      '"content"',
    );
    expect(() =>
      serializeProviderJson({ content: "é".repeat(524_289) }),
    ).toThrow("Email provider request exceeds size limit");
  });

  it("accepts interchangeable adapters without changing consumer input", async () => {
    const providers: TransactionalEmailProvider[] = [
      {
        provider: "brevo",
        send: async (input) => {
          expect(input).toEqual(message);
          return createSendResult("brevo", "accepted", "brevo-id");
        },
      },
      {
        provider: "mailjet",
        send: async (input) => {
          expect(input).toEqual(message);
          return createSendResult("mailjet", "accepted", "mailjet-id");
        },
      },
    ];

    await expect(
      Promise.all(providers.map((provider) => provider.send(message))),
    ).resolves.toEqual([
      createSendResult("brevo", "accepted", "brevo-id"),
      createSendResult("mailjet", "accepted", "mailjet-id"),
    ]);
  });
});