// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHttpMailProvider } from "../helpers/http-mail-provider";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  queryRaw: vi.fn(),
  upsert: vi.fn(),
  updateMany: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    $queryRaw: mocks.queryRaw,
    rateLimitBucket: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: mocks.logInfo },
}));

import { createBrevoProvider } from "@/lib/email/brevo";
import type { TransactionalEmail } from "@/lib/email/types";
import type { BrevoMailConfig, MailjetMailConfig } from "@/lib/env";
import { getProviderAvailability } from "@/lib/provider-availability";

const now = new Date("2026-08-19T12:00:00.000Z");
const common = {
  enabled: true as const,
  apiKey: "private-provider-key",
  fromEmail: "no-reply@example.test",
  senderName: "versmedit",
  sendTimeoutMs: 2_500 as const,
  healthTimeoutMs: 1_500 as const,
  responseLimitBytes: 65_536 as const,
};
const brevo: BrevoMailConfig = { ...common, provider: "brevo" };
const mailjet: MailjetMailConfig = {
  ...common,
  provider: "mailjet",
  apiSecret: "private-provider-secret",
};
const message: TransactionalEmail = {
  recipient: "person@example.test",
  locale: "en",
  subject: "Subject",
  text: "Text",
  html: "<p>HTML</p>",
};

describe("provider availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRaw.mockResolvedValue([
      { key: "mail:provider-health-lock:brevo" },
    ]);
    mocks.upsert.mockResolvedValue({});
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it.each([
    [brevo, 0, { available: true, retryAfterSeconds: 0 }],
    [mailjet, 1, { available: false, retryAfterSeconds: 30 }],
  ] as const)("uses fresh provider cache without a network request %#", async (config, count, expected) => {
    mocks.findUnique.mockResolvedValue({
      count,
      resetAt: new Date("2026-08-19T12:00:30.000Z"),
    });
    const http = createHttpMailProvider();

    await expect(
      getProviderAvailability(config, { client: http.client, now: () => now }),
    ).resolves.toEqual(expected);

    expect(http.requests).toHaveLength(0);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.logInfo).not.toHaveBeenCalled();
  });

  it("claims and records a successful fixed Brevo probe for 60 seconds", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const http = createHttpMailProvider([{ status: 200, body: "{}" }]);

    await expect(
      getProviderAvailability(brevo, {
        client: http.client,
        now: () => now,
        correlationId: "request-health-42",
      }),
    ).resolves.toEqual({ available: true, retryAfterSeconds: 0 });

    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]).toMatchObject({
      logicalUrl: "https://api.brevo.com/v3/account",
      method: "GET",
      body: null,
    });
    expect(http.requests[0]?.headers.get("api-key")).toBe("private-provider-key");
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { key: "mail:provider-health:brevo" },
      create: {
        key: "mail:provider-health:brevo",
        count: 0,
        resetAt: new Date("2026-08-19T12:01:00.000Z"),
      },
      update: {
        count: 0,
        resetAt: new Date("2026-08-19T12:01:00.000Z"),
      },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { key: "mail:provider-health-lock:brevo" },
      data: { resetAt: now },
    });
    expect(mocks.logInfo).toHaveBeenCalledWith(
      {
        event: "transactional_email_provider_health_transition",
        provider: "brevo",
        previousAvailable: null,
        available: true,
        statusClass: "2xx",
        durationMs: expect.any(Number),
        correlationId: "request-health-42",
      },
      "transactional email provider health changed",
    );
  });

  it("records a failed fixed Mailjet probe without retaining metadata", async () => {
    mocks.findUnique.mockResolvedValue({
      count: 0,
      resetAt: new Date("2026-08-19T11:59:00.000Z"),
    });
    mocks.queryRaw.mockResolvedValue([
      { key: "mail:provider-health-lock:mailjet" },
    ]);
    const http = createHttpMailProvider([{ status: 503, body: "private metadata" }]);

    await expect(
      getProviderAvailability(mailjet, { client: http.client, now: () => now }),
    ).resolves.toEqual({ available: false, retryAfterSeconds: 60 });

    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]?.logicalUrl).toBe(
      "https://api.mailjet.com/v3/REST/sender?Limit=1",
    );
    expect(http.requests[0]?.headers.get("authorization")).toBe(
      `Basic ${Buffer.from("private-provider-key:private-provider-secret").toString("base64")}`,
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "mail:provider-health:mailjet" },
        create: expect.objectContaining({ count: 1 }),
        update: expect.objectContaining({ count: 1 }),
      }),
    );
    expect(mocks.logInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "transactional_email_provider_health_transition",
        provider: "mailjet",
        previousAvailable: true,
        available: false,
        statusClass: "5xx",
      }),
      "transactional email provider health changed",
    );
    const serialized = JSON.stringify(mocks.logInfo.mock.calls);
    for (const privateValue of [
      "private-provider-key",
      "private-provider-secret",
      "private metadata",
      "https://api.mailjet.com",
      "authorization",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
  });

  it.each([
    [302, "application/json"],
    [200, "text/html"],
  ])("fails a redirected or non-JSON probe closed", async (status, contentType) => {
    mocks.findUnique.mockResolvedValue(null);
    const http = createHttpMailProvider([
      { status, headers: { "content-type": contentType }, body: "{}" },
    ]);

    await expect(
      getProviderAvailability(brevo, { client: http.client, now: () => now }),
    ).resolves.toEqual({ available: false, retryAfterSeconds: 60 });
    expect(http.requests).toHaveLength(1);
  });

  it("lets a lock loser use the last stale cached snapshot without probing", async () => {
    mocks.findUnique.mockResolvedValue({
      count: 0,
      resetAt: new Date("2026-08-19T11:59:00.000Z"),
    });
    mocks.queryRaw.mockResolvedValue([]);
    const http = createHttpMailProvider();

    await expect(
      getProviderAvailability(brevo, { client: http.client, now: () => now }),
    ).resolves.toEqual({ available: true, retryAfterSeconds: 0 });
    expect(http.requests).toHaveLength(0);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("fails a lock loser without cached state closed for the lock interval", async () => {
    mocks.findUnique.mockResolvedValue(null);
    mocks.queryRaw.mockResolvedValue([]);
    const http = createHttpMailProvider();

    await expect(
      getProviderAvailability(brevo, { client: http.client, now: () => now }),
    ).resolves.toEqual({ available: false, retryAfterSeconds: 2 });
    expect(http.requests).toHaveLength(0);
  });

  it("fails closed without probing when database coordination fails", async () => {
    mocks.findUnique.mockRejectedValue(new Error("private database details"));
    const http = createHttpMailProvider();

    await expect(
      getProviderAvailability(brevo, { client: http.client, now: () => now }),
    ).resolves.toEqual({ available: false, retryAfterSeconds: 1 });
    expect(http.requests).toHaveLength(0);
  });

  it.each([201, 400, 401, 429, 503, 302])(
    "keeps health rows read-only for an individual send outcome %i",
    async (status) => {
      vi.clearAllMocks();
      const body = status === 201 ? "{}" : JSON.stringify({ code: "failure" });
      const http = createHttpMailProvider([{ status, body }]);

      await createBrevoProvider(brevo, http.client).send(message);

      expect(http.requests).toHaveLength(1);
      expect(mocks.findUnique).not.toHaveBeenCalled();
      expect(mocks.queryRaw).not.toHaveBeenCalled();
      expect(mocks.upsert).not.toHaveBeenCalled();
      expect(mocks.updateMany).not.toHaveBeenCalled();
    },
  );
});