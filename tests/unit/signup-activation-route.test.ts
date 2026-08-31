// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  authGet: vi.fn(),
  currentSession: null as null | { user: { id: string } },
  preflightSignupActivation: vi.fn(),
  evaluateSignupActivationSession: vi.fn(),
  resolveSignupActivationFailure: vi.fn(),
  runWithSignupActivation: vi.fn(
    (_authorization: unknown, callback: () => Promise<Response>) => callback(),
  ),
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    AUTH_SECRET: "test-auth-secret",
    NEXTAUTH_URL: "https://app.example.test",
  }),
}));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ GET: mocks.authGet }));
vi.mock("@/modules/signup/service", () => ({
  preflightSignupActivation: mocks.preflightSignupActivation,
  evaluateSignupActivationSession: mocks.evaluateSignupActivationSession,
  resolveSignupActivationFailure: mocks.resolveSignupActivationFailure,
}));
vi.mock("@/modules/signup/verification-context", () => ({
  runWithSignupActivation: mocks.runWithSignupActivation,
}));

import { GET } from "@/app/api/signup/activate/route";

const rawToken = "a".repeat(43);
const candidate = {
  userId: "pending-user",
  identifier: "pending@example.test",
  tokenHash: "hashed-token",
  locale: "es" as const,
};

function request(query = `token=${rawToken}`, headers?: HeadersInit) {
  return new NextRequest(
    `https://app.example.test/api/signup/activate?${query}`,
    { headers },
  );
}

