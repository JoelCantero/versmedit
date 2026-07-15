// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRequestId,
  getClientIdentifier,
  getRequestId,
} from "@/lib/request-context";

describe("request context", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("keeps a valid incoming request id", () => {
    const request = new Request("https://example.test/api/health", {
      headers: { "x-request-id": "edge-01:request_42" },
    });

    expect(getRequestId(request)).toBe("edge-01:request_42");
  });

  it("replaces an invalid incoming request id", () => {
    const request = new Request("https://example.test/api/health", {
      headers: { "x-request-id": "contains spaces and is not trusted" },
    });

    expect(getRequestId(request)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("creates a fresh internal request id", () => {
    expect(createRequestId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("prefers the edge-provided client address", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const request = new Request("https://example.test/api/auth/signin/email", {
      headers: {
        "cf-connecting-ip": "203.0.113.10",
        "x-forwarded-for": "198.51.100.2, 10.0.0.2",
      },
    });

    expect(getClientIdentifier(request)).toBe("203.0.113.10");
  });

  it("accepts a valid IPv6 edge address", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const request = new Request("https://example.test/api/auth/signin/email", {
      headers: { "cf-connecting-ip": "2001:DB8::1" },
    });

    expect(getClientIdentifier(request)).toBe("2001:db8::1");
  });

  it("ignores spoofable forwarding headers outside the trusted proxy boundary", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    const request = new Request("https://example.test/api/auth/signin/email", {
      headers: { "cf-connecting-ip": "203.0.113.10" },
    });

    expect(getClientIdentifier(request)).toBe("untrusted-direct-client");
  });

  it("does not trust forwarded addresses when Cloudflare identity is absent", () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const request = new Request("https://example.test/api/auth/signin/email", {
      headers: {
        "x-forwarded-for": "198.51.100.2, 10.0.0.2",
        "x-real-ip": "198.51.100.3",
      },
    });

    expect(getClientIdentifier(request)).toBe("unknown-edge-client");
  });

  it.each(["attacker-controlled", ":", ":::", "2001:db8::1::2"])(
    "rejects malformed Cloudflare client address %s",
    (edgeAddress) => {
      vi.stubEnv("TRUST_PROXY_HEADERS", "true");
      const request = new Request("https://example.test/api/auth/signin/email", {
        headers: { "cf-connecting-ip": edgeAddress },
      });

      expect(getClientIdentifier(request)).toBe("unknown-edge-client");
    },
  );
});