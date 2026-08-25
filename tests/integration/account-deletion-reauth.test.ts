// @vitest-environment node

import "dotenv/config";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAccountDeletionFixtureScope } from "../helpers/account-deletion";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  sendAccountDeletionEmail: vi.fn(),
}));

vi.mock("@/modules/account/deletion/email", () => ({
  sendAccountDeletionEmail: mocks.sendAccountDeletionEmail,
}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";

describe.skipIf(!runIntegrationTests)("account deletion reauthentication integration", () => {
  const scopes: Array<ReturnType<typeof createAccountDeletionFixtureScope>> = [];

  beforeEach(() => {
    mocks.sendAccountDeletionEmail.mockReset();
    mocks.sendAccountDeletionEmail.mockResolvedValue({
      accepted: true,
      provider: "fixture",
      providerMessageId: null,
      category: "accepted",
    });
  });

  afterEach(async () => {
    const { db } = await import("@/lib/db");
    await Promise.all(scopes.splice(0).map((scope) => scope.cleanup(db)));
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.$disconnect();
  });

  it.each(["same-device", "cross-device"] as const)(
    "issues and consumes one delivered token with a fresh %s session",
    async () => {
      const { PrismaAdapter } = await import("@next-auth/prisma-adapter");
      const { hardenAdapter } = await import("@/lib/auth-adapter");
      const { db } = await import("@/lib/db");
      const { issueAccountDeletionReauthentication } = await import(
        "@/modules/account/deletion/service"
      );
      const { runWithAccountDeletionVerification } = await import(
        "@/modules/account/deletion/verification-context"
      );
      const scope = createAccountDeletionFixtureScope();
      scopes.push(scope);
      const graph = await scope.seedFullGraph(db);
      const currentSession = graph.sessions[0]!;

      await expect(
        issueAccountDeletionReauthentication({
          sessionToken: currentSession.sessionToken,
          locale: "es",
          origin: "https://app.example.test",
        }),
      ).resolves.toEqual({ status: "sent" });

      expect(mocks.sendAccountDeletionEmail).toHaveBeenCalledWith({
        recipient: graph.owner.email,
        locale: "es",
        origin: "https://app.example.test",
        rawToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      });
      const stored = await db.verificationToken.findFirst({
        where: {
          identifier: graph.owner.normalizedEmail,
          purpose: "ACCOUNT_DELETION",
        },
      });
      expect(stored).toMatchObject({
        locale: "es",
        deliveredAt: expect.any(Date),
      });

      const adapter = hardenAdapter(PrismaAdapter(db));
      const consumed = await runWithAccountDeletionVerification(
        { identifier: graph.owner.normalizedEmail, token: stored!.token },
        () =>
          adapter.useVerificationToken!({
            identifier: graph.owner.normalizedEmail,
            token: stored!.token,
          }),
      );
      expect(consumed).toEqual(
        expect.objectContaining({
          identifier: graph.owner.normalizedEmail,
          token: stored!.token,
        }),
      );

      const freshSessionToken = crypto.randomUUID();
      await adapter.createSession!({
        sessionToken: freshSessionToken,
        userId: graph.owner.id,
        expires: new Date(Date.now() + 24 * 60 * 60_000),
      });
      await expect(
        db.session.findUnique({
          where: { sessionToken: freshSessionToken },
          select: { authenticatedAt: true },
        }),
      ).resolves.toEqual({ authenticatedAt: expect.any(Date) });
      await expect(
        db.verificationToken.count({ where: { token: stored!.token } }),
      ).resolves.toBe(0);
    },
  );

  it("compensates a provider-rejected credential and permits a later retry", async () => {
    const { db } = await import("@/lib/db");
    const { issueAccountDeletionReauthentication } = await import(
      "@/modules/account/deletion/service"
    );
    const scope = createAccountDeletionFixtureScope();
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const sessionToken = graph.sessions[0]!.sessionToken;
    mocks.sendAccountDeletionEmail
      .mockResolvedValueOnce({
        accepted: false,
        provider: "fixture",
        providerMessageId: null,
        category: "provider_unavailable",
      })
      .mockResolvedValueOnce({
        accepted: true,
        provider: "fixture",
        providerMessageId: null,
        category: "accepted",
      });

    await expect(
      issueAccountDeletionReauthentication({
        sessionToken,
        locale: "ca",
        origin: "https://app.example.test",
      }),
    ).resolves.toEqual({ status: "unavailable" });
    await expect(
      db.verificationToken.count({
        where: {
          identifier: graph.owner.normalizedEmail,
          purpose: "ACCOUNT_DELETION",
        },
      }),
    ).resolves.toBe(0);
    await expect(
      db.verificationToken.count({
        where: {
          identifier: graph.owner.normalizedEmail,
          purpose: { in: ["LOGIN", "SIGNUP"] },
        },
      }),
    ).resolves.toBe(2);
    await expect(
      db.session.count({ where: { userId: graph.owner.id } }),
    ).resolves.toBe(graph.sessions.length);

    await expect(
      issueAccountDeletionReauthentication({
        sessionToken,
        locale: "ca",
        origin: "https://app.example.test",
      }),
    ).resolves.toEqual({ status: "sent" });
    await expect(
      db.verificationToken.count({
        where: {
          identifier: graph.owner.normalizedEmail,
          purpose: "ACCOUNT_DELETION",
          deliveredAt: { not: null },
        },
      }),
    ).resolves.toBe(1);
    expect(mocks.sendAccountDeletionEmail).toHaveBeenCalledTimes(2);
  });

  it("compensates an exceptional presentation failure after one wrapper attempt", async () => {
    const { db } = await import("@/lib/db");
    const { issueAccountDeletionReauthentication } = await import(
      "@/modules/account/deletion/service"
    );
    const scope = createAccountDeletionFixtureScope();
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    mocks.sendAccountDeletionEmail.mockRejectedValueOnce(
      new Error("simulated presentation failure"),
    );

    await expect(
      issueAccountDeletionReauthentication({
        sessionToken: graph.sessions[0]!.sessionToken,
        locale: "en",
        origin: "https://app.example.test",
      }),
    ).resolves.toEqual({ status: "unavailable" });

    expect(mocks.sendAccountDeletionEmail).toHaveBeenCalledOnce();
    await expect(
      db.verificationToken.count({
        where: {
          identifier: graph.owner.normalizedEmail,
          purpose: "ACCOUNT_DELETION",
        },
      }),
    ).resolves.toBe(0);
  });

  it.each([
    ["expired", "ACCOUNT_DELETION", new Date(Date.now() - 1), new Date(), true],
    ["provisional", "ACCOUNT_DELETION", new Date(Date.now() + 60_000), null, true],
    ["wrong-purpose", "LOGIN", new Date(Date.now() + 60_000), new Date(), true],
    ["direct", "ACCOUNT_DELETION", new Date(Date.now() + 60_000), new Date(), false],
  ] as const)(
    "rejects and preserves a %s credential",
    async (_case, purpose, expires, deliveredAt, authorize) => {
      const { PrismaAdapter } = await import("@next-auth/prisma-adapter");
      const { hardenAdapter } = await import("@/lib/auth-adapter");
      const { db } = await import("@/lib/db");
      const { runWithAccountDeletionVerification } = await import(
        "@/modules/account/deletion/verification-context"
      );
      const scope = createAccountDeletionFixtureScope();
      scopes.push(scope);
      const owner = scope.account();
      const credential = scope.verificationToken(owner, purpose, {
        expires,
        deliveredAt,
      });
      await db.user.create({ data: owner });
      await db.verificationToken.create({ data: credential });
      const adapter = hardenAdapter(PrismaAdapter(db));
      const consume = () =>
        adapter.useVerificationToken!({
          identifier: credential.identifier,
          token: credential.token,
        });

      const result = authorize
        ? await runWithAccountDeletionVerification(
            { identifier: credential.identifier, token: credential.token },
            consume,
          )
        : await consume();

      expect(result).toBeNull();
      await expect(
        db.verificationToken.count({ where: { token: credential.token } }),
      ).resolves.toBe(1);
    },
  );

  it("rejects a deletion credential presented for a different account", async () => {
    const { PrismaAdapter } = await import("@next-auth/prisma-adapter");
    const { hardenAdapter } = await import("@/lib/auth-adapter");
    const { db } = await import("@/lib/db");
    const { runWithAccountDeletionVerification } = await import(
      "@/modules/account/deletion/verification-context"
    );
    const scope = createAccountDeletionFixtureScope();
    scopes.push(scope);
    const owner = scope.account();
    const credential = scope.verificationToken(owner, "ACCOUNT_DELETION");
    await db.user.create({ data: owner });
    await db.verificationToken.create({ data: credential });
    const adapter = hardenAdapter(PrismaAdapter(db));

    await expect(
      runWithAccountDeletionVerification(
        { identifier: "different@example.test", token: credential.token },
        () =>
          adapter.useVerificationToken!({
            identifier: "different@example.test",
            token: credential.token,
          }),
      ),
    ).resolves.toBeNull();
    await expect(
      db.verificationToken.count({ where: { token: credential.token } }),
    ).resolves.toBe(1);
  });

  it("consumes a delivered deletion credential once and rejects its replay", async () => {
    const { PrismaAdapter } = await import("@next-auth/prisma-adapter");
    const { hardenAdapter } = await import("@/lib/auth-adapter");
    const { db } = await import("@/lib/db");
    const { runWithAccountDeletionVerification } = await import(
      "@/modules/account/deletion/verification-context"
    );
    const scope = createAccountDeletionFixtureScope();
    scopes.push(scope);
    const owner = scope.account();
    const credential = scope.verificationToken(owner, "ACCOUNT_DELETION");
    await db.user.create({ data: owner });
    await db.verificationToken.create({ data: credential });
    const adapter = hardenAdapter(PrismaAdapter(db));
    const consume = () =>
      runWithAccountDeletionVerification(
        { identifier: credential.identifier, token: credential.token },
        () =>
          adapter.useVerificationToken!({
            identifier: credential.identifier,
            token: credential.token,
          }),
      );

    await expect(consume()).resolves.toEqual(
      expect.objectContaining({ token: credential.token }),
    );
    await expect(consume()).resolves.toBeNull();
  });

  it("rejects a superseded credential while preserving the newer delivery", async () => {
    const { PrismaAdapter } = await import("@next-auth/prisma-adapter");
    const { hardenAdapter } = await import("@/lib/auth-adapter");
    const { db } = await import("@/lib/db");
    const { issueAccountDeletionReauthentication } = await import(
      "@/modules/account/deletion/service"
    );
    const { hashAccountDeletionToken } = await import(
      "@/modules/account/deletion/token"
    );
    const { runWithAccountDeletionVerification } = await import(
      "@/modules/account/deletion/verification-context"
    );
    const { getEnv } = await import("@/lib/env");
    const scope = createAccountDeletionFixtureScope();
    scopes.push(scope);
    const graph = await scope.seedFullGraph(db);
    const sessionToken = graph.sessions[0]!.sessionToken;

    await issueAccountDeletionReauthentication({
      sessionToken,
      locale: "en",
      origin: "https://app.example.test",
    });
    const firstRawToken = mocks.sendAccountDeletionEmail.mock.calls[0]![0].rawToken;
    await issueAccountDeletionReauthentication({
      sessionToken,
      locale: "en",
      origin: "https://app.example.test",
    });
    const firstHash = hashAccountDeletionToken(firstRawToken, getEnv().AUTH_SECRET);
    const adapter = hardenAdapter(PrismaAdapter(db));

    await expect(
      runWithAccountDeletionVerification(
        { identifier: graph.owner.normalizedEmail, token: firstHash },
        () =>
          adapter.useVerificationToken!({
            identifier: graph.owner.normalizedEmail,
            token: firstHash,
          }),
      ),
    ).resolves.toBeNull();
    await expect(
      db.verificationToken.count({
        where: {
          identifier: graph.owner.normalizedEmail,
          purpose: "ACCOUNT_DELETION",
          deliveredAt: { not: null },
        },
      }),
    ).resolves.toBe(1);
  });
});