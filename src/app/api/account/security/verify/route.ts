import { NextRequest } from "next/server";

import { getEnv } from "@/lib/env";
import { getRequestLogger } from "@/lib/logger";
import { isCanonicalRequestOrigin } from "@/lib/request-context";
import { readAccountSessionToken } from "@/modules/account/session";
import {
  getAccountSecurityCallbackPath,
  parseAccountSecurityCallbackToken,
} from "@/modules/account/security/schema";
import { verifyAccountSecurityReauthentication } from "@/modules/account/security/service";
import {
  ACCOUNT_SECURITY_VERIFICATION_INVALID_LINK_OUTCOME,
  ACCOUNT_SECURITY_VERIFICATION_REAUTHENTICATED_OUTCOME,
  ACCOUNT_SECURITY_VERIFICATION_SESSION_CONFLICT_OUTCOME,
  type AccountSecurityCallbackState,
} from "@/modules/account/security/types";
import type { AccountLocale } from "@/modules/account/types";

const ROUTE = "/api/account/security/verify";
const LOG_MESSAGE = "account security verification completed";

const callbackOutcomes = {
  reauthenticated: ACCOUNT_SECURITY_VERIFICATION_REAUTHENTICATED_OUTCOME,
  invalid_link: ACCOUNT_SECURITY_VERIFICATION_INVALID_LINK_OUTCOME,
  session_conflict: ACCOUNT_SECURITY_VERIFICATION_SESSION_CONFLICT_OUTCOME,
} satisfies Record<AccountSecurityCallbackState, string>;

function stateRedirect(
  origin: string,
  locale: AccountLocale,
  state: AccountSecurityCallbackState,
) {
  return Response.redirect(
    new URL(getAccountSecurityCallbackPath(locale, state), origin),
    302,
  );
}

export async function GET(request: NextRequest) {
  const env = getEnv();
  const canonical = new URL(env.NEXTAUTH_URL);
  const log = getRequestLogger(request, { route: ROUTE });

  if (!isCanonicalRequestOrigin(request, canonical)) {
    return Response.json(
      { status: "misdirected_request" },
      { status: 421 },
    );
  }

  const rawToken = parseAccountSecurityCallbackToken(
    request.nextUrl.searchParams,
  );
  if (!rawToken) {
    log.warn(
      { outcome: ACCOUNT_SECURITY_VERIFICATION_INVALID_LINK_OUTCOME },
      LOG_MESSAGE,
    );
    return stateRedirect(canonical.origin, "en", "invalid_link");
  }

  const result = await verifyAccountSecurityReauthentication({
    rawToken,
    sessionToken: readAccountSessionToken(request.headers.get("cookie")),
  }).catch(() => ({ status: "invalid_link" as const, locale: "en" as const }));
  const outcome = callbackOutcomes[result.status];
  const fields = { outcome };
  if (result.status === "reauthenticated") log.info(fields, LOG_MESSAGE);
  else log.warn(fields, LOG_MESSAGE);

  return stateRedirect(canonical.origin, result.locale, result.status);
}