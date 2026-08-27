import type { MetadataRoute } from "next";

import { getEnv } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const { BRAND } = getEnv();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api",
    },
    sitemap: new URL("/sitemap.xml", BRAND.canonicalOrigin).toString(),
    host: BRAND.canonicalOrigin,
  };
}