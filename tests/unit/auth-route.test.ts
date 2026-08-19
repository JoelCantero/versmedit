// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  post: vi.fn<(request?: unknown, context?: unknown) => Promise<Response>>(() =>
    Promise.resolve(new Response(null, { status: 204 })),
  ),
  nextAuth: vi.fn(),
  logWarn: vi.fn(),
  consumeSharedRateLimit: vi.fn(),
  validateAuthCsrfToken: vi.fn(() => true),
  findExistingLoginEmail: vi.fn<() => Promise<string | null>>(() =>
    Promise.resolve("target@example.test"),
  ),
  acceptedLoginResponse: vi.fn(() => Promise.resolve(Response.json({ status: "accepted" }))),
  hashLoginEmail: vi.fn((email: string) => email),
  getProviderAvailability: vi.fn(() =>
    Promise.resolve({ available: true, retryAfterSeconds: 0 }),
  ),
  getSignupActivationAuthorization: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));
vi.mock("next-auth", () => ({
  default: mocks.nextAuth,
}));
vi.mock("@/lib/logger", () => ({
  getRequestLogger: () => ({ warn: mocks.logWarn }),
}));
vi.mock("@/lib/shared-rate-limit", () => ({
  consumeSharedRateLimit: mocks.consumeSharedRateLimit,
}));
vi.mock("@/lib/auth-csrf", () => ({
  validateAuthCsrfToken: mocks.validateAuthCsrfToken,
}));
vi.mock("@/modules/login/service", () => ({
  acceptedLoginResponse: mocks.acceptedLoginResponse,
  findExistingLoginEmail: mocks.findExistingLoginEmail,
  hashLoginEmail: mocks.hashLoginEmail,
}));
vi.mock("@/lib/provider-availability", () => ({
  getProviderAvailability: mocks.getProviderAvailability,
}));
vi.mock("@/modules/login/verification-context", () => ({
  runWithVerificationContext: (callback: () => Promise<Response>) => callback(),
}));
vi.mock("@/modules/signup/verification-context", () => ({
  getSignupActivationAuthorization: mocks.getSignupActivationAuthorization,
}));

import { GET, POST } from "@/app/api/auth/[...nextauth]/route";

const routeContext = {
  params: Promise.resolve({ nextauth: ["signin", "email"] }),
};

