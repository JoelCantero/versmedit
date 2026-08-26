// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestEmailBrand } from "../helpers/email-brand";
import { createHttpMailProvider } from "../helpers/http-mail-provider";
import { getTestProjectName } from "../helpers/project-name";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.info },
}));

import { sendTransactionalEmail } from "@/lib/email/index";
import type { BrevoMailConfig } from "@/lib/env";

const projectName = getTestProjectName();
const config: BrevoMailConfig = {
  enabled: true,
  provider: "brevo",
  apiKey: "private-api-key",
  fromEmail: "no-reply@example.test",
  senderName: projectName,
  brand: createTestEmailBrand(projectName),
  sendTimeoutMs: 2_500,
  healthTimeoutMs: 1_500,
  responseLimitBytes: 65_536,
};
const oversizeConfigs = [
  { name: "brevo", config },
  {
    name: "mailjet",
    config: {
      ...config,
      provider: "mailjet" as const,
      apiKey: "private-mailjet-api-key",
      apiSecret: "private-mailjet-api-secret",
    },
  },
] as const;
const message = {
  recipient: "private.person@example.test",
  locale: "en" as const,
  subject: "Private sign-in subject",
  text: "Use https://app.example.test/callback?token=raw-private-token",
  html: "<a href='https://app.example.test/callback?token=raw-private-token'>Private</a>",
};

describe("transactional email submission logging", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables framework request logs that could expose callback query values", async () => {
    const nextConfig = await readFile(path.join(process.cwd(), "next.config.ts"), "utf8");

    expect(nextConfig).toMatch(/logging:\s*{\s*incomingRequests:\s*false/);
  });

  it("records one allowlisted accepted-submission event without claiming delivery", async () => {
    const http = createHttpMailProvider([
      {
        status: 201,
        body: JSON.stringify({ messageId: "safe-message-id-42" }),
      },
    ]);

    await sendTransactionalEmail(message, config, http.client, {
      correlationId: "request-42",
    });

    expect(mocks.info).toHaveBeenCalledOnce();
    expect(mocks.info).toHaveBeenCalledWith(
      {
        event: "transactional_email_submission",
        provider: "brevo",
        category: "accepted",
        accepted: true,
        providerMessageId: "safe-message-id-42",
        statusClass: "2xx",
        durationMs: expect.any(Number),
        correlationId: "request-42",
      },
      "transactional email submission accepted",
    );
    const serialized = JSON.stringify(mocks.info.mock.calls);
    expect(serialized).not.toMatch(/deliver(?:y|ed)/i);
    for (const privateValue of [
      config.apiKey,
      config.fromEmail,
      config.senderName,
      message.recipient,
      message.subject,
      message.text,
      message.html,
      "raw-private-token",
      "loginMagicLink",
      config.brand.primaryColor,
      config.brand.supportEmail,
      config.brand.logoUrl!,
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it("allows a purpose-specific journey to suppress the generic submission event", async () => {
    const http = createHttpMailProvider([
      {
        status: 201,
        body: JSON.stringify({ messageId: "unused-message-id" }),
      },
    ]);

    await sendTransactionalEmail(message, config, http.client, {
      correlationId: "purpose-specific-request",
      logAttempt: false,
    });

    expect(mocks.info).not.toHaveBeenCalled();
  });

  it.each(oversizeConfigs)(
    "rejects oversized $name content before network submission or logging",
    async ({ config: oversizeConfig }) => {
      const http = createHttpMailProvider();
      const privateContent = `private-oversize-token-${"x".repeat(1_048_576)}`;

      await expect(
        sendTransactionalEmail(
          { ...message, html: `<p>${privateContent}</p>` },
          oversizeConfig,
          http.client,
          { correlationId: "oversize-request" },
        ),
      ).rejects.toThrow("Email provider request exceeds size limit");

      expect(http.requests).toHaveLength(0);
      expect(mocks.info).not.toHaveBeenCalled();
      expect(JSON.stringify(mocks.info.mock.calls)).not.toContain(privateContent);
    },
  );

  it.each([
    ["rate_limited", { status: 429, body: "private raw response" }, "4xx"],
    ["provider_unavailable", { error: new Error("private network details") }, null],
    ["unknown", { status: 202, body: "malformed private body" }, "2xx"],
  ] as const)(
    "records one normalized %s event without raw provider data",
    async (category, behavior, statusClass) => {
      const http = createHttpMailProvider([behavior]);

      await sendTransactionalEmail(message, config, http.client, {
        correlationId: "request-failure",
      });

      expect(mocks.info).toHaveBeenCalledOnce();
      expect(mocks.info).toHaveBeenCalledWith(
        {
          event: "transactional_email_submission",
          provider: "brevo",
          category,
          accepted: false,
          providerMessageId: null,
          statusClass,
          durationMs: expect.any(Number),
          correlationId: "request-failure",
        },
        "transactional email submission not accepted",
      );
      const serialized = JSON.stringify(mocks.info.mock.calls);
      expect(serialized).not.toMatch(/private raw response|private network details|malformed private body/);
    },
  );
});
