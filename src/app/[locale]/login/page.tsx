import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GalleryVerticalEndIcon } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { LoginForm } from "@/modules/login/components/login-form";
import { parseLoginCallbackPath, parseLoginLocale } from "@/modules/login/schema";

type LoginPageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ callbackUrl?: string }>;
};

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const locale = parseLoginLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Login.page.metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const locale = parseLoginLocale((await params).locale);
  const resolvedSearchParams = (await searchParams) ?? {};
  const callbackUrl = parseLoginCallbackPath(locale, resolvedSearchParams.callbackUrl);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Login" });

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEndIcon className="size-4" aria-hidden="true" />
          </span>
          Nextself
        </Link>
        <LoginForm
          locale={locale}
          callbackUrl={callbackUrl}
          title={t("heading.title")}
          description={t("heading.description")}
          messages={{
            ariaLabel: t("form.ariaLabel"),
            emailLabel: t("fields.email.label"),
            emailPlaceholder: t("fields.email.placeholder"),
            emailDescription: t("fields.email.description"),
            invalidEmail: t("validation.email.invalid"),
            submitIdle: t("actions.submitIdle"),
            submitPending: t("actions.submitPending"),
            sending: t("states.sending"),
            accepted: t("states.accepted"),
            invalidRequest: t("states.invalidRequest"),
            unavailable: t("states.unavailable"),
            rateLimited: t("states.rateLimited", { seconds: "{seconds}" }),
          }}
        />
      </div>
    </main>
  );
}