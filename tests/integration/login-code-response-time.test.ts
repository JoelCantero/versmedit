// @vitest-environment node

import "dotenv/config";

import { createHash } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createHttpMailProvider } from "../helpers/http-mail-provider";
import { getTestProjectName } from "../helpers/project-name";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const integrationPrefix = "integration-login-code-timing";
const projectName = getTestProjectName();
const secret = "integration-auth-secret-at-least-32-chars";

// Matches the accepted-response envelope in src/modules/login/service.ts.
const FLOOR_MS = 500;
const CEILING_MS = 600;
const SAMPLES = 3;

type Database = (typeof import("@/lib/db"))["db"];
type AuthPost = (typeof import("@/app/api/auth/[...nextauth]/route"))["POST"];
type CodePost = (typeof import("@/app/api/auth/login/code/route"))["POST"];

describe.skipIf(!runIntegrationTests)("login code response timing", () => {
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
    "TRUST_PROXY_HEADERS",
  ] as const;
  const originalEnv = new Map<string, string | undefined>();
  const emails = new Set<string>();
  const userIds = new Set<string>();
  const limiterKeys = new Set<string>();
  let db: Database;
  let postAuth: AuthPost;
  let postCode: CodePost;
  let NextRequestCtor: typeof import("next/server").NextRequest;
  let http: ReturnType<typeof createHttpMailProvider>;

  beforeAll(async () => {
    for (const key of managedEnv) originalEnv.set(key, process.env[key]);
    Object.assign(process.env, {
      PROJECT_NAME: projectName,
      AUTH_SECRET: secret,
      NEXTAUTH_URL: "https://app.example.test",
      MAIL_ENABLED: "true",
      MAIL_PROVIDER: "brevo",
      MAIL_API_KEY: "login-code-timing-key",
      MAIL_API_SECRET: "",
      MAIL_FROM: "no-reply@example.test",
      BRAND_COLOR: "#0057B8",
      SUPPORT_EMAIL: "support@example.test",
      TRUST_PROXY_HEADERS: "true",
    });
    vi.resetModules();
    http = createHttpMailProvider();
    vi.doMock("@/lib/email/http", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/email/http")>()),
      nativeProviderHttpClient: http.client,
    }));
    db = (await import("@/lib/db")).db;
    postAuth = (await import("@/app/api/auth/[...nextauth]/route")).POST;
    postCode = (await import("@/app/api/auth/login/code/route")).POST;
    NextRequestCtor = (await import("next/server")).NextRequest;
    await db.rateLimitBucket.upsert({
      where: { key: "mail:provider-health:brevo" },
      create: {
        key: "mail:provider-health:brevo",
        count: 0,
        resetAt: new Date(Date.now() + 600_000),
      },
      update: { count: 0, resetAt: new Date(Date.now() + 600_000) },
    });
  });

  afterEach(async () => {
    await db.session.deleteMany({ where: { userId: { in: [...userIds] } } });
    await db.verificationToken.deleteMany({
      where: { identifier: { in: [...emails] } },
    });
    await db.user.deleteMany({ where: { id: { in: [...userIds] } } });
    await db.rateLimitBucket.deleteMany({
      where: { key: { in: [...limiterKeys] } },
    });
    emails.clear();
    userIds.clear();
    limiterKeys.clear();
  });

  afterAll(async () => {
    vi.doUnmock("@/lib/email/http");
    await db.rateLimitBucket.deleteMany({
      where: { key: { startsWith: "mail:provider-health" } },
    });
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
    const client = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    limiterKeys.add(`auth:email:client:${client}`);
    limiterKeys.add(`auth:login-code:client:${client}`);
    return client;
  }

  function trackAddress(email: string) {
    const digest = createHash("sha256").update(email).digest("hex");
    limiterKeys.add(`auth:email:address:${digest}`);
    limiterKeys.add(`auth:login-code:address:${digest}`);
  }

  function uniqueEmail(label: string) {
    return `${integrationPrefix}-${label}-${crypto.randomUUID()}@example.test`;
  }

  async function createActiveUser(email: string) {
    const user = await db.user.create({
      data: { email, normalizedEmail: email, status: "ACTIVE" },
    });
    emails.add(email);
    userIds.add(user.id);
    return user;
  }

  async function requestAccess(email: string) {
    const csrf = csrfProof();
    emails.add(email);
    trackAddress(email);
    return postAuth(
      new NextRequestCtor("https://app.example.test/api/auth/signin/email", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "cf-connecting-ip": nextClient(),
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

  function deliveredCode(email: string) {
    for (const request of http.requests) {
      if (request.method !== "POST" || !request.body?.includes(email)) continue;
      const payload = JSON.parse(request.body) as { textContent: string };
      const match = payload.textContent.match(
        /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/m,
      );
      if (match) return match[0];
    }
    return null;
  }

  async function timeCodeSubmission(email: string, code: string) {
    const csrf = csrfProof();
    trackAddress(email);
    const startedAt = performance.now();
    const response = await postCode(
      new NextRequestCtor("https://app.example.test/api/auth/login/code", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "cf-connecting-ip": nextClient(),
          cookie: csrf.cookie,
        },
        body: new URLSearchParams({
          email,
          code,
          csrfToken: csrf.token,
          callbackUrl: "/",
          locale: "en",
        }),
      }),
    );
    return { status: response.status, elapsedMs: performance.now() - startedAt };
  }

  it(
    "holds accepted and rejected code responses inside the same envelope",
    async () => {
      const samples: Array<{ label: string; status: number; elapsedMs: number }> =
        [];

      for (let index = 0; index < SAMPLES; index += 1) {
        const knownEmail = uniqueEmail(`known-${index}`);
        await createActiveUser(knownEmail);
        http.requests.splice(0);
        await requestAccess(knownEmail);
        const code = deliveredCode(knownEmail);
        expect(code).toBeTruthy();

        const wrong = await timeCodeSubmission(knownEmail, "ABCDEFGHJK");
        expect(wrong.status).toBe(400);
        samples.push({ label: "wrong code, challenge exists", ...wrong });

        const unknownEmail = uniqueEmail(`unknown-${index}`);
        emails.add(unknownEmail);
        const missing = await timeCodeSubmission(unknownEmail, "ABCDEFGHJK");
        expect(missing.status).toBe(400);
        samples.push({ label: "no challenge at all", ...missing });

        const accepted = await timeCodeSubmission(knownEmail, code!);
        expect(accepted.status).toBe(200);
        samples.push({ label: "accepted", ...accepted });
      }

      for (const sample of samples) {
        expect(
          sample.elapsedMs,
          `${sample.label} finished in ${sample.elapsedMs.toFixed(1)}ms`,
        ).toBeGreaterThanOrEqual(FLOOR_MS - 5);
      }

      const slowest = Math.max(...samples.map((sample) => sample.elapsedMs));
      const fastest = Math.min(...samples.map((sample) => sample.elapsedMs));
      expect(slowest - fastest).toBeLessThan(CEILING_MS);
    },
    60_000,
  );
});
