// @vitest-environment node

import "dotenv/config";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { createHttpMailProvider } from "../helpers/http-mail-provider";
import { getTestProjectName } from "../helpers/project-name";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const keyPrefix = "mail:provider-health";
const projectName = getTestProjectName();
const common = {
  enabled: true as const,
  apiKey: "integration-key",
  fromEmail: "no-reply@example.test",
  senderName: projectName,
  sendTimeoutMs: 2_500 as const,
  healthTimeoutMs: 1_500 as const,
  responseLimitBytes: 65_536 as const,
};
const brevo = { ...common, provider: "brevo" as const };
const mailjet = {
  ...common,
  provider: "mailjet" as const,
  apiSecret: "integration-secret",
};

describe.skipIf(!runIntegrationTests)("provider availability integration", () => {
  afterEach(async () => {
    const { db } = await import("@/lib/db");
    await db.rateLimitBucket.deleteMany({
      where: { key: { startsWith: keyPrefix } },
    });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.$disconnect();
  });

  it("allows one cross-instance probe claim for missing state", async () => {
    const { getProviderAvailability } = await import(
      "@/lib/provider-availability"
    );
    const http = createHttpMailProvider([
      { status: 200, body: "{}", delayMs: 25 },
    ]);

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        getProviderAvailability(brevo, { client: http.client }),
      ),
    );

    expect(http.requests).toHaveLength(1);
    expect(results.filter((result) => result.available)).toHaveLength(1);
    expect(results.filter((result) => !result.available)).toHaveLength(7);

    await expect(
      getProviderAvailability(brevo, { client: http.client }),
    ).resolves.toEqual({ available: true, retryAfterSeconds: 0 });
    expect(http.requests).toHaveLength(1);
  });

  it("recovers an expired two-second lock and records failed probes", async () => {
    const { db } = await import("@/lib/db");
    const { getProviderAvailability } = await import(
      "@/lib/provider-availability"
    );
    await db.rateLimitBucket.create({
      data: {
        key: "mail:provider-health-lock:brevo",
        count: 1,
        resetAt: new Date(Date.now() - 1_000),
      },
    });
    const http = createHttpMailProvider([{ status: 503, body: "{}" }]);

    await expect(
      getProviderAvailability(brevo, { client: http.client }),
    ).resolves.toEqual({ available: false, retryAfterSeconds: 60 });

    expect(http.requests).toHaveLength(1);
    await expect(
      db.rateLimitBucket.findUnique({
        where: { key: "mail:provider-health:brevo" },
      }),
    ).resolves.toMatchObject({ count: 1 });
  });

  it("keeps Brevo and Mailjet health state isolated", async () => {
    const { db } = await import("@/lib/db");
    const { getProviderAvailability } = await import(
      "@/lib/provider-availability"
    );
    await db.rateLimitBucket.create({
      data: {
        key: "mail:provider-health:brevo",
        count: 1,
        resetAt: new Date(Date.now() + 60_000),
      },
    });
    const http = createHttpMailProvider([{ status: 200, body: "{}" }]);

    await expect(
      getProviderAvailability(brevo, { client: http.client }),
    ).resolves.toMatchObject({ available: false });
    await expect(
      getProviderAvailability(mailjet, { client: http.client }),
    ).resolves.toEqual({ available: true, retryAfterSeconds: 0 });

    expect(http.requests).toHaveLength(1);
    expect(http.requests[0]?.logicalUrl).toBe(
      "https://api.mailjet.com/v3/REST/sender?Limit=1",
    );
  });
});
