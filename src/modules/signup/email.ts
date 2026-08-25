import "server-only";

import { sendTransactionalEmail } from "@/lib/email/index";
import {
  renderEmailPresentation,
  type EmailBrand,
} from "@/lib/email/presentation";
import { getEnv } from "@/lib/env";
import type { SignupLocale } from "@/modules/signup/types";

interface BaseEmailOptions {
  recipient: string;
  locale: SignupLocale;
  origin: string;
}

interface OnboardingEmailOptions extends BaseEmailOptions {
  rawToken: string;
}

function localizePath(path: string, locale: SignupLocale) {
  return locale === "en" ? path : `/${locale}${path}`;
}

export function buildOnboardingEmail({
  recipient,
  rawToken,
  locale,
  origin,
}: OnboardingEmailOptions, brand: EmailBrand) {
  const activationUrl = new URL("/api/signup/activate", origin);
  activationUrl.searchParams.set("token", rawToken);

  return renderEmailPresentation({
    variant: "signupActivation",
    locale,
    brand,
    actionUrl: activationUrl.toString(),
  }).then((content) => ({ recipient, locale, ...content }));
}

export function buildActiveAccountEmail({
  recipient,
  locale,
  origin,
}: BaseEmailOptions, brand: EmailBrand) {
  const loginUrl = new URL(localizePath("/login", locale), origin).toString();

  return renderEmailPresentation({
    variant: "existingAccountSignupNotice",
    locale,
    brand,
    actionUrl: loginUrl,
  }).then((content) => ({ recipient, locale, ...content }));
}

export async function sendOnboardingEmail(options: OnboardingEmailOptions) {
  const mail = getEnv().MAIL;
  if (!mail.enabled) throw new Error("Transactional email is disabled");
  return sendTransactionalEmail(await buildOnboardingEmail(options, mail.brand));
}

export async function sendActiveAccountEmail(options: BaseEmailOptions) {
  const mail = getEnv().MAIL;
  if (!mail.enabled) throw new Error("Transactional email is disabled");
  return sendTransactionalEmail(await buildActiveAccountEmail(options, mail.brand));
}