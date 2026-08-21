// @vitest-environment node

import "dotenv/config";

import { createHash } from "node:crypto";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { createHttpMailProvider, type FakeProviderBehavior } from "../helpers/http-mail-provider";
import { getTestProjectName } from "../helpers/project-name";

vi.mock("server-only", () => ({}));

const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === "true";
const projectName = getTestProjectName();
const secret = "email-performance-secret-at-least-32-chars";
const sampleSize = 20;
const warmupSize = 2;
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
const originalEnv = new Map(
  managedEnv.map((key) => [key, process.env[key]] as const),
);

type ProviderName = "brevo" | "mailjet";
type Database = (typeof import("@/lib/db"))["db"];
type AuthPost = (typeof import("@/app/api/auth/[...nextauth]/route"))["POST"];
type SignupPost = (typeof import("@/app/api/signup/route"))["POST"];

let db: Database | undefined;
let http: ReturnType<typeof createHttpMailProvider> | undefined;
let testEmails = new Set<string>();
const limiterKeys = new Set<string>();

function acceptedBehavior(
  provider: ProviderName,
  recipient: string,
): FakeProviderBehavior {
  if (provider === "brevo") {
    return {
      status: 201,
      body: JSON.stringify({ messageId: "controlled-accept" }),
    };
  }
  return {
    status: 200,
    body: JSON.stringify({
      Messages: [
        {
          Status: "success",
          To: [
            {
              Email: recipient,
              MessageUUID: "controlled-accept",
            },
          ],
        },
      ],
    }),
  };
}

function csrfProof() {
  const token = `csrf-${crypto.randomUUID()}`;
  const hash = createHash("sha256").update(`${token}${secret}`).digest("hex");
  const value = encodeURIComponent(`${token}|${hash}`);
  return {
    token,
    cookie: `next-auth.csrf-token=${value}; __Host-next-auth.csrf-token=${value}`,
  };
}

function trackRateLimits(email: string, client: string) {
  limiterKeys.add(`auth:email:client:${client}`);
  limiterKeys.add(
    `auth:email:address:${createHash("sha256").update(email).digest("hex")}`,
  );
}

async function configureProvider(provider: ProviderName) {
  Object.assign(process.env, {
    PROJECT_NAME: projectName,
    AUTH_SECRET: secret,
    NEXTAUTH_URL: "https://app.example.test",
    MAIL_ENABLED: "true",
    MAIL_PROVIDER: provider,
    MAIL_API_KEY: "performance-key",
    MAIL_API_SECRET: provider === "mailjet" ? "performance-secret" : "",
    MAIL_FROM: "no-reply@example.test",
    TRUST_PROXY_HEADERS: "true",
  });
  vi.resetModules();
  http = createHttpMailProvider();
  vi.doMock("@/lib/email/http", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/email/http")>()),
    nativeProviderHttpClient: http!.client,
  }));
  db = (await import("@/lib/db")).db;
  const authRoute = await import("@/app/api/auth/[...nextauth]/route");
  const signupRoute = await import("@/app/api/signup/route");

  await db.rateLimitBucket.deleteMany({
    where: { key: { startsWith: "mail:provider-health" } },
  });
  await db.rateLimitBucket.create({
    data: {
      key: `mail:provider-health:${provider}`,
      count: 0,
      resetAt: new Date(Date.now() + 60_000),
    },
  });

  return { postAuth: authRoute.POST, postSignup: signupRoute.POST };
}

async function collectSamples(action: (index: number) => Promise<Response>) {
  const durations: number[] = [];
  for (let index = 0; index < warmupSize + sampleSize; index += 1) {
    const startedAt = Date.now();
    const response = await action(index);
    const elapsedMs = Date.now() - startedAt;
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    if (index >= warmupSize) durations.push(elapsedMs);
  }
  return durations;
}

function expectPerformanceSample(durations: number[]) {
  expect(durations).toHaveLength(sampleSize);
  expect(durations.every((duration) => duration >= 500)).toBe(true);
  expect(durations.filter((duration) => duration < 5_000).length).toBeGreaterThanOrEqual(19);
}

async function loginSample(postAuth: AuthPost, provider: ProviderName, scope: string) {
  const emails = Array.from(
    { length: warmupSize + sampleSize },
    (_, index) => `performance-${provider}-login-${index}-${scope}@example.test`,
  );
  testEmails = new Set([...testEmails, ...emails]);
  await db!.user.createMany({
    data: emails.map((email) => ({
      email,
      normalizedEmail: email,
      status: "ACTIVE" as const,
    })),
  });

  return collectSamples(async (index) => {
    const email = emails[index]!;
    const client = `203.0.113.${index + 10}`;
    const csrf = csrfProof();
    trackRateLimits(email, client);
    http!.enqueue(acceptedBehavior(provider, email));
    const { NextRequest } = await import("next/server");
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
  });
}

async function signupSample(postSignup: SignupPost, provider: ProviderName, scope: string) {
  return collectSamples(async (index) => {
    const email = `performance-${provider}-signup-${index}-${scope}@example.test`;
    const client = `198.51.100.${index + 10}`;
    const csrf = csrfProof();
    testEmails.add(email);
    trackRateLimits(email, client);
    http!.enqueue(acceptedBehavior(provider, email));
    const { NextRequest } = await import("next/server");
    return postSignup(
      new NextRequest("https://app.example.test/api/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": client,
          cookie: csrf.cookie,
        },
        body: JSON.stringify({
          name: "Performance Person",
          email,
          locale: "en",
          policyAccepted: true,
          csrfToken: csrf.token,
        }),
      }),
    );
  });
}

describe.skipIf(!runIntegrationTests)("email route response-time sample", () => {
  it.each(["brevo", "mailjet"] as const)(
    "meets SC-010 for login and signup through %s",
    async (provider) => {
      const scope = crypto.randomUUID();
      const { postAuth, postSignup } = await configureProvider(provider);

      const loginDurations = await loginSample(postAuth, provider, scope);
      expectPerformanceSample(loginDurations);
      expect(http!.requests.filter((request) => request.method === "POST")).toHaveLength(
        warmupSize + sampleSize,
      );

      const signupDurations = await signupSample(postSignup, provider, scope);
      expectPerformanceSample(signupDurations);
      expect(http!.requests.filter((request) => request.method === "POST")).toHaveLength(
        (warmupSize + sampleSize) * 2,
      );
    },
    40_000,
  );
});

afterEach(async () => {
  if (db) {
    const emails = [...testEmails];
    const users = await db.user.findMany({
      where: { normalizedEmail: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await db.verificationToken.deleteMany({
      where: { identifier: { in: emails } },
    });
    await db.session.deleteMany({ where: { userId: { in: userIds } } });
    await db.policyAcceptance.deleteMany({ where: { userId: { in: userIds } } });
    await db.account.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.rateLimitBucket.deleteMany({
      where: {
        OR: [
          { key: { in: [...limiterKeys] } },
          { key: { startsWith: "mail:provider-health" } },
        ],
      },
    });
  }
  testEmails.clear();
  limiterKeys.clear();
  vi.doUnmock("@/lib/email/http");
  for (const key of managedEnv) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterAll(async () => {
  await db?.$disconnect();
});
