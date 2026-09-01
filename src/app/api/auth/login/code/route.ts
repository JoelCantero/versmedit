import { NextRequest } from "next/server";

import { GET as authGet } from "@/app/api/auth/[...nextauth]/route";
import { validateAuthCsrfToken } from "@/lib/auth-csrf";
import {
  LOGIN_CODE_RATE_LIMIT,
  LOGIN_CODE_RATE_LIMIT_WINDOW_MS,
  getLoginCodeAddressRateLimitKey,
  getLoginCodeClientRateLimitKey,
} from "@/lib/auth-login-code-rate-limit";
import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import {
  getClientIdentifier,
  isCanonicalRequestOrigin,
} from "@/lib/request-context";
import { consumeSharedRateLimit } from "@/lib/shared-rate-limit";
import { hashLoginCode, loginCodeHashesMatch } from "@/modules/login/code-token";
import {
  parseLoginCallbackPath,
  parseLoginCode,
  parseLoginEmail,
  parseLoginLocale,
} from "@/modules/login/schema";
import {
  findLoginChallengeCodeHash,
  registerFailedLoginCodeAttempt,
  waitForAcceptedLogin,
} from "@/modules/login/service";
import { runWithLoginCodeAuthorization } from "@/modules/login/verification-context";
import { createSignupToken, hashSignupToken } from "@/modules/signup/token";

const ROUTE = "/api/auth/login/code";

const SESSION_COOKIE_PATTERN = /^(__Secure-)?next-auth\.session-token=/u;

function logOutcome(
  request: NextRequest,
  outcome: "accepted" | "rejected" | "throttled",
) {
  getRequestLogger(request, { route: ROUTE }).info(
    { outcome },
    "login code validation",
  );
}

async function rejected(request: NextRequest, startedAt: number) {
  await waitForAcceptedLogin({ startedAt });
  logOutcome(request, "rejected");
  return Response.json({ status: "invalid_code" }, { status: 400 });
}

function throttled(
  request: NextRequest,
  retryAfterSeconds: number,
) {
  logOutcome(request, "throttled");
  return Response.json(
    { status: "rate_limited", retryAfter: retryAfterSeconds },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

export async function POST(request: NextRequest) {
  const env = getEnv();
  if (!env.MAIL.enabled) {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }

  const canonical = new URL(env.NEXTAUTH_URL);
  if (!isCanonicalRequestOrigin(request, canonical)) {
    return Response.json({ status: "misdirected_request" }, { status: 421 });
  }

  const startedAt = Date.now();
  const clientResult = await consumeSharedRateLimit({
    key: getLoginCodeClientRateLimitKey(getClientIdentifier(request)),
    limit: LOGIN_CODE_RATE_LIMIT,
    windowMs: LOGIN_CODE_RATE_LIMIT_WINDOW_MS,
  });
  if (!clientResult.allowed) {
    return throttled(request, clientResult.retryAfterSeconds);
  }

  const formData = await request.formData().catch(() => null);
  const csrfToken = formData?.get("csrfToken");
  if (
    !validateAuthCsrfToken({
      bodyToken: typeof csrfToken === "string" ? csrfToken : undefined,
      cookieHeader: request.headers.get("cookie") ?? undefined,
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
    })
  ) {
    return Response.json({ status: "invalid_request" }, { status: 403 });
  }

  let normalizedEmail: string;
  let code: string;
  try {
    normalizedEmail = parseLoginEmail(formData?.get("email"));
    code = parseLoginCode(formData?.get("code"));
  } catch {
    return await rejected(request, startedAt);
  }

  const locale = (() => {
    try {
      return parseLoginLocale(formData?.get("locale"));
    } catch {
      return "en" as const;
    }
  })();
  const redirectTo = parseLoginCallbackPath(locale, formData?.get("callbackUrl"));

  const addressResult = await consumeSharedRateLimit({
    key: getLoginCodeAddressRateLimitKey(normalizedEmail),
    limit: LOGIN_CODE_RATE_LIMIT,
    windowMs: LOGIN_CODE_RATE_LIMIT_WINDOW_MS,
  });
  if (!addressResult.allowed) {
    return throttled(request, addressResult.retryAfterSeconds);
  }

  const storedCodeHash = await findLoginChallengeCodeHash(normalizedEmail);
  if (!storedCodeHash) {
    return await rejected(request, startedAt);
  }

  const submittedCodeHash = hashLoginCode({
    identifier: normalizedEmail,
    code,
    secret: env.AUTH_SECRET,
  });
  if (!loginCodeHashesMatch(storedCodeHash, submittedCodeHash)) {
    await registerFailedLoginCodeAttempt(normalizedEmail);
    return await rejected(request, startedAt);
  }

  // The delegated callback URL carries an opaque placeholder so the access code
  // never reaches a URL; the authorization below carries the real lookup key.
  const placeholder = createSignupToken().raw;
  const delegatedUrl = new URL("/api/auth/callback/email", canonical.origin);
  delegatedUrl.searchParams.set("token", placeholder);
  delegatedUrl.searchParams.set("email", normalizedEmail);
  delegatedUrl.searchParams.set("callbackUrl", redirectTo);

  let authResponse: Response | null = null;
  try {
    authResponse = await runWithLoginCodeAuthorization(
      {
        identifier: normalizedEmail,
        token: hashSignupToken(placeholder, env.AUTH_SECRET),
        codeHash: storedCodeHash,
      },
      () =>
        authGet(
          new NextRequest(delegatedUrl, {
            method: "GET",
            headers: request.headers,
          }),
          { params: Promise.resolve({ nextauth: ["callback", "email"] }) },
        ),
    );
  } catch {
    authResponse = null;
  }

  // Auth.js also sets non-session cookies on a failed callback, so only a real
  // session token proves the challenge was consumed.
  const sessionCookies = (authResponse?.headers.getSetCookie() ?? []).filter(
    (cookie) => SESSION_COOKIE_PATTERN.test(cookie),
  );
  if (sessionCookies.length === 0) {
    return await rejected(request, startedAt);
  }

  const accepted = Response.json({ status: "accepted", redirectTo });
  for (const cookie of sessionCookies) {
    accepted.headers.append("set-cookie", cookie);
  }
  await waitForAcceptedLogin({ startedAt });
  logOutcome(request, "accepted");
  return accepted;
}
