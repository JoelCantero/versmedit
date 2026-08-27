import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link } from "@/i18n/navigation";
import { getEnv } from "@/lib/env";
import { PRIVACY_NOTICE_VERSION } from "@/modules/signup/policy";
import { parseSignupLocale } from "@/modules/signup/schema";

const sections = ["collection", "use", "sharing", "retention", "security", "choices", "changes"] as const;

type PrivacyPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const locale = parseSignupLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Policies.privacy.metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const locale = parseSignupLocale((await params).locale);
  setRequestLocale(locale);
  const common = await getTranslations({ locale, namespace: "Policies" });
  const t = await getTranslations({ locale, namespace: "Policies.privacy" });
  const projectName = getEnv().PROJECT_NAME;

  return (
    <main className="min-h-svh bg-background px-6 py-10 md:px-10">
      <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 py-6 md:py-10">
        <header className="flex flex-col gap-3">
          <Link href="/" className="w-fit text-sm font-medium text-muted-foreground hover:text-foreground">
            {projectName}
          </Link>
          <h1 className="text-3xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("intro")}</p>
          <Alert role="note" variant="destructive">
            <AlertDescription>{common("draftNotice")}</AlertDescription>
          </Alert>
          <p className="text-sm text-muted-foreground">
            {common("versionLabel", { version: PRIVACY_NOTICE_VERSION })}
          </p>
        </header>
        {sections.map((section) => (
          <section key={section} className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold">{t(`sections.${section}.title`)}</h2>
            <p className="leading-7 text-muted-foreground">{t(`sections.${section}.body`)}</p>
          </section>
        ))}
      </article>
    </main>
  );
}