import { NextRequest } from "next/server";

import { GET as authGet } from "@/app/api/auth/[...nextauth]/route";
import { getEnv } from "@/lib/env";
import { isCanonicalRequestOrigin } from "@/lib/request-context";
import {
  evaluateSignupActivationSession,
  preflightSignupActivation,
  resolveSignupActivationFailure,
} from "@/modules/signup/service";
import type { SignupLocale } from "@/modules/signup/types";
import { runWithSignupActivation } from "@/modules/signup/verification-context";

const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function localizedPath(path: string, locale: SignupLocale) {
  if (locale === "en") return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
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
  if (!isCanonicalRequestOrigin(request, canonical)) {
    return Response.json({ status: "misdirected_request" }, { status: 421 });
  }

  const rawToken = request.nextUrl.searchParams.get("token");
  if (!rawToken || !RAW_TOKEN_PATTERN.test(rawToken)) {
    return stateRedirect(canonical.origin, "en", "invalid_link");
  }

  const preflight = await preflightSignupActivation(rawToken);
  if (preflight.status === "invalid_link") {
    return stateRedirect(canonical.origin, preflight.locale, "invalid_link");
  }

  const currentUserId = await getCurrentSessionUserId(
    request,
    canonical.origin,
  );
  const sessionResult = evaluateSignupActivationSession(
    preflight.candidate,
    currentUserId,
  );
  if (sessionResult.status === "session_conflict") {
    return stateRedirect(
      canonical.origin,
      sessionResult.locale,
      "session_conflict",
    );
  }

  const { candidate } = sessionResult;
  const callbackUrl = localizedPath("/", candidate.locale);
  const delegatedUrl = new URL("/api/auth/callback/signup", canonical.origin);
  delegatedUrl.searchParams.set("token", rawToken);
  delegatedUrl.searchParams.set("email", candidate.identifier);
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
      { identifier: candidate.identifier, token: candidate.tokenHash },
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

  const failure = await resolveSignupActivationFailure(candidate);
  return stateRedirect(canonical.origin, failure.locale, failure.status);
}