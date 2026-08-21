// @vitest-environment node

import "dotenv/config";

import { createHash } from "node:crypto";

import type { NextAuthOptions } from "next-auth";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createHttpMailProvider } from "../helpers/http-mail-provider";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const createdUserIds: string[] = [];
const integrationPrefix = "integration-login";
type Database = (typeof import("@/lib/db"))["db"];
type AuthPost = (typeof import("@/app/api/auth/[...nextauth]/route"))["POST"];
type AuthGet = (typeof import("@/app/api/auth/[...nextauth]/route"))["GET"];

describe.skipIf(!runIntegrationTests)("magic-link HTTP provider acceptance", () => {
  it.each([
    [{ MAIL_ENABLED: "true" }, "MAIL_PROVIDER"],
    [
      { MAIL_ENABLED: "true", MAIL_PROVIDER: "brevo" },
      "MAIL_API_KEY",
    ],
    [
      {
        MAIL_ENABLED: "true",
        MAIL_PROVIDER: "mailjet",
        MAIL_API_KEY: "key",
        MAIL_FROM: "no-reply@example.test",
      },
      "MAIL_API_SECRET",
    ],
  ])("rejects startup-invalid mail configuration %#", async (mail, field) => {
    const { validateEnv } = await import("@/lib/env");
    const source = {
      NODE_ENV: "test" as const,
      PROJECT_NAME: "versmedit",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
      AUTH_SECRET: "integration-auth-secret-at-least-32-chars",
      NEXTAUTH_URL: "https://app.example.test",
      ...mail,
    };

    expect(() => validateEnv(source)).toThrow(new RegExp(field));
  });

  it.each([
    [
      "brevo",
      { body: JSON.stringify({ messageId: "brevo-login-id" }) },
      "brevo-login-id",
    ],
    [
      "mailjet",
      {
        body: JSON.stringify({
          Messages: [
            {
              Status: "success",
              To: [{ Email: "known@example.test" }],
            },
          ],
        }),
      },
      null,
    ],
  ] as const)(
    "submits known-user login content through %s with a nullable identifier",
    async (providerName, behavior, providerMessageId) => {
      const { createTransactionalEmailProvider } = await import("@/lib/email/index");
      const http = createHttpMailProvider([behavior]);
      const common = {
        enabled: true as const,
        apiKey: "integration-key",
        fromEmail: "no-reply@example.test",
        senderName: "versmedit",
        sendTimeoutMs: 2_500 as const,
        healthTimeoutMs: 1_500 as const,
        responseLimitBytes: 65_536 as const,
      };
      const config = providerName === "brevo"
        ? { ...common, provider: "brevo" as const }
        : {
            ...common,
            provider: "mailjet" as const,
            apiSecret: "integration-secret",
          };
      const provider = createTransactionalEmailProvider(config, http.client);
      const link = "https://app.example.test/api/auth/callback/email?token=known-token";

      await expect(provider.send({
        recipient: "known@example.test",
        locale: "en",
        subject: "Your versmedit sign-in link",
        text: `Use this link to sign in: ${link}`,
        html: `<p>Use this link to sign in:</p><p><a href="${link}">${link}</a></p>`,
      })).resolves.toEqual({
        accepted: true,
        providerMessageId,
        provider: providerName,
        category: "accepted",
      });

      expect(http.requests).toHaveLength(1);
      expect(http.requests[0]?.body).toContain("known-token");
      expect(http.requests[0]?.body).toContain("sign-in link");
    },
  );
});

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
    const user = await db.user.create({
      data: {
        email: identifier,
        normalizedEmail: identifier,
        status: "ACTIVE",
      },
    });
    createdUserIds.push(user.id);

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
    const providerOptions = {
      maxAge: 15 * 60,
      from: "no-reply@example.test",
      sendVerificationRequest: async () => undefined,
    };
    const signupProvider = {
      id: "signup",
      type: "email" as const,
      name: "Signup",
      server: {},
      ...providerOptions,
      options: providerOptions,
    } as unknown as NonNullable<NextAuthOptions["providers"]>[number];
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

