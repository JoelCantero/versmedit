// @vitest-environment node

import "dotenv/config";

import { createHash } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createHttpMailProvider } from "../helpers/http-mail-provider";
import { getTestProjectName } from "../helpers/project-name";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const integrationPrefix = "integration-login-code";
const projectName = getTestProjectName();
const secret = "integration-auth-secret-at-least-32-chars";

type Database = (typeof import("@/lib/db"))["db"];
type AuthPost = (typeof import("@/app/api/auth/[...nextauth]/route"))["POST"];
type AuthGet = (typeof import("@/app/api/auth/[...nextauth]/route"))["GET"];
type CodePost = (typeof import("@/app/api/auth/login/code/route"))["POST"];

const CODE_LINE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/m;

describe.skipIf(!runIntegrationTests)("login access code", () => {
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
  const originalEnv = new Map<string, string | undefined>();
  const emails = new Set<string>();
  const userIds = new Set<string>();
  const limiterKeys = new Set<string>();
  let db: Database;
  let postAuth: AuthPost;
  let getAuth: AuthGet;
  let postCode: CodePost;
  let NextRequestCtor: typeof import("next/server").NextRequest;
  let http: ReturnType<typeof createHttpMailProvider>;
  let clientSequence = 100;

  beforeAll(async () => {
    for (const key of managedEnv) originalEnv.set(key, process.env[key]);
    Object.assign(process.env, {
      PROJECT_NAME: projectName,
      AUTH_SECRET: secret,
      NEXTAUTH_URL: "https://app.example.test",
      MAIL_ENABLED: "true",
      MAIL_PROVIDER: "brevo",
      MAIL_API_KEY: "login-code-integration-key",
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
    const route = await import("@/app/api/auth/[...nextauth]/route");
    postAuth = route.POST;
    getAuth = route.GET;
    postCode = (await import("@/app/api/auth/login/code/route")).POST;
    NextRequestCtor = (await import("next/server")).NextRequest;
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

  function nextClient() {
    // Random octets keep limiter buckets isolated from earlier runs.
    const client = `10.${clientSequence++ % 250}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    limiterKeys.add(`auth:email:client:${client}`);
    limiterKeys.add(`auth:login-code:client:${client}`);
    return client;
  }

  function trackAddressLimiters(email: string) {
    const digest = createHash("sha256").update(email).digest("hex");
    limiterKeys.add(`auth:email:address:${digest}`);
    limiterKeys.add(`auth:login-code:address:${digest}`);
  }

  async function createActiveUser(email: string) {
    const user = await db.user.create({
      data: { email, normalizedEmail: email, status: "ACTIVE" },
    });
    emails.add(email);
    userIds.add(user.id);
    return user;
  }

  async function requestAccess(email: string, callbackUrl = "/") {
    const csrf = csrfProof();
    const normalizedEmail = email.trim().toLowerCase();
    emails.add(normalizedEmail);
    trackAddressLimiters(normalizedEmail);
    return postAuth(
      new NextRequestCtor(
        "https://app.example.test/api/auth/signin/email",
        {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "cf-connecting-ip": nextClient(),
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
      { params: Promise.resolve({ nextauth: ["signin", "email"] }) },
    );
  }

  function deliveredPayloads(email: string) {
    return http.requests.flatMap((request) => {
      if (request.method !== "POST" || !request.body?.includes(email)) return [];
      return [
        JSON.parse(request.body) as { textContent: string; htmlContent: string },
      ];
    });
  }

  function deliveredCodes(email: string) {
    return deliveredPayloads(email).flatMap(
      (payload) => payload.textContent.match(CODE_LINE) ?? [],
    );
  }

  function deliveredLinkTokens(email: string) {
    return http.requests.flatMap((request) => {
      if (request.method !== "POST" || !request.body?.includes(email)) return [];
      const match = request.body.match(/[?&]token=([A-Za-z0-9_-]+)/);
      return match?.[1] ? [match[1]] : [];
    });
  }

  async function submitCode(
    email: string,
    code: string,
    { client = nextClient(), callbackUrl = "/", locale = "en" } = {},
  ) {
    const csrf = csrfProof();
    trackAddressLimiters(email.trim().toLowerCase());
    return postCode(
      new NextRequestCtor("https://app.example.test/api/auth/login/code", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "cf-connecting-ip": client,
          cookie: csrf.cookie,
        },
        body: new URLSearchParams({
          email,
          code,
          csrfToken: csrf.token,
          callbackUrl,
          locale,
        }),
      }),
    );
  }

  async function useMagicLink(email: string, rawToken: string) {
    return getAuth(
      new NextRequestCtor(
        `https://app.example.test/api/auth/callback/email?token=${rawToken}&email=${encodeURIComponent(email)}&callbackUrl=%2F`,
      ),
      { params: Promise.resolve({ nextauth: ["callback", "email"] }) },
    );
  }

  function uniqueEmail(label: string) {
    return `${integrationPrefix}-${label}-${crypto.randomUUID()}@example.test`;
  }

  it("issues one challenge carrying both a link and a code with the same expiry", async () => {
    const email = uniqueEmail("issue");
    await createActiveUser(email);

    const response = await requestAccess(email);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });

    const rows = await db.verificationToken.findMany({
      where: { identifier: email },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.loginCodeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.loginCodeAttempts).toBe(0);

    const [code] = deliveredCodes(email);
    const [linkToken] = deliveredLinkTokens(email);
    expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
    expect(linkToken).toBeTruthy();
    expect(deliveredPayloads(email)).toHaveLength(1);
    expect(deliveredPayloads(email)[0]?.htmlContent).toContain(code!);
  });

  it("creates a session from a valid code and redirects to the validated destination", async () => {
    const email = uniqueEmail("accept");
    const user = await createActiveUser(email);
    await requestAccess(email, "/es/account");
    const [code] = deliveredCodes(email);

    const response = await submitCode(email, code!.toLowerCase(), {
      callbackUrl: "/es/account",
      locale: "es",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "accepted",
      redirectTo: "/es/account",
    });
    expect(response.headers.getSetCookie().join(";")).toContain(
      "next-auth.session-token",
    );
    await expect(
      db.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(0);
  });

  it("accepts a code pasted with formatting and falls back for an untrusted destination", async () => {
    const email = uniqueEmail("paste");
    await createActiveUser(email);
    await requestAccess(email, "/es");
    const [code] = deliveredCodes(email);
    const pasted = ` ${code!.slice(0, 5).toLowerCase()}-${code!.slice(5)} `;

    const response = await submitCode(email, pasted, {
      callbackUrl: "https://evil.test/steal",
      locale: "es",
    });

    await expect(response.json()).resolves.toEqual({
      status: "accepted",
      redirectTo: "/es",
    });
  });

  it("refuses the code once the magic link consumed the challenge", async () => {
    const email = uniqueEmail("link-first");
    await createActiveUser(email);
    await requestAccess(email);
    const [code] = deliveredCodes(email);
    const [linkToken] = deliveredLinkTokens(email);

    await useMagicLink(email, linkToken!);
    const response = await submitCode(email, code!);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_code" });
  });

  it("refuses the magic link once the code consumed the challenge", async () => {
    const email = uniqueEmail("code-first");
    const user = await createActiveUser(email);
    await requestAccess(email);
    const [code] = deliveredCodes(email);
    const [linkToken] = deliveredLinkTokens(email);

    await expect(
      (await submitCode(email, code!)).json(),
    ).resolves.toMatchObject({ status: "accepted" });
    const before = await db.session.count({ where: { userId: user.id } });
    await useMagicLink(email, linkToken!);

    await expect(
      db.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(before);
  });

  it("refuses a replayed code", async () => {
    const email = uniqueEmail("replay");
    await createActiveUser(email);
    await requestAccess(email);
    const [code] = deliveredCodes(email);

    await submitCode(email, code!);
    const replay = await submitCode(email, code!);

    expect(replay.status).toBe(400);
    await expect(replay.json()).resolves.toEqual({ status: "invalid_code" });
  });

  it("invalidates the previous code when a newer email is requested", async () => {
    const email = uniqueEmail("supersede");
    await createActiveUser(email);
    await requestAccess(email);
    const [firstCode] = deliveredCodes(email);
    await requestAccess(email);
    const codes = deliveredCodes(email);
    expect(codes).toHaveLength(2);
    expect(codes[1]).not.toBe(firstCode);

    const stale = await submitCode(email, firstCode!);

    expect(stale.status).toBe(400);
    await expect(
      (await submitCode(email, codes[1]!)).json(),
    ).resolves.toMatchObject({ status: "accepted" });
  });

  it("refuses an expired challenge", async () => {
    const email = uniqueEmail("expired");
    await createActiveUser(email);
    await requestAccess(email);
    const [code] = deliveredCodes(email);
    await db.verificationToken.updateMany({
      where: { identifier: email },
      data: { expires: new Date(Date.now() - 1_000) },
    });

    const response = await submitCode(email, code!);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_code" });
  });

  it("creates at most one session for concurrent submissions of the same code", async () => {
    const email = uniqueEmail("concurrent");
    const user = await createActiveUser(email);
    await requestAccess(email);
    const [code] = deliveredCodes(email);
    const client = nextClient();

    const responses = await Promise.all([
      submitCode(email, code!, { client }),
      submitCode(email, code!, { client }),
    ]);
    const accepted = responses.filter((response) => response.status === 200);

    expect(accepted).toHaveLength(1);
    await expect(
      db.session.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);
  });

  it("discards the challenge after five failed attempts", async () => {
    const email = uniqueEmail("budget");
    await createActiveUser(email);
    await requestAccess(email);
    const [code] = deliveredCodes(email);
    const client = nextClient();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const wrong = await submitCode(email, "ABCDEFGHJK", { client });
      expect(wrong.status).toBe(400);
    }
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(1);

    const fifth = await submitCode(email, "ABCDEFGHJK", { client });
    expect(fifth.status).toBe(400);
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(0);

    const afterBudget = await submitCode(email, code!, { client });
    expect(afterBudget.status).toBe(400);
    await expect(afterBudget.json()).resolves.toEqual({ status: "invalid_code" });
  });

  it("throttles repeated attempts from one client with a generic response", async () => {
    const email = uniqueEmail("throttle");
    await createActiveUser(email);
    await requestAccess(email);
    const client = nextClient();

    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      statuses.push((await submitCode(email, "ABCDEFGHJK", { client })).status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => 400));
    const throttled = await submitCode(email, "ABCDEFGHJK", { client });
    expect(throttled.status).toBe(429);
    await expect(throttled.json()).resolves.toMatchObject({
      status: "rate_limited",
    });
    expect(throttled.headers.get("Retry-After")).toBeTruthy();
  }, 30_000);

  it("never produces a usable code for an address without an active account", async () => {
    const email = uniqueEmail("unknown");
    emails.add(email);

    const response = await requestAccess(email);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(deliveredPayloads(email)).toHaveLength(0);
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(0);
    const guess = await submitCode(email, "ABCDEFGHJK");
    expect(guess.status).toBe(400);
    await expect(guess.json()).resolves.toEqual({ status: "invalid_code" });
  });

  it("leaves no usable code when the provider rejects delivery", async () => {
    const email = uniqueEmail("delivery");
    await createActiveUser(email);
    http.enqueue({ status: 503, body: "{}" });

    const response = await requestAccess(email);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(0);
  });

  it("keeps a pre-migration challenge usable through its link only", async () => {
    const email = uniqueEmail("legacy");
    await createActiveUser(email);
    await requestAccess(email);
    const [linkToken] = deliveredLinkTokens(email);
    // Reproduce a challenge issued before this feature: no code on the row.
    await db.verificationToken.updateMany({
      where: { identifier: email },
      data: { loginCodeHash: null },
    });

    const guess = await submitCode(email, "ABCDEFGHJK");
    expect(guess.status).toBe(400);
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(1);

    await useMagicLink(email, linkToken!);
    await expect(
      db.verificationToken.count({ where: { identifier: email } }),
    ).resolves.toBe(0);
  });
});
