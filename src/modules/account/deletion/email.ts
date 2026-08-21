import "server-only";

import caMessages from "@/messages/ca.json";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";

import { sendTransactionalEmail } from "@/lib/email/index";
import { getEnv } from "@/lib/env";
import type { AccountLocale } from "@/modules/account/types";

interface AccountDeletionEmailOptions {
  recipient: string;
  rawToken: string;
  locale: AccountLocale;
  origin: string;
}

const emailCopy = {
  en: enMessages.Account.deletion.email,
  es: esMessages.Account.deletion.email,
  ca: caMessages.Account.deletion.email,
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

export function buildAccountDeletionEmail(
  { recipient, rawToken, locale, origin }: AccountDeletionEmailOptions,
  projectName: string,
) {
  const copy = emailCopy[locale];
  const verificationUrl = new URL("/api/account/deletion/verify", origin);
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

export function sendAccountDeletionEmail(options: AccountDeletionEmailOptions) {
  return sendTransactionalEmail(
    buildAccountDeletionEmail(options, getEnv().PROJECT_NAME),
  );
}