describe("GET /api/signup/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    mocks.preflightSignupActivation.mockResolvedValue({
      status: "eligible_candidate",
      candidate,
    });
    mocks.evaluateSignupActivationSession.mockReturnValue({
      status: "eligible",
      candidate,
    });
    mocks.resolveSignupActivationFailure.mockResolvedValue({
      status: "invalid_link",
      locale: candidate.locale,
    });
    mocks.currentSession = null;
    mocks.authGet.mockImplementation((delegatedRequest: NextRequest) => {
      if (delegatedRequest.nextUrl.pathname === "/api/auth/session") {
        return Promise.resolve(Response.json(mocks.currentSession));
      }
      return Promise.resolve(
        new Response(null, {
          status: 302,
          headers: {
            location: "https://app.example.test/es",
            "set-cookie": "__Secure-next-auth.session-token=session; Path=/; HttpOnly; Secure",
          },
        }),
      );
    });
  });

  it.each(["", "token=short", "token=%25invalid"])(
    "maps malformed activation query %s to the generic invalid state",
    async (query) => {
      const response = await GET(request(query));
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        "https://app.example.test/signup?state=invalid_link",
      );
      expect(mocks.preflightSignupActivation).not.toHaveBeenCalled();
    },
  );

  it("rejects a non-canonical request host", async () => {
    const response = await GET(
      new NextRequest(
        `https://evil.example.test/api/signup/activate?token=${rawToken}`,
      ),
    );
    expect(response.status).toBe(421);
    expect(mocks.preflightSignupActivation).not.toHaveBeenCalled();
  });

  it("ignores spoofed forwarded origin headers when proxy trust is disabled", async () => {
    const response = await GET(
      new NextRequest(
        `http://evil.example.test/api/signup/activate?token=${rawToken}`,
        {
          headers: {
            "x-forwarded-host": "app.example.test",
            "x-forwarded-proto": "https",
          },
        },
      ),
    );

    expect(response.status).toBe(421);
  expect(mocks.preflightSignupActivation).not.toHaveBeenCalled();
  });

  it("accepts canonical forwarded origin headers only from the trusted proxy", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    const response = await GET(
      new NextRequest(
        `http://app:3000/api/signup/activate?token=${rawToken}`,
        {
          headers: {
            "x-forwarded-host": "app.example.test",
            "x-forwarded-proto": "https",
          },
        },
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example.test/es");
  });

  it.each(["en", "ca"] as const)(
    "maps an invalid preflight to the %s localized result without Auth.js",
    async (locale) => {
      mocks.preflightSignupActivation.mockResolvedValue({
        status: "invalid_link",
        locale,
      });

      const response = await GET(request());

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        locale === "en"
          ? "https://app.example.test/signup?state=invalid_link"
          : "https://app.example.test/ca/signup?state=invalid_link",
      );
      expect(mocks.authGet).not.toHaveBeenCalled();
      expect(mocks.evaluateSignupActivationSession).not.toHaveBeenCalled();
    },
  );

  it("preserves a different session without consuming or delegating", async () => {
    mocks.currentSession = { user: { id: "other-user" } };
    mocks.evaluateSignupActivationSession.mockReturnValue({
      status: "session_conflict",
      locale: candidate.locale,
    });

    const response = await GET(request());

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/signup?state=session_conflict",
    );
    expect(mocks.evaluateSignupActivationSession).toHaveBeenCalledWith(
      candidate,
      "other-user",
    );
    expect(
      mocks.authGet.mock.calls.some(
        ([delegatedRequest]) =>
          (delegatedRequest as NextRequest).nextUrl.pathname ===
          "/api/auth/callback/signup",
      ),
    ).toBe(false);
    expect(mocks.runWithSignupActivation).not.toHaveBeenCalled();
  });

  it("delegates a server-built safe localized callback to Auth.js", async () => {
    const response = await GET(
      request(`token=${rawToken}&callbackUrl=https://evil.example`, {
        "x-request-id": "activation-request",
      }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example.test/es");
    expect(response.headers.get("set-cookie")).toContain("next-auth.session-token");
    const delegatedRequest = mocks.authGet.mock.calls.find(
      ([candidate]) =>
        (candidate as NextRequest).nextUrl.pathname ===
        "/api/auth/callback/signup",
    )?.[0] as NextRequest;
    expect(delegatedRequest.nextUrl.pathname).toBe("/api/auth/callback/signup");
    expect(delegatedRequest.nextUrl.searchParams.get("token")).toBe(rawToken);
    expect(delegatedRequest.nextUrl.searchParams.get("email")).toBe(
      candidate.identifier,
    );
    expect(delegatedRequest.nextUrl.searchParams.get("callbackUrl")).toBe("/es");
    expect(delegatedRequest.nextUrl.searchParams.get("callbackUrl")).not.toContain("evil");
    expect(delegatedRequest.headers.get("x-request-id")).toBe(
      "activation-request",
    );
    expect(mocks.preflightSignupActivation).toHaveBeenCalledWith(rawToken);
    expect(mocks.evaluateSignupActivationSession).toHaveBeenCalledWith(
      candidate,
      null,
    );
    expect(mocks.runWithSignupActivation).toHaveBeenCalledWith(
      { identifier: candidate.identifier, token: candidate.tokenHash },
      expect.any(Function),
    );
  });

  it("maps post-activation session failure to durable localized login recovery", async () => {
    mocks.resolveSignupActivationFailure.mockResolvedValue({
      status: "session_failed",
      locale: candidate.locale,
    });
    mocks.authGet.mockImplementation((delegatedRequest: NextRequest) =>
      delegatedRequest.nextUrl.pathname === "/api/auth/session"
        ? Promise.resolve(Response.json(null))
        : Promise.resolve(
            new Response(null, {
              status: 302,
              headers: { location: "https://app.example.test/login/error" },
            }),
          ),
    );

    const response = await GET(request());

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/signup?state=session_failed",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.resolveSignupActivationFailure).toHaveBeenCalledWith(candidate);
  });

  it("maps a thrown Auth.js callback to the generic localized fallback", async () => {
    mocks.authGet.mockImplementation((delegatedRequest: NextRequest) =>
      delegatedRequest.nextUrl.pathname === "/api/auth/session"
        ? Promise.resolve(Response.json(null))
        : Promise.reject(new Error("provider failure")),
    );

    const response = await GET(request());

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/signup?state=invalid_link",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.resolveSignupActivationFailure).toHaveBeenCalledWith(candidate);
  });
});