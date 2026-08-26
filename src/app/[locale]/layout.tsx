import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { AppFooter } from "@/components/app-footer";
import { AppHeader } from "@/components/app-header";
import { ThemeProvider } from "@/components/theme-provider";
import { routing } from "@/i18n/routing";
import { getEnv } from "@/lib/env";

import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  // Nonce-based CSP requires request-time rendering so Next.js can attach the
  // nonce to framework scripts and inline styles.
  await connection();
  const requestHeaders = await headers();
  const nonce =
    requestHeaders.get("x-nonce") ??
    requestHeaders
      .get("content-security-policy")
      ?.match(/'nonce-([^']+)'/)?.[1];
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const { BRAND } = getEnv();
  const brandCss = `:root{--primary:${BRAND.primaryColor};--primary-foreground:${BRAND.actionForeground};--ring:${BRAND.primaryColor};--sidebar-primary:${BRAND.primaryColor};--sidebar-primary-foreground:${BRAND.actionForeground}}`;

  return (
    <html
      lang={locale}
      className={`${geistSans.className} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <style nonce={nonce}>{brandCss}</style>
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {/* Messages/locale are inherited from src/i18n/request.ts. */}
          <NextIntlClientProvider>
            <AppHeader locale={locale} />
            <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
              {children}
            </div>
            <AppFooter locale={locale} supportEmail={BRAND.supportEmail} />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
