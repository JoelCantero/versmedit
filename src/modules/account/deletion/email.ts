import "server-only";

import { sendTransactionalEmail } from "@/lib/email/index";
import {
  renderEmailPresentation,
  type EmailBrand,
} from "@/lib/email/presentation";
import { getEnv } from "@/lib/env";
import type { AccountLocale } from "@/modules/account/types";

interface AccountDeletionEmailOptions {
  recipient: string;
  rawToken: string;
  locale: AccountLocale;
  origin: string;
}

export function buildAccountDeletionEmail(
  { recipient, rawToken, locale, origin }: AccountDeletionEmailOptions,
  brand: EmailBrand,
) {
  const verificationUrl = new URL("/api/account/deletion/verify", origin);
  verificationUrl.searchParams.set("token", rawToken);

  return renderEmailPresentation({
    variant: "accountDeletionReauthentication",
    locale,
    brand,
    actionUrl: verificationUrl.toString(),
  }).then((content) => ({ recipient, locale, ...content }));
}

export async function sendAccountDeletionEmail(
  options: AccountDeletionEmailOptions,
) {
  const mail = getEnv().MAIL;
  if (!mail.enabled) throw new Error("Transactional email is disabled");
  return sendTransactionalEmail(
    await buildAccountDeletionEmail(options, mail.brand),
  );
}