import "server-only";

import caMessages from "@/messages/ca.json";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";

import { sendTransactionalEmail } from "@/lib/email/index";
import { getEnv } from "@/lib/env";
import { getPersonalDataExportVerificationUrl } from "@/modules/account/data-export/schema";
import type { AccountLocale } from "@/modules/account/types";

interface PersonalDataExportEmailOptions {
  recipient: string;
  rawToken: string;
  locale: AccountLocale;
  origin: string;
}

const emailCopy = {
  en: enMessages.Account.dataExport.email,
  es: esMessages.Account.dataExport.email,
  ca: caMessages.Account.dataExport.email,
} satisfies Record<
  AccountLocale,
  {
    subject: string;
    introduction: string;
    sessionRequirement: string;
    expiry: string;
    action: string;
  }
>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildPersonalDataExportEmail(
  { recipient, rawToken, locale, origin }: PersonalDataExportEmailOptions,
  projectName: string,
) {
  const copy = emailCopy[locale];
  const url = getPersonalDataExportVerificationUrl({ origin, rawToken, locale });
  const introduction = copy.introduction.replaceAll(
    "{projectName}",
    projectName,
  );
  const subject = copy.subject.replaceAll("{projectName}", projectName);

  return {
    recipient,
    locale,
    subject,
    text: `${introduction}\n\n${copy.sessionRequirement}\n${copy.expiry}\n\n${copy.action}: ${url}`,
    html: `<p>${escapeHtml(introduction)}</p><p>${escapeHtml(copy.sessionRequirement)}</p><p>${escapeHtml(copy.expiry)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(copy.action)}</a></p>`,
  };
}

export function sendPersonalDataExportEmail(
  options: PersonalDataExportEmailOptions,
) {
  return sendTransactionalEmail(
    buildPersonalDataExportEmail(options, getEnv().PROJECT_NAME),
    undefined,
    undefined,
    { logAttempt: false },
  );
}