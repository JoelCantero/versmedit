// @vitest-environment node

import { createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createSignupFixtureScope } from "../helpers/signup-fixtures";
import { startTestSmtpServer } from "../helpers/smtp-server";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const secret = "signup-integration-auth-secret-32-characters";
const originalEnv = new Map<string, string | undefined>();
const managedEnv = [
  "PROJECT_NAME",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "AUTH_EMAIL_ENABLED",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "TRUST_PROXY_HEADERS",
] as const;

type Database = (typeof import("@/lib/db"))["db"];
type SignupPost = (typeof import("@/app/api/signup/route"))["POST"];
type SignupActivate = (typeof import("@/app/api/signup/activate/route"))["GET"];
type AuthPost = (typeof import("@/app/api/auth/[...nextauth]/route"))["POST"];
type SmtpFixture = Awaited<ReturnType<typeof startTestSmtpServer>>;

describe.skipIf(!runIntegrationTests)("signup onboarding integration", () => {
  let db: Database;
  let postSignup: SignupPost;
  let activateSignup: SignupActivate;
  let postAuth: AuthPost;
  let smtp: SmtpFixture;
  let fixtures = createSignupFixtureScope("signup-onboarding");
  const limiterKeys = new Set<string>();
  const submittedEmails = new Set<string>();
  let clientSequence = 60;

  beforeAll(async () => {
    smtp = await startTestSmtpServer({ clientTimeoutMs: 1_000 });
    for (const key of managedEnv) originalEnv.set(key, process.env[key]);
    Object.assign(process.env, {
      PROJECT_NAME: "versmedit-signup-test",
      AUTH_SECRET: secret,
      NEXTAUTH_URL: "https://app.example.test",
      AUTH_EMAIL_ENABLED: "true",
      SMTP_HOST: smtp.host,
      SMTP_PORT: String(smtp.port),
      SMTP_SECURE: "false",
      SMTP_USER: "signup-test",
      SMTP_PASSWORD: "signup-test-password",
      SMTP_FROM: "Versmedit Test <no-reply@example.test>",
      TRUST_PROXY_HEADERS: "true",
    });
    vi.resetModules();
    db = (await import("@/lib/db")).db;
    postSignup = (await import("@/app/api/signup/route")).POST;
    activateSignup = (await import("@/app/api/signup/activate/route")).GET;
    postAuth = (await import("@/app/api/auth/[...nextauth]/route")).POST;
  });

  beforeEach(async () => {
    fixtures = createSignupFixtureScope("signup-onboarding");
    smtp.reset();
    await db.rateLimitBucket.deleteMany({
      where: { key: "auth:email:provider:unavailable" },
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
      where: { key: "auth:email:provider:unavailable" },
    });
  });

  afterAll(async () => {
    await smtp?.stop();
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
    const message = [...smtp.messages]
      .reverse()
      .find((candidate) => candidate.to.includes(recipient));
    const match = message?.raw
      .toString()
      .match(/token(?:=3D|=)([A-Za-z0-9_-]{43})/);
    if (!match?.[1]) throw new Error("captured onboarding token was not found");
    return match[1];
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

    expect(smtp.messages).toHaveLength(4);
    const activeMail = smtp.messages.find((message) =>
      message.to.includes(active.normalizedEmail),
    );
    expect(activeMail?.raw.toString()).toContain("/login");
    expect(activeMail?.raw.toString()).not.toContain("/api/signup/activate");
    for (const recipient of [newEmail, pending.normalizedEmail]) {
      const onboarding = smtp.messages.filter((message) =>
        message.to.includes(recipient),
      );
      expect(onboarding.length).toBeGreaterThan(0);
      expect(onboarding.at(-1)?.raw.toString()).toContain("/api/signup/activate");
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
    const createSession = vi
      .spyOn(db.session, "create")
      .mockRejectedValueOnce(new Error("simulated session failure"));

    try {
      const response = await activateSignup(activationRequest(rawToken));
      expect(response.headers.get("location")).toBe(
        "https://app.example.test/es/signup?state=session_failed",
      );
    } finally {
      createSession.mockRestore();
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

  it.each([
    ["invalid name", { name: "", policyAccepted: true }],
    ["malicious name", { name: "<script>alert(1)</script>", policyAccepted: true }],
    ["additional field", { name: "Safe Person", policyAccepted: true, role: "admin" }],
  ])("rejects %s without account, credential, acceptance, or session mutation", async (_case, fields) => {
    const email = `${fixtures.scopeId}-${crypto.randomUUID()}@example.test`;
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
    expect(smtp.messages).toHaveLength(0);
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
    expect(smtp.messages).toHaveLength(0);
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
    const { markProviderUnavailable } = await import("@/lib/provider-availability");
    const pending = fixtures.account({ status: "PENDING" });
    const active = fixtures.account({ status: "ACTIVE", name: "Existing Name" });
    await db.user.createMany({ data: [pending, active] });
    const newEmail = `${fixtures.scopeId}-outage-new@example.test`;
    await markProviderUnavailable();

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
    expect(smtp.messages).toHaveLength(0);
  });

  it("cleans an isolated rejected credential and safely reuses the pending account", async () => {
    const { getProviderAvailability } = await import("@/lib/provider-availability");
    const email = `${fixtures.scopeId}-recipient-reject@example.test`;
    smtp.setBehavior("reject");

    const rejected = await submit({ name: "First Candidate", email, locale: "en" });
    expect(rejected.status).toBe(200);
    await expect(rejected.json()).resolves.toEqual({ status: "accepted" });
    const pending = await db.user.findUniqueOrThrow({
      where: { normalizedEmail: email },
    });
    expect(pending.status).toBe("PENDING");
    await expect(db.verificationToken.count({ where: { identifier: email } })).resolves.toBe(0);
    await expect(getProviderAvailability()).resolves.toEqual({
      available: true,
      retryAfterSeconds: 0,
    });

    smtp.reset();
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
    smtp.setBehavior("reject");
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