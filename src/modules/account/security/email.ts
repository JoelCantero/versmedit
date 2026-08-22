import "server-only";

import caMessages from "@/messages/ca.json";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";

import { sendTransactionalEmail } from "@/lib/email/index";
import { getEnv } from "@/lib/env";
import type { AccountLocale } from "@/modules/account/types";

interface AccountSecurityEmailOptions {
  recipient: string;
  rawToken: string;
  locale: AccountLocale;
  origin: string;
}

const emailCopy = {
  en: enMessages.Account.security.email,
  es: esMessages.Account.security.email,
  ca: caMessages.Account.security.email,
} satisfies Record<
  AccountLocale,
  { subject: string; introduction: string; action: string }
>;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildAccountSecurityEmail(
  { recipient, rawToken, locale, origin }: AccountSecurityEmailOptions,
  projectName: string,
) {
  const copy = emailCopy[locale];
  const verificationUrl = new URL("/api/account/security/verify", origin);
  verificationUrl.searchParams.set("token", rawToken);
  const url = verificationUrl.toString();

  return {
    recipient,
    locale,
    subject: copy.subject.replaceAll("{projectName}", projectName),
    text: `${copy.introduction}\n\n${copy.action}: ${url}`,
    html: `<p>${escapeHtml(copy.introduction)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(copy.action)}</a></p>`,
  };
}

export function sendAccountSecurityEmail(options: AccountSecurityEmailOptions) {
  return sendTransactionalEmail(
    buildAccountSecurityEmail(options, getEnv().PROJECT_NAME),
  );
}