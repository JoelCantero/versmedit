import { NextRequest } from "next/server";

import { validateAuthCsrfToken } from "@/lib/auth-csrf";
import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import {
  getClientIdentifier,
  isCanonicalRequestOrigin,
} from "@/lib/request-context";
import { consumeSharedRateLimit } from "@/lib/shared-rate-limit";
import {
  accountDeletionReauthenticationSchema,
  getAccountDeletionLoginPath,
  parseAccountDeletionRequestBody,
} from "@/modules/account/deletion/schema";
import { issueAccountDeletionReauthentication } from "@/modules/account/deletion/service";
import { readAccountSessionToken } from "@/modules/account/deletion/session";

const ROUTE = "/api/account/deletion/reauthenticate";
const RATE_LIMIT_WINDOW_MS = 15 * 60_000;

function rateLimited(retryAfter: number) {
  return Response.json(
    { status: "rate_limited", retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const env = getEnv();
  const canonical = new URL(env.NEXTAUTH_URL);
  const log = getRequestLogger(request, { route: ROUTE });

  if (!isCanonicalRequestOrigin(request, canonical)) {
    return Response.json({ status: "forbidden" }, { status: 403 });
  }

  const clientLimit = await consumeSharedRateLimit({
    key: `account:deletion:reauth:client:${getClientIdentifier(request)}`,
    limit: 5,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!clientLimit.allowed) {
    log.warn(
      {
        outcome: "reauth_failed",
        durationMs: Math.max(0, Date.now() - startedAt),
        retryAfter: clientLimit.retryAfterSeconds,
      },
      "account deletion reauthentication completed",
    );
    return rateLimited(clientLimit.retryAfterSeconds);
  }

  const source = await request.text().catch(() => "");
  const body = parseAccountDeletionRequestBody(source);
  const parsed = accountDeletionReauthenticationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ status: "invalid_request" }, { status: 400 });
  }
  if (
    !validateAuthCsrfToken({
      bodyToken: parsed.data.csrfToken,
      cookieHeader: request.headers.get("cookie") ?? undefined,
      secret: env.AUTH_SECRET,
    })
  ) {
    return Response.json({ status: "forbidden" }, { status: 403 });
  }

  const sessionToken = readAccountSessionToken(request.headers.get("cookie"));
  if (!sessionToken) {
    return Response.json(
      {
        status: "unauthenticated",
        redirectTo: getAccountDeletionLoginPath(parsed.data.locale),
      },
      { status: 401 },
    );
  }
  if (!env.MAIL.enabled) {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }

  const result = await issueAccountDeletionReauthentication({
    sessionToken,
    locale: parsed.data.locale,
    origin: canonical.origin,
  });
  const durationMs = Math.max(0, Date.now() - startedAt);
  if (result.status === "sent") {
    log.info({ outcome: "reauth_sent", durationMs }, "account deletion reauthentication completed");
    return Response.json(result, { status: 202 });
  }
  if (result.status === "rate_limited") {
    log.warn(
      { outcome: "reauth_failed", durationMs, retryAfter: result.retryAfter },
      "account deletion reauthentication completed",
    );
    return rateLimited(result.retryAfter ?? 1);
  }
  if (result.status === "unauthenticated") {
    return Response.json(
      {
        status: "unauthenticated",
        redirectTo: getAccountDeletionLoginPath(parsed.data.locale),
      },
      { status: 401 },
    );
  }

  log.warn({ outcome: "reauth_failed", durationMs }, "account deletion reauthentication completed");
  return Response.json({ status: "unavailable" }, { status: 503 });
}