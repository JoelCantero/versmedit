import { NextRequest } from "next/server";

import { UserStatus, VerificationPurpose } from "@/generated/prisma/client";

import { GET as authGet } from "@/app/api/auth/[...nextauth]/route";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { isCanonicalRequestOrigin } from "@/lib/request-context";
import {
  getAccountDataPath,
  getAccountDeletionIntentPath,
} from "@/modules/account/deletion/schema";
import { hashAccountDeletionToken } from "@/modules/account/deletion/token";
import { runWithAccountDeletionVerification } from "@/modules/account/deletion/verification-context";
import type { AccountLocale } from "@/modules/account/types";

const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function isAccountLocale(value: unknown): value is AccountLocale {
  return value === "en" || value === "es" || value === "ca";
}

function stateRedirect(
  origin: string,
  locale: AccountLocale,
  state: "invalid_link" | "session_conflict",
) {
  const target = new URL(getAccountDataPath(locale), origin);
  target.searchParams.set("state", state);
  return Response.redirect(target, 302);
}

async function getCurrentSessionUserId(request: NextRequest, origin: string) {
  const response = await authGet(
    new NextRequest(new URL("/api/auth/session", origin), {
      method: "GET",
      headers: request.headers,
    }),
    { params: Promise.resolve({ nextauth: ["session"] }) },
  );
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

  const tokenHash = hashAccountDeletionToken(rawToken, env.AUTH_SECRET);
  const storedToken = await db.verificationToken.findUnique({
    where: { token: tokenHash },
  });
  const locale: AccountLocale = isAccountLocale(storedToken?.locale)
    ? storedToken.locale
    : "en";
  if (
    !storedToken ||
    storedToken.purpose !== VerificationPurpose.ACCOUNT_DELETION ||
    !storedToken.deliveredAt ||
    storedToken.expires.getTime() <= Date.now()
  ) {
    return stateRedirect(canonical.origin, locale, "invalid_link");
  }

  const targetUser = await db.user.findUnique({
    where: { normalizedEmail: storedToken.identifier },
    select: { id: true, status: true },
  });
  if (!targetUser || targetUser.status !== UserStatus.ACTIVE) {
    return stateRedirect(canonical.origin, locale, "invalid_link");
  }

  const currentUserId = await getCurrentSessionUserId(request, canonical.origin);
  if (currentUserId && currentUserId !== targetUser.id) {
    return stateRedirect(canonical.origin, locale, "session_conflict");
  }

  const callbackUrl = getAccountDeletionIntentPath(locale);
  const delegatedUrl = new URL(
    "/api/auth/callback/account-deletion",
    canonical.origin,
  );
  delegatedUrl.searchParams.set("token", rawToken);
  delegatedUrl.searchParams.set("email", storedToken.identifier);
  delegatedUrl.searchParams.set("callbackUrl", callbackUrl);
  const delegatedRequest = new NextRequest(delegatedUrl, {
    method: "GET",
    headers: request.headers,
  });

  let authResponse: Response | null = null;
  try {
    authResponse = await runWithAccountDeletionVerification(
      { identifier: storedToken.identifier, token: tokenHash },
      () =>
        authGet(delegatedRequest, {
          params: Promise.resolve({
            nextauth: ["callback", "account-deletion"],
          }),
        }),
    );
  } catch {
    authResponse = null;
  }

  const location = authResponse?.headers.get("location");
  if (authResponse && location) {
    const destination = new URL(location, canonical.origin);
    const expected = new URL(callbackUrl, canonical.origin);
    if (
      destination.origin === expected.origin &&
      destination.pathname === expected.pathname &&
      destination.search === expected.search &&
      destination.hash === ""
    ) {
      return authResponse;
    }
  }

  return stateRedirect(canonical.origin, locale, "invalid_link");
}