import "server-only";

import caMessages from "@/messages/ca.json";
import enMessages from "@/messages/en.json";
import esMessages from "@/messages/es.json";

import { sendTransactionalEmail } from "@/lib/email/index";
import { getEnv } from "@/lib/env";
import type { SignupLocale } from "@/modules/signup/types";

const emailCopy = {
  en: enMessages.Signup.email,
  es: esMessages.Signup.email,
  ca: caMessages.Signup.email,
} satisfies Record<SignupLocale, typeof enMessages.Signup.email>;

interface BaseEmailOptions {
  recipient: string;
  locale: SignupLocale;
  origin: string;
}

interface OnboardingEmailOptions extends BaseEmailOptions {
  rawToken: string;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function localizePath(path: string, locale: SignupLocale) {
  return locale === "en" ? path : `/${locale}${path}`;
}

export function buildOnboardingEmail({
  recipient,
  rawToken,
  locale,
  origin,
}: OnboardingEmailOptions, projectName: string) {
  const copy = emailCopy[locale].onboarding;
  const activationUrl = new URL("/api/signup/activate", origin);
  activationUrl.searchParams.set("token", rawToken);
  const url = activationUrl.toString();

  return {
    recipient,
    locale,
    subject: copy.subject.replaceAll("{projectName}", projectName),
    text: `${copy.intro}\n\n${copy.action}: ${url}`,
    html: `<p>${escapeHtml(copy.intro)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(copy.action)}</a></p>`,
  };
}

export function buildActiveAccountEmail({
  recipient,
  locale,
  origin,
}: BaseEmailOptions, projectName: string) {
  const copy = emailCopy[locale].activeAccount;
  const loginUrl = new URL(localizePath("/login", locale), origin).toString();

  return {
    recipient,
    locale,
    subject: copy.subject.replaceAll("{projectName}", projectName),
    text: `${copy.intro}\n\n${copy.action}: ${loginUrl}`,
    html: `<p>${escapeHtml(copy.intro)}</p><p><a href="${escapeHtml(loginUrl)}">${escapeHtml(copy.action)}</a></p>`,
  };
}

export async function sendOnboardingEmail(options: OnboardingEmailOptions) {
  return sendTransactionalEmail(
    buildOnboardingEmail(options, getEnv().PROJECT_NAME),
  );
}

export async function sendActiveAccountEmail(options: BaseEmailOptions) {
  return sendTransactionalEmail(
    buildActiveAccountEmail(options, getEnv().PROJECT_NAME),
  );
}