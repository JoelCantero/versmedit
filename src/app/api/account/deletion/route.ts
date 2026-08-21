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
  accountDeletionCommandSchema,
  getAccountDeletionCompletionPath,
  getAccountDeletionLoginPath,
  parseAccountDeletionRequestBody,
} from "@/modules/account/deletion/schema";
import { deleteCurrentAccount } from "@/modules/account/deletion/service";
import {
  expireAccountSessionCookies,
  readAccountSessionToken,
} from "@/modules/account/deletion/session";

const ROUTE = "/api/account/deletion";
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
    key: `account:deletion:final:client:${getClientIdentifier(request)}`,
    limit: 5,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!clientLimit.allowed) {
    log.warn(
      {
        outcome: "delete_failed",
        durationMs: Math.max(0, Date.now() - startedAt),
        retryAfter: clientLimit.retryAfterSeconds,
      },
      "account deletion completed",
    );
    return rateLimited(clientLimit.retryAfterSeconds);
  }

  const source = await request.text().catch(() => "");
  const body = parseAccountDeletionRequestBody(source);
  const parsed = accountDeletionCommandSchema.safeParse(body);
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

  const result = await deleteCurrentAccount({ sessionToken });
  const durationMs = Math.max(0, Date.now() - startedAt);
  if (
    result.status === "completed" ||
    result.status === "concurrent_completed"
  ) {
    const response = Response.json({
      status: "completed",
      redirectTo: getAccountDeletionCompletionPath(parsed.data.locale),
    });
    for (const cookie of expireAccountSessionCookies()) {
      response.headers.append("Set-Cookie", cookie);
    }
    log.info(
      {
        outcome:
          result.status === "completed"
            ? "delete_completed"
            : "delete_concurrent_completed",
        durationMs,
      },
      "account deletion completed",
    );
    return response;
  }
  if (result.status === "reauthentication_required") {
    return Response.json(result, { status: 409 });
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

  log.warn({ outcome: "delete_failed", durationMs }, "account deletion completed");
  return Response.json({ status: "deletion_failed" }, { status: 500 });
}