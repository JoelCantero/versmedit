// @vitest-environment node

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const createdUserIds: string[] = [];
const integrationPrefix = "integration-login";

describe.skipIf(!runIntegrationTests)("magic-link existing-user boundary", () => {
  afterEach(async () => {
    const { db } = await import("@/lib/db");
    await db.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await db.verificationToken.deleteMany({ where: { identifier: { contains: integrationPrefix } } });
    await db.rateLimitBucket.deleteMany({
      where: {
        OR: [
          { key: { contains: integrationPrefix } },
          { key: "auth:email:provider:unavailable" },
        ],
      },
    });
    await db.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.$disconnect();
  });

  it("finds mixed-case existing email and leaves unknown email untouched", async () => {
    const { db } = await import("@/lib/db");
    const { findExistingLoginEmail } = await import("@/modules/login/service");
    const suffix = crypto.randomUUID();
    const storedEmail = `Integration-Login-${suffix}@Example.test`;
    const user = await db.user.create({ data: { email: storedEmail } });
    createdUserIds.push(user.id);

    await expect(findExistingLoginEmail(storedEmail.toLowerCase())).resolves.toBe(storedEmail);
    await expect(
      findExistingLoginEmail(`unknown-integration-login-${suffix}@example.test`),
    ).resolves.toBeNull();
    await expect(
      db.user.count({ where: { email: { contains: suffix, mode: "insensitive" } } }),
    ).resolves.toBe(1);
  });

  it("serializes newest-only replacement and consumes one token atomically", async () => {
    const { PrismaAdapter } = await import("@next-auth/prisma-adapter");
    const { hardenAdapter } = await import("@/lib/auth-adapter");
    const { db } = await import("@/lib/db");
    const identifier = `${integrationPrefix}-${crypto.randomUUID()}@example.test`;
    const adapter = hardenAdapter(PrismaAdapter(db));
    const expires = new Date(Date.now() + 15 * 60_000);

    await adapter.createVerificationToken?.({ identifier, token: "older-hash", expires });
    await adapter.createVerificationToken?.({ identifier, token: "newer-hash", expires });
    await expect(db.$queryRaw<Array<{ token: string; expires: Date }>>`
      SELECT "token", "expires" FROM "VerificationToken" WHERE "identifier" = ${identifier}
    `).resolves.toEqual([
      expect.objectContaining({ token: "newer-hash", expires }),
    ]);

    const uses = await Promise.allSettled([
      adapter.useVerificationToken?.({ identifier, token: "newer-hash" }),
      adapter.useVerificationToken?.({ identifier, token: "newer-hash" }),
    ]);
    const consumed = uses.filter(
      (result) => result.status === "fulfilled" && result.value?.token === "newer-hash",
    );
    expect(consumed).toHaveLength(1);
    await expect(db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "VerificationToken"
      WHERE "identifier" = ${identifier}
    `).resolves.toEqual([{ count: 0 }]);
  });

  it("creates and resolves a database session for an existing user", async () => {
    const { PrismaAdapter } = await import("@next-auth/prisma-adapter");
    const { db } = await import("@/lib/db");
    const user = await db.user.create({
      data: { email: `${integrationPrefix}-${crypto.randomUUID()}@example.test` },
    });
    createdUserIds.push(user.id);
    const adapter = PrismaAdapter(db);
    const expires = new Date(Date.now() + 24 * 60 * 60_000);
    const sessionToken = crypto.randomUUID();

    await adapter.createSession?.({ sessionToken, userId: user.id, expires });
    await expect(adapter.getSessionAndUser?.(sessionToken)).resolves.toEqual({
      session: expect.objectContaining({ sessionToken, userId: user.id }),
      user: expect.objectContaining({ id: user.id }),
    });
  });

  it("shares client, address, and provider cooldown state through PostgreSQL", async () => {
    const { consumeSharedRateLimit } = await import("@/lib/shared-rate-limit");
    const {
      getProviderAvailability,
      markProviderUnavailable,
    } = await import("@/lib/provider-availability");
    const suffix = crypto.randomUUID();
    const clientKey = `auth:email:client:${integrationPrefix}-${suffix}`;
    const addressKey = `auth:email:address:${integrationPrefix}-${suffix}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        consumeSharedRateLimit({ key: clientKey, limit: 5, windowMs: 900_000 }),
      ).resolves.toEqual(expect.objectContaining({ allowed: true }));
    }
    await expect(
      consumeSharedRateLimit({ key: clientKey, limit: 5, windowMs: 900_000 }),
    ).resolves.toEqual(expect.objectContaining({ allowed: false }));

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await consumeSharedRateLimit({ key: addressKey, limit: 3, windowMs: 900_000 });
    }
    await expect(
      consumeSharedRateLimit({ key: addressKey, limit: 3, windowMs: 900_000 }),
    ).resolves.toEqual(expect.objectContaining({ allowed: false }));

    const now = new Date();
    await markProviderUnavailable(now);
    await expect(getProviderAvailability(now)).resolves.toEqual({
      available: false,
      retryAfterSeconds: 60,
    });
  });

  it("removes an exact failed token without restoring its predecessor", async () => {
    const { PrismaAdapter } = await import("@next-auth/prisma-adapter");
    const { hardenAdapter } = await import("@/lib/auth-adapter");
    const { db } = await import("@/lib/db");
    const identifier = `${integrationPrefix}-${crypto.randomUUID()}@example.test`;
    const adapter = hardenAdapter(PrismaAdapter(db));
    const expires = new Date(Date.now() + 15 * 60_000);

    await adapter.createVerificationToken?.({ identifier, token: "predecessor", expires });
    await adapter.createVerificationToken?.({ identifier, token: "failed-new-token", expires });
    await db.verificationToken.deleteMany({
      where: { identifier, token: "failed-new-token" },
    });

    await expect(db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS "count" FROM "VerificationToken"
      WHERE "identifier" = ${identifier}
    `).resolves.toEqual([{ count: 0 }]);
  });
});