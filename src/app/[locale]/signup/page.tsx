import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GalleryVerticalEndIcon } from "lucide-react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { Link } from "@/i18n/navigation";
import { authOptions } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { getSessionUserId } from "@/modules/account/session";
import {
  SignupForm,
  type SignupRecoveryState,
} from "@/modules/signup/components/signup-form";
import { POLICY_PATHS } from "@/modules/signup/policy";
import { parseSignupLocale } from "@/modules/signup/schema";

type SignupPageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ state?: string }>;
};

function parseRecoveryState(value: string | undefined) {
  return ["invalid_link", "session_conflict", "session_failed"].includes(
    value ?? "",
  )
    ? (value as SignupRecoveryState)
    : undefined;
}

export async function generateMetadata({ params }: SignupPageProps): Promise<Metadata> {
  const locale = parseSignupLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Signup.page.metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function SignupPage({ params, searchParams }: SignupPageProps) {
  const locale = parseSignupLocale((await params).locale);
  const recoveryState = parseRecoveryState((await searchParams)?.state);
  setRequestLocale(locale);
  const session = await getServerSession(authOptions);
  if (getSessionUserId(session)) {
    redirect(locale === "en" ? "/" : `/${locale}`);
  }
  const t = await getTranslations({ locale, namespace: "Signup" });
  const projectName = getEnv().PROJECT_NAME;

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEndIcon className="size-4" aria-hidden="true" />
          </span>
          {projectName}
        </Link>
        <SignupForm
          locale={locale}
          recoveryState={recoveryState}
          loginPath="/login"
          policyDestinations={POLICY_PATHS}
          title={t("heading.title")}
          description={t("heading.description")}
          messages={{
            ariaLabel: t("form.ariaLabel"),
            nameLabel: t("fields.name.label"),
            namePlaceholder: t("fields.name.placeholder"),
            nameDescription: t("fields.name.description"),
            emailLabel: t("fields.email.label"),
            emailPlaceholder: t("fields.email.placeholder"),
            emailDescription: t("fields.email.description"),
            policyLabelPrefix: t("fields.policy.labelPrefix"),
            policyTerms: t("fields.policy.terms"),
            policyAnd: t("fields.policy.and"),
            policyPrivacy: t("fields.policy.privacy"),
            policyDescription: t("fields.policy.description"),
            invalidNameRequired: t("validation.name.required"),
            invalidNameTooLong: t("validation.name.max"),
            invalidNameCharacters: t("validation.name.invalid"),
            invalidEmail: t("validation.email.invalid"),
            invalidPolicy: t("validation.policy.required"),
            invalidRequest: t("states.invalidRequest"),
            submitIdle: t("actions.submitIdle"),
            submitPending: t("actions.submitPending"),
            sending: t("states.sending"),
            accepted: t("states.accepted"),
            unavailable: t("states.unavailable"),
            rateLimited: t("states.rateLimited", { seconds: "{seconds}" }),
            loginPrompt: t("actions.loginPrompt"),
            login: t("actions.login"),
            invalidLinkTitle: t("recovery.invalidLink.title"),
            invalidLinkDescription: t("recovery.invalidLink.description"),
            invalidLinkAction: t("recovery.invalidLink.action"),
            sessionConflictTitle: t("recovery.sessionConflict.title"),
            sessionConflictDescription: t("recovery.sessionConflict.description"),
            sessionConflictAction: t("recovery.sessionConflict.action"),
            sessionFailedTitle: t("recovery.sessionFailed.title"),
            sessionFailedDescription: t("recovery.sessionFailed.description"),
            sessionFailedAction: t("recovery.sessionFailed.action"),
          }}
        />
      </div>
    </main>
  );
}