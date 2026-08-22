import { NextRequest } from "next/server";

import { validateAuthCsrfToken } from "@/lib/auth-csrf";
import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import {
  getClientIdentifier,
  isCanonicalRequestOrigin,
} from "@/lib/request-context";
import { consumeSharedRateLimit } from "@/lib/shared-rate-limit";
import { readAccountSessionToken } from "@/modules/account/session";
import {
  accountSecurityReauthenticationSchema,
  getAccountSecurityLoginPath,
  parseAccountSecurityRequestBody,
} from "@/modules/account/security/schema";
import { issueAccountSecurityReauthentication } from "@/modules/account/security/service";
import {
  ACCOUNT_SECURITY_REAUTHENTICATION_RATE_LIMITED_OUTCOME,
  ACCOUNT_SECURITY_REAUTHENTICATION_SENT_OUTCOME,
  ACCOUNT_SECURITY_REAUTHENTICATION_UNAVAILABLE_OUTCOME,
} from "@/modules/account/security/types";

const ROUTE = "/api/account/security/reauthenticate";
const RATE_LIMIT_WINDOW_MS = 15 * 60_000;
const LOG_MESSAGE = "account security reauthentication completed";

function rateLimited(retryAfter: number) {
  return Response.json(
    { status: "rate_limited", retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: NextRequest) {
  const env = getEnv();
  const canonical = new URL(env.NEXTAUTH_URL);
  const log = getRequestLogger(request, { route: ROUTE });

  if (!isCanonicalRequestOrigin(request, canonical)) {
    return Response.json({ status: "forbidden" }, { status: 403 });
  }

  const clientLimit = await consumeSharedRateLimit({
    key: `account:security:reauth:client:${getClientIdentifier(request)}`,
    limit: 5,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!clientLimit.allowed) {
    log.warn(
      { outcome: ACCOUNT_SECURITY_REAUTHENTICATION_RATE_LIMITED_OUTCOME },
      LOG_MESSAGE,
    );
    return rateLimited(clientLimit.retryAfterSeconds);
  }

  const source = await request.text().catch(() => "");
  const body = parseAccountSecurityRequestBody(source);
  const parsed = accountSecurityReauthenticationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ status: "invalid_request" }, { status: 400 });
  }

  const cookieHeader = request.headers.get("cookie") ?? undefined;
  if (
    !validateAuthCsrfToken({
      bodyToken: parsed.data.csrfToken,
      cookieHeader,
      secret: env.AUTH_SECRET,
    })
  ) {
    return Response.json({ status: "forbidden" }, { status: 403 });
  }

  const sessionToken = readAccountSessionToken(cookieHeader);
  if (!sessionToken) {
    return Response.json(
      {
        status: "unauthenticated",
        redirectTo: getAccountSecurityLoginPath(parsed.data.locale),
      },
      { status: 401 },
    );
  }

  if (!env.MAIL.enabled) {
    log.warn(
      { outcome: ACCOUNT_SECURITY_REAUTHENTICATION_UNAVAILABLE_OUTCOME },
      LOG_MESSAGE,
    );
    return Response.json({ status: "unavailable" }, { status: 503 });
  }

  const result = await issueAccountSecurityReauthentication({
    sessionToken,
    locale: parsed.data.locale,
    origin: canonical.origin,
  }).catch(() => ({ status: "unavailable" as const }));

  if (result.status === "sent") {
    log.info(
      { outcome: ACCOUNT_SECURITY_REAUTHENTICATION_SENT_OUTCOME },
      LOG_MESSAGE,
    );
    return Response.json({ status: "sent" }, { status: 202 });
  }
  if (result.status === "rate_limited") {
    log.warn(
      { outcome: ACCOUNT_SECURITY_REAUTHENTICATION_RATE_LIMITED_OUTCOME },
      LOG_MESSAGE,
    );
    return rateLimited(result.retryAfter);
  }
  if (result.status === "unauthenticated") {
    return Response.json(
      {
        status: "unauthenticated",
        redirectTo: getAccountSecurityLoginPath(parsed.data.locale),
      },
      { status: 401 },
    );
  }

  log.warn(
    { outcome: ACCOUNT_SECURITY_REAUTHENTICATION_UNAVAILABLE_OUTCOME },
    LOG_MESSAGE,
  );
  return Response.json({ status: "unavailable" }, { status: 503 });
}