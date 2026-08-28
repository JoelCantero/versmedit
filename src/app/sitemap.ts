import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";
import { getEnv } from "@/lib/env";
import {
  INDEXABLE_PUBLIC_PATHS,
  localizedAlternates,
  localizedUrl,
} from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const { BRAND } = getEnv();

  return INDEXABLE_PUBLIC_PATHS.flatMap((pathname) =>
    routing.locales.map((locale) => ({
      url: localizedUrl(BRAND.canonicalOrigin, locale, pathname),
      changeFrequency: pathname === "/" ? "weekly" as const : "yearly" as const,
      priority: pathname === "/" ? 1 : 0.5,
      alternates: localizedAlternates(BRAND.canonicalOrigin, pathname),
    })),
  );
}