describe.skipIf(!runIntegrationTests)("magic-link route failure privacy", () => {
  const secret = "login-route-integration-secret-32-chars";
  const originalEnv = new Map<string, string | undefined>();
  const managedEnv = [
    "PROJECT_NAME",
    "AUTH_SECRET",
    "NEXTAUTH_URL",
    "MAIL_ENABLED",
    "MAIL_PROVIDER",
    "MAIL_API_KEY",
    "MAIL_API_SECRET",
    "MAIL_FROM",
    "TRUST_PROXY_HEADERS",
  ] as const;
  const routeContext = {
    params: Promise.resolve({ nextauth: ["signin", "email"] }),
  };
  const emails = new Set<string>();
  const userIds = new Set<string>();
  const limiterKeys = new Set<string>();
  let db: Database;
  let postAuth: AuthPost;
  let getAuth: AuthGet;
  let http: ReturnType<typeof createHttpMailProvider>;
  let clientSequence = 20;

  beforeAll(async () => {
    for (const key of managedEnv) originalEnv.set(key, process.env[key]);
    Object.assign(process.env, {
      PROJECT_NAME: "versmedit-login-test",
      AUTH_SECRET: secret,
      NEXTAUTH_URL: "https://app.example.test",
      MAIL_ENABLED: "true",
      MAIL_PROVIDER: "brevo",
      MAIL_API_KEY: "login-integration-key",
      MAIL_API_SECRET: "",
      MAIL_FROM: "no-reply@example.test",
      TRUST_PROXY_HEADERS: "true",
    });
    vi.resetModules();
    http = createHttpMailProvider();
    vi.doMock("@/lib/email/http", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/email/http")>()),
      nativeProviderHttpClient: http.client,
    }));
    db = (await import("@/lib/db")).db;
    const route = await import("@/app/api/auth/[...nextauth]/route");
    postAuth = route.POST;
    getAuth = route.GET;
  });

  beforeEach(async () => {
    http.requests.splice(0);
    await db.rateLimitBucket.deleteMany({
      where: { key: { startsWith: "mail:provider-health" } },
    });
    await db.rateLimitBucket.create({
      data: {
        key: "mail:provider-health:brevo",
        count: 0,
        resetAt: new Date(Date.now() + 60_000),
      },
    });
  });

  afterEach(async () => {
    await db.session.deleteMany({ where: { userId: { in: [...userIds] } } });
    await db.verificationToken.deleteMany({
      where: { identifier: { in: [...emails] } },
    });
    await db.user.deleteMany({ where: { id: { in: [...userIds] } } });
    await db.rateLimitBucket.deleteMany({
      where: {
        OR: [
          { key: { in: [...limiterKeys] } },
          { key: { startsWith: "mail:provider-health" } },
        ],
      },
    });
    emails.clear();
    userIds.clear();
    limiterKeys.clear();
  });

  afterAll(async () => {
    vi.doUnmock("@/lib/email/http");
    await db?.$disconnect();
    for (const key of managedEnv) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function csrfProof() {
    const token = `csrf-${crypto.randomUUID()}`;
    const hash = createHash("sha256").update(`${token}${secret}`).digest("hex");
    const value = encodeURIComponent(`${token}|${hash}`);
    return {
      token,
      cookie: `next-auth.csrf-token=${value}; __Host-next-auth.csrf-token=${value}`,
    };
  }

  async function createActiveUser(email: string) {
    const user = await db.user.create({
      data: { email, normalizedEmail: email, status: "ACTIVE" },
    });
    emails.add(email);
    userIds.add(user.id);
    return user;
  }

  async function submitLogin(email: string, callbackUrl = "/") {
    const csrf = csrfProof();
    const normalizedEmail = email.trim().toLowerCase();
    const client = `198.51.100.${++clientSequence}`;
    emails.add(normalizedEmail);
    limiterKeys.add(`auth:email:client:${client}`);
    limiterKeys.add(
      `auth:email:address:${createHash("sha256").update(normalizedEmail).digest("hex")}`,
    );
    const startedAt = performance.now();
    const response = await postAuth(
      new (await import("next/server")).NextRequest(
        "https://app.example.test/api/auth/signin/email",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "cf-connecting-ip": client,
            cookie: csrf.cookie,
          },
          body: new URLSearchParams({
            email,
            csrfToken: csrf.token,
            callbackUrl,
            json: "true",
          }),
        },
      ),
      routeContext,
    );
    return { response, elapsedMs: performance.now() - startedAt };
  }

  function capturedRawTokens(email: string) {
    return http.requests.flatMap((request) => {
      if (request.method !== "POST" || !request.body?.includes(email)) return [];
      const match = request.body.match(/[?&]token=([A-Za-z0-9_-]+)/);
      return match?.[1] ? [match[1]] : [];
    });
  }

  const failureCases = [
    ["400", { status: 400, body: "{}" }],
    ["401", { status: 401, body: "{}" }],
    ["403", { status: 403, body: "{}" }],
    ["409", { status: 409, body: "{}" }],
    ["429", { status: 429, body: "{}" }],
    ["5xx", { status: 503, body: "{}" }],
    ["malformed", { status: 202, body: "not-json" }],
    ["timeout", { delayMs: 2_600 }],
    ["network", { error: new Error("simulated reset") }],
  ] as const;

  it.each(failureCases)(
    "keeps known and unknown outcomes identical for isolated %s failure",
    async (_label, behavior) => {
      const suffix = crypto.randomUUID();
      const knownEmail = `${integrationPrefix}-known-${suffix}@example.test`;
      const unknownEmail = `${integrationPrefix}-unknown-${suffix}@example.test`;
      await createActiveUser(knownEmail);
      http.enqueue(behavior);

      const unknown = await submitLogin(unknownEmail);
      const known = await submitLogin(knownEmail);

      expect(unknown.response.status).toBe(200);
      expect(known.response.status).toBe(200);
      expect(await unknown.response.json()).toEqual({ status: "accepted" });
      expect(await known.response.json()).toEqual({ status: "accepted" });
      expect(unknown.elapsedMs).toBeGreaterThanOrEqual(500);
      expect(known.elapsedMs).toBeGreaterThanOrEqual(500);
      expect(http.requests.filter((request) => request.method === "POST")).toHaveLength(1);
      await expect(
        db.verificationToken.count({ where: { identifier: knownEmail } }),
      ).resolves.toBe(0);
      await expect(
        db.user.count({ where: { normalizedEmail: unknownEmail } }),
      ).resolves.toBe(0);
      await expect(
        db.rateLimitBucket.findUnique({
          where: { key: "mail:provider-health:brevo" },
          select: { count: true },
        }),
      ).resolves.toEqual({ count: 0 });
    },
    10_000,
  );

  it("keeps only the newest 15-minute link and consumes it once", async () => {
    const email = `${integrationPrefix}-lifecycle-${crypto.randomUUID()}@example.test`;
    const user = await createActiveUser(email);
    const issuedAt = Date.now();

    const first = await submitLogin(email, "/es");
    expect(first.response.status).toBe(200);
    const firstToken = capturedRawTokens(email)[0];
    const firstPersisted = await db.verificationToken.findFirstOrThrow({
      where: { identifier: email },
    });
    expect(firstPersisted.expires.getTime()).toBeGreaterThanOrEqual(
      issuedAt + 15 * 60_000 - 5_000,
    );
    expect(firstPersisted.expires.getTime()).toBeLessThanOrEqual(
      issuedAt + 15 * 60_000 + 5_000,
    );

    const second = await submitLogin(email, "/es");
    expect(second.response.status).toBe(200);
    const secondToken = capturedRawTokens(email)[1];
    expect(firstToken).toBeTruthy();
    expect(secondToken).toBeTruthy();
    expect(secondToken).not.toBe(firstToken);
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(1);

    const callback = async (token: string) =>
      getAuth(
        new (await import("next/server")).NextRequest(
          `https://app.example.test/api/auth/callback/email?callbackUrl=%2Fes&token=${token}&email=${encodeURIComponent(email)}`,
        ),
        { params: Promise.resolve({ nextauth: ["callback", "email"] }) },
      );
    const stale = await callback(firstToken!);
    expect(stale.status).toBe(302);
    const verificationErrorLocation = stale.headers.get("location");
    expect(verificationErrorLocation).toBe(
      "https://app.example.test/api/auth/error?error=Verification",
    );

    const accepted = await callback(secondToken!);
    expect(accepted.status).toBe(302);
    expect(accepted.headers.get("location")).toBe("https://app.example.test/es");
    expect(accepted.headers.get("set-cookie")).toContain("next-auth.session-token");
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(0);
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(1);

    const replay = await callback(secondToken!);
    expect(replay.status).toBe(302);
    expect(replay.headers.get("location")).toBe(verificationErrorLocation);
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(1);
  });
});