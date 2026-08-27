import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { parseLoginLocale } from "@/modules/login/schema";
import { getEnv } from "@/lib/env";
import { publicPageMetadata } from "@/lib/seo";

type HomePageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const locale = parseLoginLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const { BRAND } = getEnv();
  return publicPageMetadata({
    origin: BRAND.canonicalOrigin,
    siteName: BRAND.productName,
    locale,
    pathname: "/",
    title: t("title"),
    description: t("description"),
  });
}

export default async function Home({
  params,
}: HomePageProps) {
  const locale = parseLoginLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("HomePage");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
        {t("title")}
      </h1>
      <p className="text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        {t("tagline")}
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-500">
        {t("getStarted")}
      </p>
    </main>
  );
}
