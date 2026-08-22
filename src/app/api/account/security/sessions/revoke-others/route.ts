import { NextRequest } from "next/server";

import { validateAuthCsrfToken } from "@/lib/auth-csrf";
import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import { isCanonicalRequestOrigin } from "@/lib/request-context";
import { readAccountSessionToken } from "@/modules/account/session";
import {
  accountSecurityBulkCommandSchema,
  getAccountSecurityLoginPath,
  parseAccountSecurityRequestBody,
} from "@/modules/account/security/schema";
import { revokeAllOtherAccountSessions } from "@/modules/account/security/service";
import {
  ACCOUNT_SECURITY_REVOKE_OTHER_SESSIONS_COMPLETED_OUTCOME,
  ACCOUNT_SECURITY_REVOKE_OTHER_SESSIONS_FAILED_OUTCOME,
} from "@/modules/account/security/types";

const ROUTE = "/api/account/security/sessions/revoke-others";
const LOG_MESSAGE = "account security bulk session revocation completed";

export async function POST(request: NextRequest) {
  const env = getEnv();
  const canonical = new URL(env.NEXTAUTH_URL);
  const log = getRequestLogger(request, { route: ROUTE });

  if (!isCanonicalRequestOrigin(request, canonical)) {
    return Response.json({ status: "forbidden" }, { status: 403 });
  }

  const source = await request.text().catch(() => "");
  const body = parseAccountSecurityRequestBody(source);
  const parsed = accountSecurityBulkCommandSchema.safeParse(body);
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

  const result = await revokeAllOtherAccountSessions({ sessionToken });
  if (result.status === "completed") {
    log.info(
      { outcome: ACCOUNT_SECURITY_REVOKE_OTHER_SESSIONS_COMPLETED_OUTCOME },
      LOG_MESSAGE,
    );
    return Response.json({ status: "completed" });
  }
  if (result.status === "reauthentication_required") {
    return Response.json(result, { status: 409 });
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
    { outcome: ACCOUNT_SECURITY_REVOKE_OTHER_SESSIONS_FAILED_OUTCOME },
    LOG_MESSAGE,
  );
  return Response.json({ status: "revocation_failed" }, { status: 500 });
}