import { NextRequest } from "next/server";

import { validateAuthCsrfToken } from "@/lib/auth-csrf";
import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import {
  getClientIdentifier,
  isCanonicalRequestOrigin,
} from "@/lib/request-context";
import {
  consumePersonalDataExportRequestClientLimit,
} from "@/modules/account/data-export/rate-limit";
import {
  getPersonalDataExportLoginPath,
  parsePersonalDataExportRequestBody,
  personalDataExportCommandSchema,
} from "@/modules/account/data-export/schema";
import { issuePersonalDataExport } from "@/modules/account/data-export/service";
import { readAccountSessionToken } from "@/modules/account/session";

const ROUTE = "/api/account/data-export/request";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function problem(
  status: string,
  httpStatus: number,
  extra: Record<string, string | number> = {},
  headers: HeadersInit = {},
) {
  return Response.json(
    { status, ...extra },
    { status: httpStatus, headers: { ...NO_STORE_HEADERS, ...headers } },
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const env = getEnv();
  const canonical = new URL(env.NEXTAUTH_URL);
  const log = getRequestLogger(request, { route: ROUTE });

  function logOutcome(
    level: "info" | "warn",
    outcome: "request_sent" | "request_failed" | "request_rate_limited",
  ) {
    log[level](
      { outcome, durationMs: Math.max(0, Date.now() - startedAt) },
      "personal data export request completed",
    );
  }

  if (!isCanonicalRequestOrigin(request, canonical)) {
    logOutcome("warn", "request_failed");
    return problem("forbidden", 403);
  }

  const clientLimit = await consumePersonalDataExportRequestClientLimit(
    getClientIdentifier(request),
  );
  if (!clientLimit.allowed) {
    logOutcome("warn", "request_rate_limited");
    return problem(
      "rate_limited",
      429,
      { retryAfter: clientLimit.retryAfterSeconds },
      { "Retry-After": String(clientLimit.retryAfterSeconds) },
    );
  }

  const parsed = personalDataExportCommandSchema.safeParse(
    parsePersonalDataExportRequestBody(await request.text().catch(() => "")),
  );
  if (!parsed.success) {
    logOutcome("warn", "request_failed");
    return problem("invalid_request", 400);
  }

  const cookieHeader = request.headers.get("cookie") ?? undefined;
  if (
    !validateAuthCsrfToken({
      bodyToken: parsed.data.csrfToken,
      cookieHeader,
      secret: env.AUTH_SECRET,
    })
  ) {
    logOutcome("warn", "request_failed");
    return problem("forbidden", 403);
  }

  const sessionToken = readAccountSessionToken(cookieHeader);
  if (!sessionToken) {
    logOutcome("warn", "request_failed");
    return problem("unauthenticated", 401, {
      redirectTo: getPersonalDataExportLoginPath(parsed.data.locale),
    });
  }
  if (!env.MAIL.enabled) {
    logOutcome("warn", "request_failed");
    return problem("unavailable", 503);
  }

  const result = await issuePersonalDataExport({
    sessionToken,
    locale: parsed.data.locale,
    origin: canonical.origin,
  }).catch(() => ({ status: "unavailable" as const }));

  if (result.status === "sent") {
    logOutcome("info", "request_sent");
    return Response.json(result, { status: 202, headers: NO_STORE_HEADERS });
  }
  if (result.status === "rate_limited") {
    const retryAfter = result.retryAfter ?? 1;
    logOutcome("warn", "request_rate_limited");
    return problem(
      "rate_limited",
      429,
      { retryAfter },
      { "Retry-After": String(retryAfter) },
    );
  }
  if (result.status === "unauthenticated") {
    logOutcome("warn", "request_failed");
    return problem("unauthenticated", 401, {
      redirectTo: getPersonalDataExportLoginPath(parsed.data.locale),
    });
  }
  logOutcome("warn", "request_failed");
  return problem("unavailable", 503);
}