// @vitest-environment node

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  tokenFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  authGet: vi.fn(),
  currentSession: null as null | { user: { id: string } },
  hashSignupToken: vi.fn(() => "hashed-token"),
  runWithSignupActivation: vi.fn(
    (_authorization: unknown, callback: () => Promise<Response>) => callback(),
  ),
}));

vi.mock("@/lib/db", () => ({
  db: {
    verificationToken: { findUnique: mocks.tokenFindUnique },
    user: { findUnique: mocks.userFindUnique },
  },
}));
vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    AUTH_SECRET: "test-auth-secret",
    NEXTAUTH_URL: "https://app.example.test",
  }),
}));
vi.mock("@/app/api/auth/[...nextauth]/route", () => ({ GET: mocks.authGet }));
vi.mock("@/modules/signup/token", () => ({
  hashSignupToken: mocks.hashSignupToken,
}));
vi.mock("@/modules/signup/verification-context", () => ({
  runWithSignupActivation: mocks.runWithSignupActivation,
}));

import { GET } from "@/app/api/signup/activate/route";

const currentToken = {
  identifier: "pending@example.test",
  token: "hashed-token",
  expires: new Date(Date.now() + 60_000),
  purpose: "SIGNUP",
  locale: "es",
  deliveredAt: new Date(),
};

function request(query = "token=abcdefghijklmnopqrstuvwxyzABCDEFGH012345678") {
  return new NextRequest(`https://app.example.test/api/signup/activate?${query}`);
}

describe("GET /api/signup/activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    mocks.hashSignupToken.mockReturnValue("hashed-token");
    mocks.tokenFindUnique.mockResolvedValue(currentToken);
    mocks.userFindUnique.mockResolvedValue({ id: "pending-user", status: "PENDING" });
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
      expect(mocks.tokenFindUnique).not.toHaveBeenCalled();
    },
  );

  it("rejects a non-canonical request host", async () => {
    const response = await GET(
      new NextRequest(
        "https://evil.example.test/api/signup/activate?token=abcdefghijklmnopqrstuvwxyzABCDEFGH012345678",
      ),
    );
    expect(response.status).toBe(421);
    expect(mocks.tokenFindUnique).not.toHaveBeenCalled();
  });

  it("ignores spoofed forwarded origin headers when proxy trust is disabled", async () => {
    const response = await GET(
      new NextRequest(
        "http://evil.example.test/api/signup/activate?token=abcdefghijklmnopqrstuvwxyzABCDEFGH012345678",
        {
          headers: {
            "x-forwarded-host": "app.example.test",
            "x-forwarded-proto": "https",
          },
        },
      ),
    );

    expect(response.status).toBe(421);
    expect(mocks.tokenFindUnique).not.toHaveBeenCalled();
  });

  it("accepts canonical forwarded origin headers only from the trusted proxy", async () => {
    vi.stubEnv("TRUST_PROXY_HEADERS", "true");

    const response = await GET(
      new NextRequest(
        "http://app:3000/api/signup/activate?token=abcdefghijklmnopqrstuvwxyzABCDEFGH012345678",
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

  it.each([
    { token: null, case: "missing" },
    {
      token: { ...currentToken, expires: new Date(Date.now() - 1) },
      case: "expired",
    },
    {
      token: { ...currentToken, purpose: "LOGIN" },
      case: "wrong purpose",
    },
    {
      token: { ...currentToken, deliveredAt: null },
      case: "delivery unconfirmed",
    },
  ])("maps $case token state to one localized invalid result", async ({ token }) => {
    mocks.tokenFindUnique.mockResolvedValue(token);
    const response = await GET(request());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/signup?state=invalid_link");
    expect(mocks.authGet).not.toHaveBeenCalled();
  });

  it("preserves a different session without consuming or delegating", async () => {
    mocks.currentSession = { user: { id: "other-user" } };
    const response = await GET(request());

    expect(response.headers.get("location")).toBe(
      "https://app.example.test/es/signup?state=session_conflict",
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
    const response = await GET(request("token=abcdefghijklmnopqrstuvwxyzABCDEFGH012345678&callbackUrl=https://evil.example"));

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://app.example.test/es");
    expect(response.headers.get("set-cookie")).toContain("next-auth.session-token");
    const delegatedRequest = mocks.authGet.mock.calls.find(
      ([candidate]) =>
        (candidate as NextRequest).nextUrl.pathname ===
        "/api/auth/callback/signup",
    )?.[0] as NextRequest;
    expect(delegatedRequest.nextUrl.pathname).toBe("/api/auth/callback/signup");
    expect(delegatedRequest.nextUrl.searchParams.get("callbackUrl")).toBe("/es");
    expect(delegatedRequest.nextUrl.searchParams.get("callbackUrl")).not.toContain("evil");
  });

  it("maps post-activation session failure to durable localized login recovery", async () => {
    mocks.tokenFindUnique
      .mockResolvedValueOnce(currentToken)
      .mockResolvedValueOnce(null);
    mocks.userFindUnique
      .mockResolvedValueOnce({ id: "pending-user", status: "PENDING" })
      .mockResolvedValueOnce({ id: "pending-user", status: "ACTIVE" });
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
  });
});