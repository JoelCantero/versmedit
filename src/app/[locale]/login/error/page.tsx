import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { GalleryVerticalEndIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getEnv } from "@/lib/env";
import { parseLoginLocale } from "@/modules/login/schema";

type LoginErrorPageProps = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: LoginErrorPageProps): Promise<Metadata> {
  const locale = parseLoginLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Login.recovery.invalidLink" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default async function LoginErrorPage({
  params,
}: LoginErrorPageProps) {
  const locale = parseLoginLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Login" });
  const { PROJECT_NAME } = getEnv();

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEndIcon className="size-4" aria-hidden="true" />
          </span>
          {PROJECT_NAME}
        </Link>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              <h1 id="invalid-link-heading">{t("recovery.invalidLink.title")}</h1>
            </CardTitle>
            <CardDescription>{t("recovery.invalidLink.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3" role="alert">
              <Button render={<Link href="/login" />}>{t("actions.retry")}</Button>
              <Button variant="outline" render={<Link href="/" />}>
                {t("actions.goHome")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}