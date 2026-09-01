// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authGet: vi.fn<(request: unknown, context: unknown) => Promise<Response>>(),
  logInfo: vi.fn(),
  consumeSharedRateLimit: vi.fn<
    (options: { key: string; limit: number; windowMs: number }) => Promise<{
      allowed: boolean;
      remaining: number;
      retryAfterSeconds: number;
    }>
  >(),
  validateAuthCsrfToken: vi.fn(() => true),
  isCanonicalRequestOrigin: vi.fn(() => true),
  findLoginChallengeCodeHash: vi.fn<() => Promise<string | null>>(),
  registerFailedLoginCodeAttempt: vi.fn(() => Promise.resolve()),
  waitForAcceptedLogin: vi.fn<(options: { startedAt: number }) => Promise<void>>(
    () => Promise.resolve(),
  ),
  runWithLoginCodeAuthorization: vi.fn<
    (
      authorization: { identifier: string; token: string; codeHash: string },
      callback: () => Promise<Response>,
    ) => Promise<Response>
  >((_authorization, callback) => callback()),
  env: {
    MAIL: { enabled: true as boolean },
    NEXTAUTH_URL: "https://app.example.test",
    AUTH_SECRET: "test-auth-secret-value-0000000000",
  },
}));

vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ GET: mocks.authGet }));
vi.mock("@/lib/logger", () => ({
  getRequestLogger: () => ({ info: mocks.logInfo }),
}));
vi.mock("@/lib/env", () => ({ getEnv: () => mocks.env }));
vi.mock("@/lib/shared-rate-limit", () => ({
  consumeSharedRateLimit: mocks.consumeSharedRateLimit,
}));
vi.mock("@/lib/auth-csrf", () => ({
  validateAuthCsrfToken: mocks.validateAuthCsrfToken,
}));
vi.mock("@/lib/request-context", () => ({
  getClientIdentifier: () => "client-1",
  isCanonicalRequestOrigin: mocks.isCanonicalRequestOrigin,
}));
vi.mock("@/modules/login/service", () => ({
  findLoginChallengeCodeHash: mocks.findLoginChallengeCodeHash,
  registerFailedLoginCodeAttempt: mocks.registerFailedLoginCodeAttempt,
  waitForAcceptedLogin: mocks.waitForAcceptedLogin,
}));
vi.mock("@/modules/login/verification-context", () => ({
  runWithLoginCodeAuthorization: mocks.runWithLoginCodeAuthorization,
}));

import nextConfig from "../../next.config";
import { POST } from "@/app/api/auth/login/code/route";
import { hashLoginCode } from "@/modules/login/code-token";

const EMAIL = "person@example.test";
const CODE = "7K2QM9XPTR";

function codeRequest(body: Record<string, string> = {}) {
  return new NextRequest("https://app.example.test/api/auth/login/code", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: "next-auth.csrf-token=token",
    },
    body: new URLSearchParams({
      email: EMAIL,
      code: CODE,
      csrfToken: "token",
      callbackUrl: "/es/account",
      locale: "es",
      ...body,
    }),
  });
}

function sessionResponse() {
  const response = new Response(null, { status: 302 });
  response.headers.append(
    "set-cookie",
    "next-auth.session-token=session; Path=/; HttpOnly; SameSite=Lax",
  );
  return response;
}

