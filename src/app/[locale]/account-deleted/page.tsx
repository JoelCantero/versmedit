import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { parseLoginLocale } from "@/modules/login/schema";

interface AccountDeletedPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: AccountDeletedPageProps): Promise<Metadata> {
  const locale = parseLoginLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Account.deleted.metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function AccountDeletedPage({ params }: AccountDeletedPageProps) {
  const locale = parseLoginLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Account.deleted" });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16 sm:px-6">
      <div className="space-y-3">
        <h1
          autoFocus
          tabIndex={-1}
          className="text-3xl font-semibold text-foreground outline-none"
        >
          {t("title")}
        </h1>
        <p className="max-w-xl text-muted-foreground">{t("description")}</p>
      </div>
      <Link
        href="/"
        locale={locale}
        className="inline-flex min-h-11 w-fit items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {t("home")}
      </Link>
    </main>
  );
}