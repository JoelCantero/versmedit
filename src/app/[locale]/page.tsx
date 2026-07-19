import { getTranslations, setRequestLocale } from "next-intl/server";
import { getServerSession } from "next-auth";

import { HomeNavigation } from "@/components/home-navigation";
import { authOptions } from "@/lib/auth";
import { parseLoginLocale } from "@/modules/login/schema";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const locale = parseLoginLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations("HomePage");
  const session = await getServerSession(authOptions);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between">
          <span className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
            Nextself
          </span>
          <HomeNavigation
            authenticated={Boolean(session?.user)}
            locale={locale}
            labels={{
              ariaLabel: t("navigation.ariaLabel"),
              login: t("navigation.login"),
              signup: t("navigation.signup"),
              logout: t("navigation.logout"),
              toggleTheme: t("navigation.toggleTheme"),
              language: t("navigation.language"),
            }}
          />
        </div>
      </header>
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
    </div>
  );
}