describe("POST /api/auth/login/code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.MAIL.enabled = true;
    mocks.validateAuthCsrfToken.mockReturnValue(true);
    mocks.isCanonicalRequestOrigin.mockReturnValue(true);
    mocks.consumeSharedRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 9,
      retryAfterSeconds: 0,
    });
    mocks.findLoginChallengeCodeHash.mockResolvedValue(
      hashLoginCode({
        identifier: EMAIL,
        code: CODE,
        secret: mocks.env.AUTH_SECRET,
      }),
    );
    mocks.authGet.mockResolvedValue(sessionResponse());
    mocks.runWithLoginCodeAuthorization.mockImplementation(
      (_authorization, callback) => callback(),
    );
  });

  it("creates the session and returns the validated destination", async () => {
    const response = await POST(codeRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "accepted",
      redirectTo: "/es/account",
    });
    expect(response.headers.getSetCookie()).toEqual([
      "next-auth.session-token=session; Path=/; HttpOnly; SameSite=Lax",
    ]);
    expect(mocks.logInfo).toHaveBeenCalledWith(
      { outcome: "accepted" },
      "login code validation",
    );
  });

  it("never places the code in the delegated URL", async () => {
    await POST(codeRequest());

    const delegated = mocks.authGet.mock.calls[0]?.[0] as NextRequest;
    expect(delegated.nextUrl.pathname).toBe("/api/auth/callback/email");
    expect(delegated.nextUrl.search).not.toContain(CODE);
    expect(delegated.nextUrl.searchParams.get("token")).not.toBe(CODE);
    expect(delegated.nextUrl.searchParams.get("email")).toBe(EMAIL);
    expect(delegated.nextUrl.searchParams.get("callbackUrl")).toBe("/es/account");
    for (const call of mocks.logInfo.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(CODE);
    }
  });

  it("falls back to the locale home for a destination outside the allow-list", async () => {
    const response = await POST(codeRequest({ callbackUrl: "https://evil.test/" }));

    await expect(response.json()).resolves.toEqual({
      status: "accepted",
      redirectTo: "/es",
    });
  });

  it("rejects when email authentication is disabled", async () => {
    mocks.env.MAIL.enabled = false;

    const response = await POST(codeRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(mocks.consumeSharedRateLimit).not.toHaveBeenCalled();
  });

  it("rejects a request that did not arrive on the canonical origin", async () => {
    mocks.isCanonicalRequestOrigin.mockReturnValue(false);

    const response = await POST(codeRequest());

    expect(response.status).toBe(421);
    await expect(response.json()).resolves.toEqual({
      status: "misdirected_request",
    });
    expect(mocks.consumeSharedRateLimit).not.toHaveBeenCalled();
  });

  it("charges the client limit before validating anything else", async () => {
    mocks.consumeSharedRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    const response = await POST(codeRequest({ code: "not-a-code" }));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      status: "rate_limited",
      retryAfter: 42,
    });
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(mocks.validateAuthCsrfToken).not.toHaveBeenCalled();
    expect(mocks.findLoginChallengeCodeHash).not.toHaveBeenCalled();
    expect(mocks.logInfo).toHaveBeenCalledWith(
      { outcome: "throttled" },
      "login code validation",
    );
  });

  it("charges the address limit before looking up the challenge", async () => {
    mocks.consumeSharedRateLimit
      .mockResolvedValueOnce({ allowed: true, remaining: 9, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 17 });

    const response = await POST(codeRequest());

    expect(response.status).toBe(429);
    expect(mocks.findLoginChallengeCodeHash).not.toHaveBeenCalled();
    const [clientCall, addressCall] = mocks.consumeSharedRateLimit.mock.calls;
    expect(clientCall?.[0].key).toBe("auth:login-code:client:client-1");
    expect(addressCall?.[0].key).toMatch(/^auth:login-code:address:[0-9a-f]{64}$/);
    expect(clientCall?.[0].limit).toBe(10);
    expect(clientCall?.[0].windowMs).toBe(5 * 60 * 1_000);
  });

  it("rejects an invalid CSRF token without touching the challenge", async () => {
    mocks.validateAuthCsrfToken.mockReturnValue(false);

    const response = await POST(codeRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "invalid_request" });
    expect(mocks.findLoginChallengeCodeHash).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed email", { email: "not-an-email" }],
    ["a code that is too short", { code: "7K2QM9XPT" }],
    ["a code with an excluded letter", { code: "7K2QM9XPTO" }],
    ["a code with punctuation", { code: "7K2QM9XPT!" }],
  ])("returns the same generic failure for %s", async (_label, body) => {
    const response = await POST(codeRequest(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_code" });
    expect(mocks.findLoginChallengeCodeHash).not.toHaveBeenCalled();
    expect(mocks.waitForAcceptedLogin).toHaveBeenCalled();
  });

  it("returns the generic failure when no challenge exists", async () => {
    mocks.findLoginChallengeCodeHash.mockResolvedValue(null);

    const response = await POST(codeRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_code" });
    expect(mocks.registerFailedLoginCodeAttempt).not.toHaveBeenCalled();
    expect(mocks.authGet).not.toHaveBeenCalled();
    expect(mocks.waitForAcceptedLogin).toHaveBeenCalled();
  });

  it("charges an attempt and returns the generic failure for a wrong code", async () => {
    mocks.findLoginChallengeCodeHash.mockResolvedValue(
      hashLoginCode({
        identifier: EMAIL,
        code: "ABCDEFGHJK",
        secret: mocks.env.AUTH_SECRET,
      }),
    );

    const response = await POST(codeRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_code" });
    expect(mocks.registerFailedLoginCodeAttempt).toHaveBeenCalledWith(EMAIL);
    expect(mocks.authGet).not.toHaveBeenCalled();
    expect(mocks.logInfo).toHaveBeenCalledWith(
      { outcome: "rejected" },
      "login code validation",
    );
  });

  it("returns the generic failure when the delegated callback creates no session", async () => {
    mocks.authGet.mockResolvedValue(new Response(null, { status: 302 }));

    const response = await POST(codeRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_code" });
  });

  it("returns the generic failure when the delegated callback throws", async () => {
    mocks.authGet.mockRejectedValue(new Error("callback exploded"));

    const response = await POST(codeRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ status: "invalid_code" });
  });

  it("authorizes the consumption with the stored challenge hash", async () => {
    await POST(codeRequest());

    const [authorization] = mocks.runWithLoginCodeAuthorization.mock.calls[0]!;
    expect(authorization).toEqual({
      identifier: EMAIL,
      token: expect.stringMatching(/^[0-9a-f]{64}$/),
      codeHash: hashLoginCode({
        identifier: EMAIL,
        code: CODE,
        secret: mocks.env.AUTH_SECRET,
      }),
    });
  });

  it("holds accepted and rejected responses to the shared timing envelope", async () => {
    mocks.findLoginChallengeCodeHash.mockResolvedValueOnce(null);
    await POST(codeRequest());
    await POST(codeRequest());

    expect(mocks.waitForAcceptedLogin).toHaveBeenCalledTimes(2);
    for (const [options] of mocks.waitForAcceptedLogin.mock.calls) {
      expect(options).toEqual({ startedAt: expect.any(Number) });
    }
  });

  it("is covered by the non-indexable header rule for API routes", async () => {
    const headers = await nextConfig.headers!();
    const apiRule = headers.find((rule) => rule.source === "/api/:path*");

    expect(apiRule?.headers).toContainEqual({
      key: "X-Robots-Tag",
      value: "noindex, nofollow",
    });
  });
});
