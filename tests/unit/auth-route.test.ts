// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
  logWarn: vi.fn(),
  consumeSharedRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));
vi.mock("next-auth", () => ({
  default: () => mocks.post,
}));
vi.mock("@/lib/logger", () => ({
  getRequestLogger: () => ({ warn: mocks.logWarn }),
}));
vi.mock("@/lib/shared-rate-limit", () => ({
  consumeSharedRateLimit: mocks.consumeSharedRateLimit,
}));

import { POST } from "@/app/api/auth/[...nextauth]/route";

const routeContext = {
  params: Promise.resolve({ nextauth: ["signin", "email"] }),
};

describe("Auth.js route rate limiting", () => {
  beforeEach(() => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    mocks.post.mockClear();
    mocks.logWarn.mockClear();
    mocks.consumeSharedRateLimit.mockReset();
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
      expect((await POST(makeRequest(), routeContext)).status).toBe(204);
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
      expect((await POST(makeRequest(attempt), routeContext)).status).toBe(204);
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
});