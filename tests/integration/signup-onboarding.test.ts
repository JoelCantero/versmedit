// @vitest-environment node

import "dotenv/config";

import { createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createSignupFixtureScope } from "../helpers/signup-fixtures";
import { createHttpMailProvider } from "../helpers/http-mail-provider";
import { getTestProjectName } from "../helpers/project-name";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const projectName = getTestProjectName();
const secret = "signup-integration-auth-secret-32-characters";
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
  "BRAND_COLOR",
  "SUPPORT_EMAIL",
  "MAIL_LOGO_URL",
  "TRUST_PROXY_HEADERS",
] as const;

type Database = (typeof import("@/lib/db"))["db"];
type SignupPost = (typeof import("@/app/api/signup/route"))["POST"];
type SignupActivate = (typeof import("@/app/api/signup/activate/route"))["GET"];
type AuthPost = (typeof import("@/app/api/auth/[...nextauth]/route"))["POST"];

describe.skipIf(!runIntegrationTests)("signup HTTP provider acceptance", () => {
  it("normalizes disabled mail without constructing a provider request", async () => {
    const { validateEnv } = await import("@/lib/env");
    const http = createHttpMailProvider();
    const env = validateEnv({
      NODE_ENV: "test",
      PROJECT_NAME: projectName,
      DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
      AUTH_SECRET: "integration-auth-secret-at-least-32-chars",
      NEXTAUTH_URL: "https://app.example.test",
      BRAND_COLOR: "#0057B8",
      SUPPORT_EMAIL: "support@example.test",
      MAIL_ENABLED: "false",
      MAIL_PROVIDER: "brevo",
      MAIL_API_KEY: "provisioned-but-disabled",
      MAIL_FROM: "no-reply@example.test",
    });

    expect(env.MAIL).toEqual({ enabled: false });
    expect(http.requests).toHaveLength(0);
  });

  it.each(["brevo", "mailjet"] as const)(
    "submits new, pending, and active-account messages through %s",
    async (providerName) => {
      const { createTransactionalEmailProvider } = await import("@/lib/email/index");
      const { buildActiveAccountEmail, buildOnboardingEmail } = await import(
        "@/modules/signup/email"
      );
      const mailjetSuccess = (id?: string) => ({
        body: JSON.stringify({
          Messages: [
            {
              Status: "success",
              To: [
                {
                  Email: "person@example.test",
                  ...(id ? { MessageUUID: id } : {}),
                },
              ],
            },
          ],
        }),
      });
      const http = createHttpMailProvider(
        providerName === "brevo"
          ? [
              { body: JSON.stringify({ messageId: "new-id" }) },
              { body: "{}" },
              { body: JSON.stringify({ messageId: "active-id" }) },
            ]
          : [mailjetSuccess("new-id"), mailjetSuccess(), mailjetSuccess("active-id")],
      );
      const { validateEnv } = await import("@/lib/env");
      const env = validateEnv({
        NODE_ENV: "test",
        PROJECT_NAME: projectName,
        DATABASE_URL: "postgresql://user:pass@localhost:5432/app",
        AUTH_SECRET: "integration-auth-secret-at-least-32-chars",
        NEXTAUTH_URL: "https://app.example.test",
        MAIL_ENABLED: "true",
        MAIL_PROVIDER: providerName,
        MAIL_API_KEY: "integration-key",
        MAIL_API_SECRET: providerName === "mailjet" ? "integration-secret" : undefined,
        MAIL_FROM: "no-reply@example.test",
        BRAND_COLOR: "#0057B8",
        SUPPORT_EMAIL: "support@example.test",
        MAIL_LOGO_URL: "https://assets.example.test/mail/logo.png",
      });
      if (!env.MAIL.enabled) throw new Error("mail must be enabled for this test");
      const provider = createTransactionalEmailProvider(env.MAIL, http.client);
      const base = {
        recipient: "person@example.test",
        locale: "es" as const,
        origin: "https://app.example.test",
      };
      const messages = await Promise.all([
        buildOnboardingEmail(
          { ...base, rawToken: "new-token" },
          env.MAIL.brand,
        ),
        buildOnboardingEmail(
          { ...base, rawToken: "pending-token" },
          env.MAIL.brand,
        ),
        buildActiveAccountEmail(base, env.MAIL.brand),
      ]);

      const results = [];
      for (const message of messages) results.push(await provider.send(message));

      expect(results.map(({ accepted, providerMessageId }) => ({
        accepted,
        providerMessageId,
      }))).toEqual([
        { accepted: true, providerMessageId: "new-id" },
        { accepted: true, providerMessageId: null },
        { accepted: true, providerMessageId: "active-id" },
      ]);
      expect(http.requests).toHaveLength(3);
      expect(http.requests[0]?.body).toContain("new-token");
      expect(http.requests[1]?.body).toContain("pending-token");
      expect(http.requests[2]?.body).not.toMatch(/token|signup\/activate/i);
    },
  );
});