describe("Auth.js route rate limiting", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    mocks.post.mockClear();
    mocks.nextAuth.mockClear();
    mocks.nextAuth.mockImplementation((request, context) =>
      mocks.post(request, context),
    );
    mocks.logWarn.mockClear();
    mocks.consumeSharedRateLimit.mockReset();
    mocks.validateAuthCsrfToken.mockReturnValue(true);
    mocks.findExistingLoginEmail.mockReset();
    mocks.findExistingLoginEmail.mockResolvedValue("target@example.test");
    mocks.getProviderAvailability.mockReset();
    mocks.getProviderAvailability.mockResolvedValue({
      available: true,
      retryAfterSeconds: 0,
    });
    mocks.getSignupActivationAuthorization.mockReturnValue(null);
    const counts = new Map<string, number>();
    mocks.consumeSharedRateLimit.mockImplementation(
      ({ key, limit }: { key: string; limit: number }) => {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return Promise.resolve({
          allowed: count <= limit,
          remaining: Math.max(0, limit - count),
          retryAfterSeconds: 900,
        });
      },
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("constructs Auth.js inside the active CSRF request", async () => {
    expect(mocks.nextAuth).not.toHaveBeenCalled();
    const request = new NextRequest("https://example.test/api/auth/csrf");

    await expect(GET(request, routeContext)).resolves.toHaveProperty("status", 204);
    expect(mocks.nextAuth).toHaveBeenCalledWith(request, routeContext, {});
    expect(mocks.post).toHaveBeenCalledWith(request, routeContext);
  });

  it("limits repeated email sign-in attempts per client", async () => {
    const makeRequest = () =>
      new NextRequest("https://example.test/api/auth/signin/email", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.20",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: `email=user-${crypto.randomUUID()}%40example.test`,
      });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await POST(makeRequest(), routeContext)).status).toBe(200);
    }

    const blocked = await POST(makeRequest(), routeContext);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(mocks.post).toHaveBeenCalledTimes(5);
    expect(mocks.logWarn).toHaveBeenCalledWith(
      { retryAfterSeconds: expect.any(Number) },
      "email sign-in rate limit exceeded",
    );
  });

  it("limits one email even when the forwarded client address changes", async () => {
    const makeRequest = (attempt: number) =>
      new NextRequest("https://example.test/api/auth/signin/email", {
        method: "POST",
        headers: {
          "cf-connecting-ip": `203.0.113.${100 + attempt}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "email=target%40example.test",
      });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect((await POST(makeRequest(attempt), routeContext)).status).toBe(200);
    }

    expect((await POST(makeRequest(4), routeContext)).status).toBe(429);
  });

  it("does not consume an email bucket after the client is blocked", async () => {
    mocks.consumeSharedRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 900,
    });
    const request = new NextRequest("https://example.test/api/auth/signin/email", {
      method: "POST",
      headers: {
        "cf-connecting-ip": "203.0.113.30",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "email=target%40example.test",
    });

    expect((await POST(request, routeContext)).status).toBe(429);
    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledOnce();
    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "auth:email:client:203.0.113.30" }),
    );
  });

  it("does not rate limit other Auth.js POST endpoints", async () => {
    const request = new NextRequest(
      "https://example.test/api/auth/callback/email",
      { method: "POST", headers: { "cf-connecting-ip": "203.0.113.21" } },
    );

    expect((await POST(request, routeContext)).status).toBe(204);
    expect(mocks.post).toHaveBeenCalledOnce();
  });

  it("rejects direct signup provider callbacks without delegation", async () => {
    const request = new NextRequest(
      "https://example.test/api/auth/callback/signup?token=raw&email=pending%40example.test",
    );
    const context = {
      params: Promise.resolve({ nextauth: ["callback", "signup"] }),
    };

    const response = await GET(request, context);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://example.test/signup?state=invalid_link",
    );
    expect(mocks.nextAuth).not.toHaveBeenCalled();
  });

  it("delegates signup callbacks only inside activation authorization", async () => {
    mocks.getSignupActivationAuthorization.mockReturnValue({
      identifier: "pending@example.test",
      token: "hashed-token",
    });
    const request = new NextRequest(
      "https://example.test/api/auth/callback/signup?token=raw&email=pending%40example.test",
    );
    const context = {
      params: Promise.resolve({ nextauth: ["callback", "signup"] }),
    };

    await expect(GET(request, context)).resolves.toHaveProperty("status", 204);
    expect(mocks.nextAuth).toHaveBeenCalledOnce();
  });

  it("rejects direct signup-provider sign-in initiation", async () => {
    const request = new NextRequest("https://example.test/api/auth/signin/signup", {
      method: "POST",
    });
    const context = {
      params: Promise.resolve({ nextauth: ["signin", "signup"] }),
    };

    const response = await POST(request, context);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/signup?state=invalid_link");
    expect(mocks.nextAuth).not.toHaveBeenCalled();
  });

  it("rejects invalid CSRF after charging only the client bucket", async () => {
    mocks.validateAuthCsrfToken.mockReturnValue(false);
    const request = new NextRequest("https://example.test/api/auth/signin/email", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=target%40example.test&csrfToken=invalid",
    });

    const response = await POST(request, routeContext);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ status: "invalid_request" });
    expect(mocks.consumeSharedRateLimit).toHaveBeenCalledOnce();
    expect(mocks.findExistingLoginEmail).not.toHaveBeenCalled();
  });

  it("returns the canonical response without delegation for an unknown email", async () => {
    mocks.findExistingLoginEmail.mockResolvedValue(null);
    const request = new NextRequest("https://example.test/api/auth/signin/email", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=unknown%40example.test&csrfToken=csrf&callbackUrl=%2F&json=true",
    });

    const response = await POST(request, routeContext);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("returns shared provider unavailability before account lookup", async () => {
    mocks.getProviderAvailability.mockResolvedValue({
      available: false,
      retryAfterSeconds: 42,
    });
    const request = new NextRequest("https://example.test/api/auth/signin/email", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=target%40example.test&csrfToken=csrf",
    });

    const response = await POST(request, routeContext);
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("42");
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    expect(mocks.findExistingLoginEmail).not.toHaveBeenCalled();
  });

  it("logs only approved operational fields without request, account, or delivery data", async () => {
    mocks.getProviderAvailability.mockResolvedValue({
      available: false,
      retryAfterSeconds: 42,
    });
    const smtpCredentialFixture = ["smtp", "credential", "fixture"].join("-");
    const sensitiveValues = [
      "private@example.test",
      "raw-token-value",
      "hashed-token-value",
      "https://example.test/api/auth/callback/email?token=raw-token-value",
      "next-auth.session-token=session-secret",
      smtpCredentialFixture,
      "account-id-123",
      "user-id-456",
      "recipient_delivery_succeeded",
      "recipient_delivery_failed",
    ];
    const request = new NextRequest("https://example.test/api/auth/signin/email", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: sensitiveValues[4],
      },
      body: `email=${encodeURIComponent(sensitiveValues[0])}&csrfToken=${sensitiveValues[1]}`,
    });

    await POST(request, routeContext);
    const serializedLogs = JSON.stringify(mocks.logWarn.mock.calls);
    for (const sensitiveValue of sensitiveValues) {
      expect(serializedLogs).not.toContain(sensitiveValue);
    }
    for (const [payload] of mocks.logWarn.mock.calls) {
      expect(Object.keys(payload as Record<string, unknown>)).toEqual([
        "retryAfterSeconds",
      ]);
    }
  });
});