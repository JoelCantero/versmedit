import { NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import {
  getClientIdentifier,
  isCanonicalRequestOrigin,
} from "@/lib/request-context";
import {
  consumePersonalDataExportConfirmationClientLimit,
} from "@/modules/account/data-export/rate-limit";
import {
  getPersonalDataExportStatePath,
  parsePersonalDataExportCallback,
  personalDataExportLocaleSchema,
} from "@/modules/account/data-export/schema";
import { verifyPersonalDataExport } from "@/modules/account/data-export/service";
import type { PersonalDataExportVerificationResult } from "@/modules/account/data-export/types";
import { readAccountSessionToken } from "@/modules/account/session";
import type { AccountLocale } from "@/modules/account/types";

const ROUTE = "/api/account/data-export/verify";

function redirectToState(
  origin: string,
  locale: AccountLocale,
  state: "ready" | "invalid" | "rate_limited",
  retryAfter?: number,
) {
  const headers = new Headers({
    Location: new URL(
      getPersonalDataExportStatePath(locale, state, retryAfter),
      origin,
    ).toString(),
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  if (state === "rate_limited" && retryAfter !== undefined) {
    headers.set("Retry-After", String(retryAfter));
  }
  return new Response(null, { status: 302, headers });
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const env = getEnv();
  const canonical = new URL(env.NEXTAUTH_URL);
  const log = getRequestLogger(request, { route: ROUTE });

  function logOutcome(
    level: "info" | "warn",
    outcome:
      | "confirmation_completed"
      | "confirmation_rejected"
      | "confirmation_expired"
      | "confirmation_rate_limited",
  ) {
    log[level](
      { outcome, durationMs: Math.max(0, Date.now() - startedAt) },
      "personal data export confirmation completed",
    );
  }

  if (!isCanonicalRequestOrigin(request, canonical)) {
    logOutcome("warn", "confirmation_rejected");
    return Response.json(
      { status: "misdirected_request" },
      { status: 421, headers: { "Cache-Control": "no-store" } },
    );
  }

  const fallbackLocale =
    personalDataExportLocaleSchema.safeParse(
      request.nextUrl.searchParams.get("locale"),
    ).data ?? "en";
  const clientLimit = await consumePersonalDataExportConfirmationClientLimit(
    getClientIdentifier(request),
  );
  if (!clientLimit.allowed) {
    logOutcome("warn", "confirmation_rate_limited");
    return redirectToState(
      canonical.origin,
      fallbackLocale,
      "rate_limited",
      clientLimit.retryAfterSeconds,
    );
  }

  const callback = parsePersonalDataExportCallback(request.nextUrl.searchParams);
  if (!callback) {
    logOutcome("warn", "confirmation_rejected");
    return redirectToState(canonical.origin, fallbackLocale, "invalid");
  }

  const result: PersonalDataExportVerificationResult = await verifyPersonalDataExport({
    rawToken: callback.rawToken,
    sessionToken: readAccountSessionToken(request.headers.get("cookie")),
  }).catch(() => ({ status: "invalid" as const, locale: callback.locale }));
  logOutcome(
    result.status === "ready" ? "info" : "warn",
    result.status === "ready"
      ? "confirmation_completed"
      : result.status === "rate_limited"
        ? "confirmation_rate_limited"
        : result.auditOutcome ?? "confirmation_rejected",
  );
  return redirectToState(
    canonical.origin,
    result.locale,
    result.status,
    result.status === "rate_limited" ? result.retryAfter : undefined,
  );
}