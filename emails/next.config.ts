import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "dotenv";
import type { NextConfig } from "next";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));

function loadPreviewBrandEnv(): Record<string, string> {
  if (process.env.EMAIL_PREVIEW_USE_APP_BRAND !== "true") return {};

  let appEnv: Record<string, string> = {};
  try {
    appEnv = parse(readFileSync(`${repositoryRoot}/.env`));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const publicBrandFields = {
    EMAIL_PREVIEW_PROJECT_NAME: "PROJECT_NAME",
    EMAIL_PREVIEW_BRAND_COLOR: "BRAND_COLOR",
    EMAIL_PREVIEW_SUPPORT_EMAIL: "SUPPORT_EMAIL",
    EMAIL_PREVIEW_LOGO_URL: "MAIL_LOGO_URL",
  } as const;
  const shellBrand = {
    PROJECT_NAME: process.env.PROJECT_NAME,
    BRAND_COLOR: process.env.BRAND_COLOR,
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
    MAIL_LOGO_URL: process.env.MAIL_LOGO_URL,
  } as const;

  return Object.fromEntries(
    Object.entries(publicBrandFields).map(([previewField, appField]) => [
      previewField,
      shellBrand[appField] ?? appEnv[appField] ?? "",
    ]),
  );
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  env: loadPreviewBrandEnv(),
  logging: {
    incomingRequests: false,
  },
  turbopack: {
    root: repositoryRoot,
  },
};

export default nextConfig;