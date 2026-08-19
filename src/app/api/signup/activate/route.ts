import { NextRequest } from "next/server";

import { UserStatus, VerificationPurpose } from "@/generated/prisma/client";

import { GET as authGet } from "@/app/api/auth/[...nextauth]/route";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hashSignupToken } from "@/modules/signup/token";
import type { SignupLocale } from "@/modules/signup/types";
import { runWithSignupActivation } from "@/modules/signup/verification-context";

const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function localizedPath(path: string, locale: SignupLocale) {
  if (locale === "en") return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function isSignupLocale(value: unknown): value is SignupLocale {
  return value === "en" || value === "es" || value === "ca";
}

function stateRedirect(
  origin: string,
  locale: SignupLocale,
  state: "invalid_link" | "session_conflict" | "session_failed",
) {
  const target = new URL(localizedPath("/signup", locale), origin);
  target.searchParams.set("state", state);
  return Response.redirect(target, 302);
}

function externalRequestOrigin(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim() ||
    request.nextUrl.host;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    request.nextUrl.protocol.slice(0, -1);
  return `${protocol.toLowerCase()}://${host.toLowerCase()}`;
}

async function getCurrentSessionUserId(request: NextRequest, origin: string) {
  const sessionRequest = new NextRequest(new URL("/api/auth/session", origin), {
    method: "GET",
    headers: request.headers,
  });
  const response = await authGet(sessionRequest, {
    params: Promise.resolve({ nextauth: ["session"] }),
  });
  if (!response.ok) return null;
  const session = (await response.json().catch(() => null)) as
    | { user?: { id?: unknown } }
    | null;
  return typeof session?.user?.id === "string" ? session.user.id : null;
}

export async function GET(request: NextRequest) {
  const env = getEnv();
  const canonical = new URL(env.NEXTAUTH_URL);
  if (externalRequestOrigin(request) !== canonical.origin.toLowerCase()) {
    return Response.json({ status: "misdirected_request" }, { status: 421 });
  }

  const rawToken = request.nextUrl.searchParams.get("token");
  if (!rawToken || !RAW_TOKEN_PATTERN.test(rawToken)) {
    return stateRedirect(canonical.origin, "en", "invalid_link");
  }

  const tokenHash = hashSignupToken(rawToken, env.AUTH_SECRET);
  const storedToken = await db.verificationToken.findUnique({
    where: { token: tokenHash },
  });
  const storedLocale = storedToken?.locale;
  const locale: SignupLocale = isSignupLocale(storedLocale) ? storedLocale : "en";
  if (
    !storedToken ||
    storedToken.purpose !== VerificationPurpose.SIGNUP ||
    storedToken.expires.getTime() <= Date.now()
  ) {
    return stateRedirect(canonical.origin, locale, "invalid_link");
  }

  const targetUser = await db.user.findUnique({
    where: { normalizedEmail: storedToken.identifier },
    select: { id: true, status: true },
  });
  if (!targetUser || targetUser.status !== UserStatus.PENDING) {
    return stateRedirect(canonical.origin, locale, "invalid_link");
  }

  const currentUserId = await getCurrentSessionUserId(
    request,
    canonical.origin,
  );
  if (currentUserId && currentUserId !== targetUser.id) {
    return stateRedirect(canonical.origin, locale, "session_conflict");
  }

  const callbackUrl = localizedPath("/", locale);
  const delegatedUrl = new URL("/api/auth/callback/signup", canonical.origin);
  delegatedUrl.searchParams.set("token", rawToken);
  delegatedUrl.searchParams.set("email", storedToken.identifier);
  delegatedUrl.searchParams.set("callbackUrl", callbackUrl);
  const delegatedRequest = new NextRequest(delegatedUrl, {
    method: "GET",
    headers: request.headers,
  });
  const context = {
    params: Promise.resolve({ nextauth: ["callback", "signup"] }),
  };

  let authResponse: Response | null = null;
  try {
    authResponse = await runWithSignupActivation(
      { identifier: storedToken.identifier, token: tokenHash },
      () => authGet(delegatedRequest, context),
    );
  } catch {
    authResponse = null;
  }

  if (authResponse) {
    const location = authResponse.headers.get("location");
    if (location) {
      const destination = new URL(location, canonical.origin);
      if (
        destination.origin === canonical.origin &&
        destination.pathname === callbackUrl &&
        destination.search === "" &&
        destination.hash === ""
      ) {
        return authResponse;
      }
    }
  }

  const [remainingToken, activatedUser] = await Promise.all([
    db.verificationToken.findUnique({
      where: { token: tokenHash },
      select: { token: true },
    }),
    db.user.findUnique({
      where: { id: targetUser.id },
      select: { status: true },
    }),
  ]);
  if (!remainingToken && activatedUser?.status === UserStatus.ACTIVE) {
    return stateRedirect(canonical.origin, locale, "session_failed");
  }

  return stateRedirect(canonical.origin, locale, "invalid_link");
}