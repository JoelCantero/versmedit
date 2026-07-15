// @vitest-environment node

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

describe.skipIf(!runIntegrationTests)("PostgreSQL Auth.js schema", () => {
  let disconnect: (() => Promise<void>) | undefined;

  afterAll(async () => {
    await disconnect?.();
  });

  it("persists auth records and cascades sessions when a user is deleted", async () => {
    const { db } = await import("@/lib/db");
    disconnect = () => db.$disconnect();

    const suffix = crypto.randomUUID();
    const user = await db.user.create({
      data: { email: `integration-${suffix}@example.test` },
    });
    const session = await db.session.create({
      data: {
        sessionToken: `session-${suffix}`,
        userId: user.id,
        expires: new Date(Date.now() + 60_000),
      },
    });

    await db.user.delete({ where: { id: user.id } });

    await expect(
      db.session.findUnique({ where: { sessionToken: session.sessionToken } }),
    ).resolves.toBeNull();
  });

  it("atomically limits concurrent requests across database clients", async () => {
    const { db } = await import("@/lib/db");
    const { consumeSharedRateLimit } = await import("@/lib/shared-rate-limit");
    disconnect = () => db.$disconnect();
    const key = `integration-rate-limit-${crypto.randomUUID()}`;

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        consumeSharedRateLimit({ key, limit: 3, windowMs: 60_000 }),
      ),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(3);
    expect(results.filter((result) => !result.allowed)).toHaveLength(7);
    await db.rateLimitBucket.delete({ where: { key } });
  });
});