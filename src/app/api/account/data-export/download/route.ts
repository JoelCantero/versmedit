import { NextRequest } from "next/server";

import { validateAuthCsrfToken } from "@/lib/auth-csrf";
import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import { isCanonicalRequestOrigin } from "@/lib/request-context";
import { personalDataExportRegistry } from "@/modules/account/data-export/composition";
import {
  getPersonalDataExportLoginPath,
  parsePersonalDataExportRequestBody,
  personalDataExportCommandSchema,
} from "@/modules/account/data-export/schema";
import { generatePersonalDataExport } from "@/modules/account/data-export/service";
import type { PersonalDataExportGenerationResult } from "@/modules/account/data-export/types";
import { readAccountSessionToken } from "@/modules/account/session";

const ROUTE = "/api/account/data-export/download";
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

function getExportFilename(generatedAt: string) {
  const timestamp = new Date(generatedAt)
    .toISOString()
    .slice(0, 19)
    .replaceAll("-", "")
    .replaceAll(":", "");
  return `personal-data-export-${timestamp}Z.json`;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const env = getEnv();
  const canonical = new URL(env.NEXTAUTH_URL);
  const log = getRequestLogger(request, { route: ROUTE });

  function logOutcome(
    level: "info" | "warn",
    outcome:
      | "download_completed"
      | "generation_failed"
      | "generation_expired"
      | "generation_rate_limited"
      | "contributor_failed",
  ) {
    log[level](
      { outcome, durationMs: Math.max(0, Date.now() - startedAt) },
      "personal data export generation completed",
    );
  }

  if (!isCanonicalRequestOrigin(request, canonical)) {
    logOutcome("warn", "generation_failed");
    return problem("forbidden", 403);
  }

  const parsed = personalDataExportCommandSchema.safeParse(
    parsePersonalDataExportRequestBody(await request.text().catch(() => "")),
  );
  if (!parsed.success) {
    logOutcome("warn", "generation_failed");
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
    logOutcome("warn", "generation_failed");
    return problem("forbidden", 403);
  }

  const sessionToken = readAccountSessionToken(cookieHeader);
  if (!sessionToken) {
    logOutcome("warn", "generation_failed");
    return problem("unauthenticated", 401, {
      redirectTo: getPersonalDataExportLoginPath(parsed.data.locale),
    });
  }

  const result: PersonalDataExportGenerationResult = await generatePersonalDataExport({
    sessionToken,
    registry: personalDataExportRegistry,
  }).catch(() => ({ status: "unavailable" as const }));
  if (result.status === "completed") {
    logOutcome("info", "download_completed");
    return new Response(result.export.json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${getExportFilename(result.export.envelope.generatedAt)}"`,
        "Content-Length": String(result.export.byteLength),
        "Cache-Control": "no-store, private",
        Pragma: "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (result.status === "rate_limited") {
    const retryAfter = result.retryAfter ?? 1;
    logOutcome("warn", "generation_rate_limited");
    return problem(
      "rate_limited",
      429,
      { retryAfter },
      { "Retry-After": String(retryAfter) },
    );
  }
  if (result.status === "unauthenticated") {
    logOutcome("warn", "generation_failed");
    return problem("unauthenticated", 401, {
      redirectTo: getPersonalDataExportLoginPath(parsed.data.locale),
    });
  }
  if (result.status === "not_ready") {
    logOutcome("warn", "generation_expired");
    return problem("not_ready", 409);
  }
  logOutcome("warn", result.auditOutcome ?? "generation_failed");
  return problem("unavailable", 503);
}