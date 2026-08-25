import "server-only";

import { sendTransactionalEmail } from "@/lib/email/index";
import {
  renderEmailPresentation,
  type EmailBrand,
} from "@/lib/email/presentation";
import { getEnv } from "@/lib/env";
import type { AccountLocale } from "@/modules/account/types";

interface AccountSecurityEmailOptions {
  recipient: string;
  rawToken: string;
  locale: AccountLocale;
  origin: string;
}

export function buildAccountSecurityEmail(
  { recipient, rawToken, locale, origin }: AccountSecurityEmailOptions,
  brand: EmailBrand,
) {
  const verificationUrl = new URL("/api/account/security/verify", origin);
  verificationUrl.searchParams.set("token", rawToken);

  return renderEmailPresentation({
    variant: "accountSecurityReauthentication",
    locale,
    brand,
    actionUrl: verificationUrl.toString(),
  }).then((content) => ({ recipient, locale, ...content }));
}

export async function sendAccountSecurityEmail(
  options: AccountSecurityEmailOptions,
) {
  const mail = getEnv().MAIL;
  if (!mail.enabled) throw new Error("Transactional email is disabled");
  return sendTransactionalEmail(
    await buildAccountSecurityEmail(options, mail.brand),
  );
}