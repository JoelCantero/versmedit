// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const intlMiddlewareMock = vi.hoisted(() =>
  vi.fn(() => new Response(null, { status: 200 })),
);

vi.mock("next-intl/middleware", () => ({
  default: () => intlMiddlewareMock,
}));

import proxy, { contentSecurityPolicy, createNonce } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  intlMiddlewareMock.mockClear();
});

describe("proxy security boundary", () => {
  it("builds a production CSP with a nonce and no unsafe inline scripts", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
    const policy = contentSecurityPolicy("nonce-value");

    expect(policy).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'");
    expect(policy).toContain("img-src 'self' data: blob: https:");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(policy).not.toContain("'unsafe-eval'");
  });

  it("does not upgrade requests for an HTTP production origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_URL", "http://127.0.0.1:3100");

    expect(contentSecurityPolicy("nonce-value")).not.toContain(
      "upgrade-insecure-requests",
    );
  });

  it("creates a unique nonce", () => {
    expect(createNonce()).not.toBe(createNonce());
  });

  it("replaces a client request id and adds CSP to API responses", () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = proxy(
      new NextRequest("https://example.test/api/health", {
        headers: { "x-request-id": "client-controlled" },
      }),
    );

    expect(response.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(response.headers.get("x-request-id")).not.toBe("client-controlled");
    expect(response.headers.get("content-security-policy")).toContain(
      "'strict-dynamic'",
    );
  });

  it("rejects an Auth request whose forwarded host is not canonical", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const response = proxy(
      new NextRequest("https://app.example.test/api/auth/csrf", {
        headers: { "x-forwarded-host": "attacker.example" },
      }),
    );

    expect(response.status).toBe(421);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });

  it.each([
    "/api/account/deletion",
    "/api/account/deletion/reauthenticate",
    "/api/account/deletion/verify?token=fixture",
  ])("rejects a deletion request to a non-canonical forwarded host for %s", (path) => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const response = proxy(
      new NextRequest(`https://app.example.test${path}`, {
        headers: { "x-forwarded-host": "attacker.example" },
      }),
    );

    expect(response.status).toBe(421);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("content-security-policy")).toBeTruthy();
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });

  it.each([
    "/api/account/security/reauthenticate",
    "/api/account/security/sessions/revoke",
    "/api/account/security/sessions/revoke-others",
  ])(
    "rejects an account-security mutation to a non-canonical effective host for %s",
    (path) => {
      vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
      vi.stubEnv("TRUST_PROXY_HEADERS", "true");
      const response = proxy(
        new NextRequest(`https://app.example.test${path}`, {
          method: "POST",
          headers: {
            origin: "https://app.example.test",
            "x-forwarded-host": "attacker.example",
          },
        }),
      );

      expect(response.status).toBe(421);
      expect(response.headers.get("x-request-id")).toBeTruthy();
      expect(intlMiddlewareMock).not.toHaveBeenCalled();
    },
  );

  it("accepts a canonical top-level security callback without Origin", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const response = proxy(
      new NextRequest(
        `http://internal:3000/api/account/security/verify?token=${"a".repeat(43)}`,
        {
          headers: {
            "cf-visitor": '{"scheme":"https"}',
            "x-forwarded-host": "app.example.test",
          },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });

  it("rejects a top-level security callback with a mismatched effective URL", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const response = proxy(
      new NextRequest(
        `https://app.example.test/api/account/security/verify?token=${"a".repeat(43)}`,
        { headers: { "x-forwarded-host": "attacker.example" } },
      ),
    );

    expect(response.status).toBe(421);
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });

  it.each([
    "/api/account/data-export/request",
    "/api/account/data-export/verify",
    "/api/account/data-export/download",
  ])("rejects personal data export route %s at a mismatched effective URL", (path) => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    const response = proxy(
      new NextRequest(`https://app.example.test${path}`, {
        headers: { "x-forwarded-host": "attacker.example" },
      }),
    );

    expect(response.status).toBe(421);
    expect(intlMiddlewareMock).not.toHaveBeenCalled();
  });

  it("returns a controlled error when canonical Auth configuration is invalid", () => {
    vi.stubEnv("NEXTAUTH_URL", "not-a-url");
    const response = proxy(
      new NextRequest("https://app.example.test/api/auth/csrf"),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("accepts a canonical Auth host with equivalent case and HTTPS port", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const response = proxy(
      new NextRequest("https://app.example.test/api/auth/csrf", {
        headers: { "x-forwarded-host": "APP.EXAMPLE.TEST:443" },
      }),
    );

    expect(response.status).toBe(200);
  });

  it.each([
    "evil@app.example.test",
    "app.example.test/path",
    "app.example.test?query",
    "app.example.test#fragment",
    "app.example.test,attacker.example",
    "app.example.test:99999",
  ])("rejects malformed forwarded host %s", (forwardedHost) => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const response = proxy(
      new NextRequest("https://app.example.test/api/auth/csrf", {
        headers: { "x-forwarded-host": forwardedHost },
      }),
    );

    expect(response.status).toBe(421);
  });

  it("ignores forwarded hosts when the proxy boundary is not trusted", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://app.example.test");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    const response = proxy(
      new NextRequest("https://app.example.test/api/auth/csrf", {
        headers: {
          host: "app.example.test",
          "x-forwarded-host": "attacker.example",
        },
      }),
    );

    expect(response.status).toBe(200);
  });

  it("does not run locale routing twice for an internal rewrite", () => {
    const response = proxy(
      new NextRequest("https://example.test/en", {
        headers: { "x-next-intl-locale": "en" },
      }),
    );

    expect(intlMiddlewareMock).not.toHaveBeenCalled();
    expect(response.headers.get("x-request-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("still delegates an external localized route to next-intl", () => {
    proxy(new NextRequest("https://example.test/en"));

    expect(intlMiddlewareMock).toHaveBeenCalledOnce();
  });
});