import { createHash } from "node:crypto";

import { NextRequest } from "next/server";

import { validateAuthCsrfToken } from "@/lib/auth-csrf";
import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import { getProviderAvailability } from "@/lib/provider-availability";
import {
  getClientIdentifier,
  isCanonicalRequestOrigin,
} from "@/lib/request-context";
import { consumeSharedRateLimit } from "@/lib/shared-rate-limit";
import { signupRequestSchema } from "@/modules/signup/schema";
import {
  acceptedSignupResponse,
  processSignup,
} from "@/modules/signup/service";

const RATE_LIMIT_WINDOW_MS = 15 * 60_000;

function hashAddress(normalizedEmail: string) {
  return createHash("sha256").update(normalizedEmail).digest("hex");
}

function rateLimitResponse(
  request: NextRequest,
  retryAfterSeconds: number,
) {
  getRequestLogger(request, { route: "/api/signup" }).warn(
    { retryAfterSeconds },
    "signup rate limit exceeded",
  );
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

function validationResponse(error: ReturnType<typeof signupRequestSchema.safeParse>) {
  if (error.success) return null;

  const field = error.error.issues.find((issue) =>
    ["name", "email", "policyAccepted"].includes(String(issue.path[0])),
  )?.path[0];
  if (field === "name" || field === "email" || field === "policyAccepted") {
    return Response.json({ status: "invalid", field }, { status: 400 });
  }
  return Response.json({ status: "invalid_request" }, { status: 400 });
}

export async function POST(request: NextRequest) {
  const canonicalUrl = new URL(getEnv().NEXTAUTH_URL);
  if (!isCanonicalRequestOrigin(request, canonicalUrl)) {
    return Response.json({ status: "misdirected_request" }, { status: 421 });
  }

  const startedAt = Date.now();
  const clientResult = await consumeSharedRateLimit({
    key: `auth:email:client:${getClientIdentifier(request)}`,
    limit: 5,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!clientResult.allowed) {
    return rateLimitResponse(request, clientResult.retryAfterSeconds);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ status: "invalid_request" }, { status: 400 });
  }

  const csrfToken = "csrfToken" in body ? body.csrfToken : undefined;
  if (
    !validateAuthCsrfToken({
      bodyToken: typeof csrfToken === "string" ? csrfToken : undefined,
      cookieHeader: request.headers.get("cookie") ?? undefined,
      secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
    })
  ) {
    return Response.json({ status: "invalid_request" }, { status: 403 });
  }

  const parsed = signupRequestSchema.safeParse(body);
  if (!parsed.success) return validationResponse(parsed)!;

  const addressResult = await consumeSharedRateLimit({
    key: `auth:email:address:${hashAddress(parsed.data.email)}`,
    limit: 3,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!addressResult.allowed) {
    return rateLimitResponse(request, addressResult.retryAfterSeconds);
  }

  const availability = await getProviderAvailability();
  if (!availability.available) {
    getRequestLogger(request, { route: "/api/signup" }).warn(
      { retryAfterSeconds: availability.retryAfterSeconds },
      "signup email provider temporarily unavailable",
    );
    return Response.json(
      { status: "unavailable" },
      {
        status: 503,
        headers: { "Retry-After": String(availability.retryAfterSeconds) },
      },
    );
  }

  try {
    await processSignup(parsed.data);
  } catch {
    // Valid isolated failures retain the same accepted public result.
  }
  return acceptedSignupResponse({ startedAt });
}