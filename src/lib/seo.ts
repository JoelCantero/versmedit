import type { Metadata } from "next";

import { routing } from "@/i18n/routing";

export type AppLocale = (typeof routing.locales)[number];
export type PublicPath = "/" | "/privacy" | "/terms";

export const INDEXABLE_PUBLIC_PATHS: readonly PublicPath[] = ["/"];

export const NO_INDEX_ROBOTS = {
  index: false,
  follow: false,
} as const;

const localePrefixes: Record<AppLocale, string> = {
  en: "",
  es: "/es",
  ca: "/ca",
};

const openGraphLocales: Record<AppLocale, string> = {
  en: "en_US",
  es: "es_ES",
  ca: "ca_ES",
};

export function localizedPath(locale: AppLocale, pathname: PublicPath) {
  const prefix = localePrefixes[locale];
  return pathname === "/" ? prefix || "/" : `${prefix}${pathname}`;
}

export function localizedUrl(
  origin: string,
  locale: AppLocale,
  pathname: PublicPath,
) {
  return new URL(localizedPath(locale, pathname), origin).toString();
}

export function localizedAlternates(origin: string, pathname: PublicPath) {
  const languages = Object.fromEntries(
    routing.locales.map((locale) => [locale, localizedUrl(origin, locale, pathname)]),
  ) as Record<AppLocale, string>;

  return {
    languages: {
      ...languages,
      "x-default": languages.en,
    },
  };
}

export function noIndexMetadata(metadata: Metadata): Metadata {
  return { ...metadata, robots: NO_INDEX_ROBOTS };
}

export function publicPageMetadata({
  origin,
  siteName,
  locale,
  pathname,
  title,
  description,
}: {
  origin: string;
  siteName: string;
  locale: AppLocale;
  pathname: PublicPath;
  title: string;
  description: string;
}): Metadata {
  const alternates = localizedAlternates(origin, pathname);
  const canonical = alternates.languages[locale];

  return {
    metadataBase: new URL(origin),
    title,
    description,
    alternates: {
      canonical,
      languages: alternates.languages,
    },
    openGraph: {
      type: "website",
      url: canonical,
      siteName,
      title,
      description,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: siteName,
        },
      ],
      locale: openGraphLocales[locale],
      alternateLocale: routing.locales
        .filter((candidate) => candidate !== locale)
        .map((candidate) => openGraphLocales[candidate]),
    },
  };
}