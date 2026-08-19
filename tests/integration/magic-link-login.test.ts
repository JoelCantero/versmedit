// @vitest-environment node

import "dotenv/config";

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
    const user = await db.user.create({
      data: {
        email: storedEmail,
        normalizedEmail: storedEmail.trim().toLowerCase(),
        status: "ACTIVE",
      },
    });
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
    const email = `${integrationPrefix}-${crypto.randomUUID()}@example.test`;
    const user = await db.user.create({
      data: { email, normalizedEmail: email, status: "ACTIVE" },
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

  it("keeps pending users and direct signup-token callbacks ineligible", async () => {
    const { PrismaAdapter } = await import("@next-auth/prisma-adapter");
    const { default: NextAuth } = await import("next-auth");
    const { default: Email } = await import("next-auth/providers/email");
    const { NextRequest } = await import("next/server");
    const { hardenAdapter } = await import("@/lib/auth-adapter");
    const { db } = await import("@/lib/db");
    const { findExistingLoginEmail } = await import("@/modules/login/service");
    const { createSignupCredential } = await import("@/modules/signup/token");
    const email = `${integrationPrefix}-${crypto.randomUUID()}@example.test`;
    const user = await db.user.create({
      data: {
        email,
        normalizedEmail: email,
        status: "PENDING",
      },
    });
    createdUserIds.push(user.id);
    const credential = createSignupCredential({
      secret: process.env.AUTH_SECRET!,
    });
    await db.verificationToken.create({
      data: {
        identifier: email,
        token: credential.persisted.token,
        expires: credential.persisted.expires,
        purpose: "SIGNUP",
        proposedName: "Pending Person",
        locale: "en",
        termsVersion: "2026-08-18-draft",
        privacyVersion: "2026-08-18-draft",
        acceptedAt: new Date(),
        deliveredAt: new Date(),
      },
    });

    await expect(findExistingLoginEmail(email)).resolves.toBeNull();
    const adapter = hardenAdapter(PrismaAdapter(db));
    const signupProvider = Email({
      server: { host: "127.0.0.1", port: 1 },
      from: "no-reply@example.test",
    });
    Object.assign(
      signupProvider as unknown as { id: string; name: string },
      { id: "signup", name: "Signup" },
    );
    const directResponse = await NextAuth(
      new NextRequest(
        `http://localhost:3000/api/auth/callback/signup?token=${credential.raw}&email=${encodeURIComponent(email)}&callbackUrl=%2F`,
      ),
      { params: Promise.resolve({ nextauth: ["callback", "signup"] }) },
      {
        adapter,
        secret: process.env.AUTH_SECRET,
        session: { strategy: "database" },
        providers: [signupProvider],
      },
    );

    expect(directResponse.status).toBe(302);
    expect(directResponse.headers.get("location")).toContain("error=Verification");
    await expect(
      db.verificationToken.count({
        where: { identifier: email, token: credential.persisted.token },
      }),
    ).resolves.toBe(1);
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(0);
    await expect(
      db.user.findUnique({ where: { id: user.id }, select: { status: true } }),
    ).resolves.toEqual({ status: "PENDING" });
  });
});