describe.skipIf(!runIntegrationTests)("signup onboarding integration", () => {
  let db: Database;
  let postSignup: SignupPost;
  let activateSignup: SignupActivate;
  let postAuth: AuthPost;
  let http: ReturnType<typeof createHttpMailProvider>;
  let fixtures = createSignupFixtureScope("signup-onboarding");
  const limiterKeys = new Set<string>();
  const submittedEmails = new Set<string>();
  let clientSequence = 60;

  beforeAll(async () => {
    for (const key of managedEnv) originalEnv.set(key, process.env[key]);
    Object.assign(process.env, {
      PROJECT_NAME: projectName,
      AUTH_SECRET: secret,
      NEXTAUTH_URL: "https://app.example.test",
      MAIL_ENABLED: "true",
      MAIL_PROVIDER: "brevo",
      MAIL_API_KEY: "signup-integration-key",
      MAIL_API_SECRET: "",
      MAIL_FROM: "no-reply@example.test",
      BRAND_COLOR: "#0057B8",
      SUPPORT_EMAIL: "support@example.test",
      MAIL_LOGO_URL: "https://assets.example.test/mail/logo.png",
      TRUST_PROXY_HEADERS: "true",
    });
    vi.resetModules();
    http = createHttpMailProvider();
    vi.doMock("@/lib/email/http", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/email/http")>()),
      nativeProviderHttpClient: http.client,
    }));
    db = (await import("@/lib/db")).db;
    postSignup = (await import("@/app/api/signup/route")).POST;
    activateSignup = (await import("@/app/api/signup/activate/route")).GET;
    postAuth = (await import("@/app/api/auth/[...nextauth]/route")).POST;
  });

  beforeEach(async () => {
    fixtures = createSignupFixtureScope("signup-onboarding");
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
    const emails = [...submittedEmails];
    if (emails.length > 0) {
      await db.$transaction(async (transaction) => {
        const users = await transaction.user.findMany({
          where: { normalizedEmail: { in: emails } },
          select: { id: true },
        });
        const userIds = users.map((user) => user.id);
        if (userIds.length > 0) {
          await transaction.session.deleteMany({ where: { userId: { in: userIds } } });
          await transaction.account.deleteMany({ where: { userId: { in: userIds } } });
          await transaction.policyAcceptance.deleteMany({
            where: { userId: { in: userIds } },
          });
        }
        await transaction.verificationToken.deleteMany({
          where: { identifier: { in: emails } },
        });
        if (userIds.length > 0) {
          await transaction.user.deleteMany({ where: { id: { in: userIds } } });
        }
      });
      submittedEmails.clear();
    }
    await fixtures.cleanup(db);
    if (limiterKeys.size > 0) {
      await db.rateLimitBucket.deleteMany({
        where: { key: { in: [...limiterKeys] } },
      });
      limiterKeys.clear();
    }
    await db.rateLimitBucket.deleteMany({
      where: { key: { startsWith: "mail:provider-health" } },
    });
  });

  afterAll(async () => {
    await db?.$disconnect();
    vi.doUnmock("@/lib/email/http");
    for (const key of managedEnv) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function csrfProof() {
    const token = `csrf-${crypto.randomUUID()}`;
    const hash = createHash("sha256").update(`${token}${secret}`).digest("hex");
    return {
      token,
      cookie: `next-auth.csrf-token=${encodeURIComponent(`${token}|${hash}`)}`,
    };
  }

  async function submit(input: {
    name: string;
    email: string;
    locale: "en" | "es" | "ca";
  }, options: { client?: string } = {}) {
    const csrf = csrfProof();
    clientSequence += 1;
    const client = options.client ?? `203.0.113.${clientSequence}`;
    const normalizedEmail = input.email.trim().toLowerCase();
    submittedEmails.add(normalizedEmail);
    limiterKeys.add(`auth:email:client:${client}`);
    limiterKeys.add(
      `auth:email:address:${createHash("sha256").update(normalizedEmail).digest("hex")}`,
    );
    return postSignup(
      new NextRequest("https://app.example.test/api/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": client,
          cookie: csrf.cookie,
        },
        body: JSON.stringify({
          ...input,
          policyAccepted: true,
          csrfToken: csrf.token,
        }),
      }),
    );
  }

  async function submitPayload(
    payload: Record<string, unknown> | string,
    options: {
      client?: string;
      cookie?: string;
      forwardedFor?: string;
    } = {},
  ) {
    const csrf = csrfProof();
    clientSequence += 1;
    const client = options.client ?? `203.0.113.${clientSequence}`;
    limiterKeys.add(`auth:email:client:${client}`);
    if (typeof payload !== "string" && typeof payload.email === "string") {
      const normalizedEmail = payload.email.trim().toLowerCase();
      submittedEmails.add(normalizedEmail);
      limiterKeys.add(
        `auth:email:address:${createHash("sha256").update(normalizedEmail).digest("hex")}`,
      );
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "cf-connecting-ip": client,
      cookie: options.cookie ?? csrf.cookie,
    };
    if (options.forwardedFor) headers["x-forwarded-for"] = options.forwardedFor;
    return postSignup(
      new NextRequest("https://app.example.test/api/signup", {
        method: "POST",
        headers,
        body:
          typeof payload === "string"
            ? payload
            : JSON.stringify({ ...payload, csrfToken: payload.csrfToken ?? csrf.token }),
      }),
    );
  }

  async function submitLogin(email: string, client: string) {
    const csrf = csrfProof();
    const normalizedEmail = email.trim().toLowerCase();
    limiterKeys.add(`auth:email:client:${client}`);
    limiterKeys.add(
      `auth:email:address:${createHash("sha256").update(normalizedEmail).digest("hex")}`,
    );
    return postAuth(
      new NextRequest("https://app.example.test/api/auth/signin/email", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "cf-connecting-ip": client,
          cookie: csrf.cookie,
        },
        body: new URLSearchParams({
          email,
          csrfToken: csrf.token,
          callbackUrl: "/",
          json: "true",
        }),
      }),
      { params: Promise.resolve({ nextauth: ["signin", "email"] }) },
    );
  }

  async function lifecycleCounts(normalizedEmail: string) {
    const user = await db.user.findUnique({
      where: { normalizedEmail },
      select: { id: true },
    });
    return {
      users: await db.user.count({ where: { normalizedEmail } }),
      tokens: await db.verificationToken.count({
        where: { identifier: normalizedEmail },
      }),
      acceptances: user
        ? await db.policyAcceptance.count({ where: { userId: user.id } })
        : 0,
      sessions: user
        ? await db.session.count({ where: { userId: user.id } })
        : 0,
    };
  }

  function rawTokenFor(recipient: string) {
    const token = rawTokensFor(recipient).at(-1);
    if (!token) throw new Error("captured onboarding token was not found");
    return token;
  }

  function rawTokensFor(recipient: string) {
    return providerRequestsFor(recipient).flatMap((request) => {
      const match = request.body?.match(/token=([A-Za-z0-9_-]{43})/);
      return match?.[1] ? [match[1]] : [];
    });
  }

  function providerRequestsFor(recipient: string) {
    return providerSubmissionRequests().filter((request) =>
      request.body?.includes(recipient),
    );
  }

  function providerSubmissionRequests() {
    return http.requests.filter((request) => request.method === "POST");
  }

  function hashRawToken(rawToken: string) {
    return createHash("sha256").update(`${rawToken}${secret}`).digest("hex");
  }

  async function holdIdentityLock(identifier: string) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [identifier],
    );
    let released = false;

    return {
      async waitForQueued(waiters: number) {
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          const result = await client.query<{ count: number }>(
            `SELECT COUNT(*)::int AS count
             FROM pg_locks
             WHERE locktype = 'advisory'
               AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
               AND classid = ((hashtextextended($1, 0) >> 32) & 4294967295)::oid
               AND objid = (hashtextextended($1, 0) & 4294967295)::oid
               AND objsubid = 1
               AND NOT granted`,
            [identifier],
          );
          if ((result.rows[0]?.count ?? 0) >= waiters) return;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        throw new Error(`Timed out waiting for ${waiters} identity lock waiters`);
      },
      async release() {
        if (released) return;
        released = true;
        try {
          await client.query("ROLLBACK");
        } finally {
          await client.end();
        }
      },
    };
  }

  async function runInIdentityCommitOrder<TFirst, TSecond>(
    identifier: string,
    first: () => Promise<TFirst>,
    second: () => Promise<TSecond>,
  ): Promise<[TFirst, TSecond]> {
    const heldLock = await holdIdentityLock(identifier);
    try {
      const firstResult = first();
      await heldLock.waitForQueued(1);
      const secondResult = second();
      await heldLock.waitForQueued(2);
      await heldLock.release();
      return await Promise.all([firstResult, secondResult]);
    } finally {
      await heldLock.release();
    }
  }

  function activationRequest(rawToken: string, cookie?: string) {
    return new NextRequest(
      `https://app.example.test/api/signup/activate?token=${rawToken}`,
      { headers: cookie ? { cookie } : undefined },
    );
  }

  it("keeps public results uniform while applying only private lifecycle effects", async () => {
    const suffix = crypto.randomUUID();
    const newEmail = `new-${suffix}@example.test`;
    const pending = fixtures.account({
      email: `pending-${suffix}@example.test`,
      status: "PENDING",
    });
    const active = fixtures.account({
      email: `active-${suffix}@example.test`,
      name: "Existing Name",
      status: "ACTIVE",
    });
    await db.user.createMany({ data: [pending, active] });

    const responses = [
      await submit({ name: "First Candidate", email: `  ${newEmail.toUpperCase()}  `, locale: "en" }),
      await submit({ name: "Newest Candidate", email: newEmail, locale: "es" }),
      await submit({ name: "Pending Candidate", email: pending.email, locale: "ca" }),
      await submit({ name: "Ignored Active Name", email: active.email, locale: "en" }),
    ];

    for (const response of responses) {
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "accepted" });
    }

    const newUsers = await db.user.findMany({
      where: { normalizedEmail: newEmail },
    });
    expect(newUsers).toHaveLength(1);
    expect(newUsers[0]).toMatchObject({
      normalizedEmail: newEmail,
      status: "PENDING",
      name: null,
      emailVerified: null,
    });

    const signupTokens = await db.verificationToken.findMany({
      where: {
        identifier: { in: [newEmail, pending.normalizedEmail] },
        purpose: "SIGNUP",
      },
      orderBy: { identifier: "asc" },
    });
    expect(signupTokens).toHaveLength(2);
    expect(
      signupTokens.find((token) => token.identifier === newEmail),
    ).toMatchObject({
      proposedName: "Newest Candidate",
      locale: "es",
      termsVersion: "2026-08-18-draft",
      privacyVersion: "2026-08-18-draft",
    });
    expect(
      signupTokens.find((token) => token.identifier === pending.normalizedEmail),
    ).toMatchObject({ proposedName: "Pending Candidate", locale: "ca" });

    const unchangedActive = await db.user.findUnique({ where: { id: active.id } });
    expect(unchangedActive).toMatchObject({
      name: "Existing Name",
      status: "ACTIVE",
      emailVerified: active.emailVerified,
    });
    await expect(
      db.verificationToken.count({ where: { identifier: active.normalizedEmail } }),
    ).resolves.toBe(0);

    const lifecycleUserIds = [newUsers[0]!.id, pending.id, active.id];
    await expect(
      db.session.count({ where: { userId: { in: lifecycleUserIds } } }),
    ).resolves.toBe(0);
    await expect(
      db.policyAcceptance.count({ where: { userId: { in: lifecycleUserIds } } }),
    ).resolves.toBe(0);

    expect(providerSubmissionRequests()).toHaveLength(4);
    const activeMail = providerRequestsFor(active.normalizedEmail)[0];
    expect(activeMail?.body).toContain("/login");
    expect(activeMail?.body).not.toContain("/api/signup/activate");
    for (const recipient of [newEmail, pending.normalizedEmail]) {
      const onboarding = providerRequestsFor(recipient);
      expect(onboarding.length).toBeGreaterThan(0);
      expect(onboarding.at(-1)?.body).toContain("/api/signup/activate");
    }
  });

  it("activates the newest snapshot, creates one normal session, and rejects replay", async () => {
    const email = `${fixtures.scopeId}@example.test`;
    await submit({ name: "Activated Person", email, locale: "es" });
    const rawToken = rawTokenFor(email);

    const response = await activateSignup(activationRequest(rawToken));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example.test/es");
    expect(response.headers.get("set-cookie")).toContain("next-auth.session-token");

    const user = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
      include: { policyAcceptance: true, sessions: true },
    });
    expect(user).toMatchObject({
      name: "Activated Person",
      status: "ACTIVE",
      emailVerified: expect.any(Date),
      policyAcceptance: {
        termsVersion: "2026-08-18-draft",
        privacyVersion: "2026-08-18-draft",
        acceptedAt: expect.any(Date),
      },
    });
    expect(user.sessions).toHaveLength(1);
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(0);

    const replay = await activateSignup(activationRequest(rawToken));
    expect(replay.headers.get("location")).toBe(
      "https://app.example.test/signup?state=invalid_link",
    );
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(1);
  });

  it("allows at most one concurrent activation and session", async () => {
    const email = `${fixtures.scopeId}-concurrent@example.test`;
    await submit({ name: "Concurrent Person", email, locale: "en" });
    const rawToken = rawTokenFor(email);

    const responses = await Promise.all([
      activateSignup(activationRequest(rawToken)),
      activateSignup(activationRequest(rawToken)),
    ]);
    expect(
      responses.filter((response: Response) => response.headers.has("set-cookie")),
    ).toHaveLength(1);
    const user = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(1);
    await expect(
      db.policyAcceptance.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
  });

  it("serializes simultaneous first signup and activates only the last committed snapshot", async () => {
    const email = `${fixtures.scopeId}-simultaneous-first@example.test`;
    const responses = await runInIdentityCommitOrder(
      email,
      () => submit({ name: "First Concurrent", email, locale: "en" }),
      () => submit({ name: "Second Concurrent", email, locale: "ca" }),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);

    const users = await db.user.findMany({
      where: { normalizedEmail: email },
    });
    expect(users).toHaveLength(1);
    const authoritativeToken = await db.verificationToken.findFirstOrThrow({
      where: { identifier: email, purpose: "SIGNUP" },
    });
    expect(authoritativeToken).toMatchObject({
      proposedName: "Second Concurrent",
      locale: "ca",
      termsVersion: "2026-08-18-draft",
      privacyVersion: "2026-08-18-draft",
      acceptedAt: expect.any(Date),
      deliveredAt: expect.any(Date),
    });

    const rawTokens = rawTokensFor(email);
    expect(rawTokens).toHaveLength(2);
    const currentRawToken = rawTokens.find(
      (rawToken) => hashRawToken(rawToken) === authoritativeToken.token,
    );
    const staleRawToken = rawTokens.find(
      (rawToken) => rawToken !== currentRawToken,
    );
    expect(currentRawToken).toBeTruthy();
    expect(staleRawToken).toBeTruthy();
    expect(
      (await activateSignup(activationRequest(staleRawToken!))).headers.get(
        "location",
      ),
    ).toBe("https://app.example.test/signup?state=invalid_link");
    expect(
      (await activateSignup(activationRequest(currentRawToken!))).headers.get(
        "location",
      ),
    ).toBe("https://app.example.test/ca");

    const activated = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
      include: { policyAcceptance: true },
    });
    expect(activated).toMatchObject({
      name: "Second Concurrent",
      status: "ACTIVE",
      policyAcceptance: {
        termsVersion: authoritativeToken.termsVersion,
        privacyVersion: authoritativeToken.privacyVersion,
        acceptedAt: authoritativeToken.acceptedAt,
      },
    });
  });

  it("reuses one retained pending account under concurrent resubmission", async () => {
    const pending = fixtures.account({ status: "PENDING" });
    await db.user.create({ data: pending });
    const responses = await runInIdentityCommitOrder(
      pending.normalizedEmail,
      () => submit({ name: "Earlier Pending", email: pending.email, locale: "es" }),
      () => submit({ name: "Latest Pending", email: pending.email, locale: "en" }),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);

    const users = await db.user.findMany({
      where: { normalizedEmail: pending.normalizedEmail },
    });
    expect(users).toHaveLength(1);
    expect(users[0]?.id).toBe(pending.id);
    const authoritativeToken = await db.verificationToken.findFirstOrThrow({
      where: { identifier: pending.normalizedEmail, purpose: "SIGNUP" },
    });
    expect(authoritativeToken).toMatchObject({
      proposedName: "Latest Pending",
      locale: "en",
      termsVersion: "2026-08-18-draft",
      privacyVersion: "2026-08-18-draft",
      acceptedAt: expect.any(Date),
      deliveredAt: expect.any(Date),
    });
    const rawTokens = rawTokensFor(pending.normalizedEmail);
    const currentRawToken = rawTokens.find(
      (rawToken) => hashRawToken(rawToken) === authoritativeToken.token,
    );
    const staleRawToken = rawTokens.find(
      (rawToken) => rawToken !== currentRawToken,
    );
    expect(
      (await activateSignup(activationRequest(staleRawToken!))).headers.get(
        "location",
      ),
    ).toBe("https://app.example.test/signup?state=invalid_link");
    expect(
      (await activateSignup(activationRequest(currentRawToken!))).headers.get(
        "location",
      ),
    ).toBe("https://app.example.test/");

    const activated = await db.user.findUniqueOrThrow({
      where: { id: pending.id },
      include: { policyAcceptance: true },
    });
    expect(activated).toMatchObject({
      name: "Latest Pending",
      status: "ACTIVE",
      policyAcceptance: {
        termsVersion: authoritativeToken.termsVersion,
        privacyVersion: authoritativeToken.privacyVersion,
        acceptedAt: authoritativeToken.acceptedAt,
      },
    });
  });

  it("invalidates the old link when replacement signup commits before activation", async () => {
    const email = `${fixtures.scopeId}-replacement-first@example.test`;
    await submit({ name: "Original Snapshot", email, locale: "es" });
    const originalRawToken = rawTokenFor(email);

    const [replacement, oldActivation] = await runInIdentityCommitOrder(
      email,
      () => submit({ name: "Replacement Snapshot", email, locale: "ca" }),
      () => activateSignup(activationRequest(originalRawToken)),
    );
    expect(replacement.status).toBe(200);
    expect(oldActivation.headers.get("location")).toBe(
      "https://app.example.test/es/signup?state=invalid_link",
    );

    const pendingUser = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    expect(pendingUser).toMatchObject({ name: null, status: "PENDING" });
    const authoritativeToken = await db.verificationToken.findFirstOrThrow({
      where: { identifier: email, purpose: "SIGNUP" },
    });
    expect(authoritativeToken).toMatchObject({
      proposedName: "Replacement Snapshot",
      locale: "ca",
      termsVersion: "2026-08-18-draft",
      privacyVersion: "2026-08-18-draft",
      deliveredAt: expect.any(Date),
    });
    const replacementRawToken = rawTokensFor(email).find(
      (rawToken) => hashRawToken(rawToken) === authoritativeToken.token,
    );
    const activated = await activateSignup(
      activationRequest(replacementRawToken!),
    );
    expect(activated.headers.get("location")).toBe(
      "https://app.example.test/ca",
    );
    await expect(
      db.user.findUnique({ where: { id: pendingUser.id } }),
    ).resolves.toMatchObject({ name: "Replacement Snapshot", status: "ACTIVE" });
    await expect(
      db.policyAcceptance.findUnique({ where: { userId: pendingUser.id } }),
    ).resolves.toMatchObject({
      termsVersion: authoritativeToken.termsVersion,
      privacyVersion: authoritativeToken.privacyVersion,
      acceptedAt: authoritativeToken.acceptedAt,
    });
  });

  it("keeps the activated snapshot immutable when activation commits before later signup", async () => {
    const email = `${fixtures.scopeId}-activation-first@example.test`;
    await submit({ name: "Activated Snapshot", email, locale: "es" });
    const originalRawToken = rawTokenFor(email);
    const originalToken = await db.verificationToken.findFirstOrThrow({
      where: { identifier: email, purpose: "SIGNUP" },
    });

    const [activation, laterSignup] = await runInIdentityCommitOrder(
      email,
      () => activateSignup(activationRequest(originalRawToken)),
      () => submit({ name: "Ignored Later Snapshot", email, locale: "ca" }),
    );
    expect(activation.headers.get("location")).toBe(
      "https://app.example.test/es",
    );
    expect(activation.headers.get("set-cookie")).toContain(
      "next-auth.session-token",
    );
    expect(laterSignup.status).toBe(200);

    const user = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
      include: { policyAcceptance: true, sessions: true },
    });
    expect(user).toMatchObject({
      name: "Activated Snapshot",
      status: "ACTIVE",
      policyAcceptance: {
        termsVersion: originalToken.termsVersion,
        privacyVersion: originalToken.privacyVersion,
        acceptedAt: originalToken.acceptedAt,
      },
    });
    expect(user.sessions).toHaveLength(1);
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(0);
    const latestMail = providerRequestsFor(email).at(-1)?.body;
    expect(latestMail).toContain("/login");
    expect(latestMail).not.toContain("/api/signup/activate");
  });

  it("preserves a different current session and leaves onboarding reusable", async () => {
    const email = `${fixtures.scopeId}-conflict@example.test`;
    await submit({ name: "Pending Person", email, locale: "ca" });
    const rawToken = rawTokenFor(email);
    const active = fixtures.account({ status: "ACTIVE" });
    const session = fixtures.session(active);
    await db.user.create({ data: active });
    await db.session.create({ data: session });

    const response = await activateSignup(
      activationRequest(
        rawToken,
        `__Secure-next-auth.session-token=${session.sessionToken}`,
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/ca/signup?state=session_conflict",
    );
    await expect(
      db.user.findUnique({
        where: { normalizedEmail: email },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "PENDING" });
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(1);
    await expect(
      db.session.findUnique({ where: { sessionToken: session.sessionToken } }),
    ).resolves.toBeTruthy();
  });

  it("keeps activation durable when Auth.js session creation fails", async () => {
    const email = `${fixtures.scopeId}-session-failure@example.test`;
    await submit({ name: "Durable Activation", email, locale: "es" });
    const rawToken = rawTokenFor(email);
    const pending = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
      select: { id: true },
    });
    if (!/^[A-Za-z0-9_-]+$/u.test(pending.id)) {
      throw new Error("invalid signup fixture user id");
    }
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const functionName = `signup_session_fail_${suffix}`;
    const triggerName = `signup_session_trigger_${suffix}`;
    await db.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'simulated session failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE INSERT ON "Session"
      FOR EACH ROW WHEN (NEW."userId" = '${pending.id}')
      EXECUTE FUNCTION "${functionName}"()
    `);

    try {
      const response = await activateSignup(activationRequest(rawToken));
      expect(response.headers.get("location")).toBe(
        "https://app.example.test/es/signup?state=session_failed",
      );
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS "${triggerName}" ON "Session"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }

    const user = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    expect(user.status).toBe("ACTIVE");
    await expect(
      db.policyAcceptance.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(0);
    await expect(db.session.count({ where: { userId: user.id } })).resolves.toBe(0);
  });

  it("rejects invalid, malicious, and additional fields without lifecycle mutation", async () => {
    const invalidCases = [
      { name: "", policyAccepted: true },
      { name: "<script>alert(1)</script>", policyAccepted: true },
      { name: "Safe Person", policyAccepted: true, role: "admin" },
    ];

    for (const [index, fields] of invalidCases.entries()) {
      const email = `${fixtures.scopeId}-invalid-${index}@example.test`;
      const response = await submitPayload({
        email,
        locale: "en",
        ...fields,
      });

      expect(response.status).toBe(400);
      await expect(lifecycleCounts(email)).resolves.toEqual({
        users: 0,
        tokens: 0,
        acceptances: 0,
        sessions: 0,
      });
    }
    expect(providerSubmissionRequests()).toHaveLength(0);
  });

  it("rejects malformed JSON and invalid CSRF without lifecycle mutation", async () => {
    const malformed = await submitPayload('{"name":');
    expect(malformed.status).toBe(400);

    const email = `${fixtures.scopeId}-csrf@example.test`;
    const invalidCsrf = await submitPayload(
      {
        name: "Safe Person",
        email,
        policyAccepted: true,
        locale: "en",
        csrfToken: "forged-token",
      },
    );
    expect(invalidCsrf.status).toBe(403);
    await expect(lifecycleCounts(email)).resolves.toEqual({
      users: 0,
      tokens: 0,
      acceptances: 0,
      sessions: 0,
    });
    expect(providerSubmissionRequests()).toHaveLength(0);
  });

  it("shares exact client and normalized-address boundaries across login and signup", async () => {
    const client = "203.0.113.201";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await submitLogin(
        `client-login-${attempt}-${fixtures.scopeId}@example.test`,
        client,
      );
      expect(response.status).toBe(200);
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await submit(
        {
          name: "Client Signup",
          email: `client-signup-${attempt}-${fixtures.scopeId}@example.test`,
          locale: "en",
        },
        { client },
      );
      expect(response.status).toBe(200);
    }
    const clientBlocked = await submit(
      {
        name: "Blocked Client",
        email: `client-blocked-${fixtures.scopeId}@example.test`,
        locale: "en",
      },
      { client },
    );
    expect(clientBlocked.status).toBe(429);
    expect(clientBlocked.headers.get("x-ratelimit-remaining")).toBe("0");

    const sharedEmail = `shared-address-${fixtures.scopeId}@example.test`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(
        (await submitLogin(sharedEmail, `203.0.113.${210 + attempt}`)).status,
      ).toBe(200);
    }
    expect(
      (await submit(
        { name: "Shared Address", email: sharedEmail, locale: "en" },
        { client: "203.0.113.212" },
      )).status,
    ).toBe(200);
    const addressBlocked = await submitLogin(sharedEmail, "203.0.113.213");
    expect(addressBlocked.status).toBe(429);
    expect(addressBlocked.headers.get("retry-after")).toBeTruthy();
  });

  it("uses the trusted edge identity and ignores caller-supplied forwarding identity", async () => {
    const client = "203.0.113.220";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await submitPayload("not-json", {
        client,
        forwardedFor: `198.51.100.${attempt + 1}`,
      });
      expect(response.status).toBe(400);
    }
    const blocked = await submitPayload("not-json", {
      client,
      forwardedFor: "198.51.100.200",
    });
    expect(blocked.status).toBe(429);
  });

  it("applies one shared outage before mutation for new, pending, and active addresses", async () => {
    const pending = fixtures.account({ status: "PENDING" });
    const active = fixtures.account({ status: "ACTIVE", name: "Existing Name" });
    await db.user.createMany({ data: [pending, active] });
    const newEmail = `${fixtures.scopeId}-outage-new@example.test`;
    await db.rateLimitBucket.update({
      where: { key: "mail:provider-health:brevo" },
      data: { count: 1, resetAt: new Date(Date.now() + 60_000) },
    });

    const responses = await Promise.all([
      submit({ name: "New Person", email: newEmail, locale: "en" }),
      submit({ name: "Pending Person", email: pending.email, locale: "es" }),
      submit({ name: "Ignored Name", email: active.email, locale: "ca" }),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBeTruthy();
      await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    }
    await expect(lifecycleCounts(newEmail)).resolves.toEqual({
      users: 0,
      tokens: 0,
      acceptances: 0,
      sessions: 0,
    });
    await expect(db.user.findUnique({ where: { id: pending.id } })).resolves.toMatchObject({
      status: "PENDING",
      name: null,
    });
    await expect(db.user.findUnique({ where: { id: active.id } })).resolves.toMatchObject({
      status: "ACTIVE",
      name: "Existing Name",
    });
    expect(providerSubmissionRequests()).toHaveLength(0);
  });

  it("cleans an isolated rejected credential and safely reuses the pending account", async () => {
    const { getProviderAvailability } = await import("@/lib/provider-availability");
    const { getEnv } = await import("@/lib/env");
    const email = `${fixtures.scopeId}-recipient-reject@example.test`;
    http.enqueue({
      status: 400,
      body: JSON.stringify({ code: "invalid_recipient" }),
    });

    const rejected = await submit({ name: "First Candidate", email, locale: "en" });
    expect(rejected.status).toBe(200);
    await expect(rejected.json()).resolves.toEqual({ status: "accepted" });
    const pending = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    expect(pending.status).toBe("PENDING");
    await expect(db.verificationToken.count({ where: { identifier: email } })).resolves.toBe(0);
    const config = getEnv().MAIL;
    if (!config.enabled) throw new Error("mail must be enabled for this test");
    await expect(getProviderAvailability(config)).resolves.toEqual({
      available: true,
      retryAfterSeconds: 0,
    });

    const retry = await submit({ name: "Retry Candidate", email, locale: "ca" });
    expect(retry.status).toBe(200);
    const reused = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    expect(reused.id).toBe(pending.id);
    await expect(db.verificationToken.count({ where: { identifier: email } })).resolves.toBe(1);
  });

  it("keeps isolated persistence and active-notice failures private and mutation-free", async () => {
    const persistenceEmail = `${fixtures.scopeId}-persistence@example.test`;
    const transaction = vi
      .spyOn(db, "$transaction")
      .mockRejectedValueOnce(new Error("simulated persistence failure"));
    try {
      const response = await submit({
        name: "Persistence Failure",
        email: persistenceEmail,
        locale: "en",
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "accepted" });
    } finally {
      transaction.mockRestore();
    }
    await expect(lifecycleCounts(persistenceEmail)).resolves.toEqual({
      users: 0,
      tokens: 0,
      acceptances: 0,
      sessions: 0,
    });

    const active = fixtures.account({ status: "ACTIVE", name: "Stable Name" });
    await db.user.create({ data: active });
    http.enqueue({
      status: 400,
      body: JSON.stringify({ code: "invalid_recipient" }),
    });
    const notice = await submit({
      name: "Ignored Name",
      email: active.email,
      locale: "es",
    });
    expect(notice.status).toBe(200);
    await expect(notice.json()).resolves.toEqual({ status: "accepted" });
    await expect(db.user.findUnique({ where: { id: active.id } })).resolves.toMatchObject({
      name: "Stable Name",
      status: "ACTIVE",
    });
    await expect(db.verificationToken.count({
      where: { identifier: active.normalizedEmail },
    })).resolves.toBe(0);
  });
});