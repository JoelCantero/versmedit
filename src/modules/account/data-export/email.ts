import "server-only";

import { sendTransactionalEmail } from "@/lib/email/index";
import {
  renderEmailPresentation,
  type EmailBrand,
} from "@/lib/email/presentation";
import { getEnv } from "@/lib/env";
import { getPersonalDataExportVerificationUrl } from "@/modules/account/data-export/schema";
import type { AccountLocale } from "@/modules/account/types";

interface PersonalDataExportEmailOptions {
  recipient: string;
  rawToken: string;
  locale: AccountLocale;
  origin: string;
}

export function buildPersonalDataExportEmail(
  { recipient, rawToken, locale, origin }: PersonalDataExportEmailOptions,
  brand: EmailBrand,
) {
  const url = getPersonalDataExportVerificationUrl({ origin, rawToken, locale });

  return renderEmailPresentation({
    variant: "personalDataExportConfirmation",
    locale,
    brand,
    actionUrl: url,
  }).then((content) => ({ recipient, locale, ...content }));
}

export function sendPersonalDataExportEmail(
  options: PersonalDataExportEmailOptions,
) {
  const mail = getEnv().MAIL;
  if (!mail.enabled) throw new Error("Transactional email is disabled");
  return buildPersonalDataExportEmail(options, mail.brand).then((message) =>
    sendTransactionalEmail(message, undefined, undefined, {
      logAttempt: false,
    }),
  );
}