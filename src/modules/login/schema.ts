import { z } from "zod";

import { isLoginCode, normalizeLoginCode } from "@/modules/login/code";
import { loginLocales } from "@/modules/login/types";

const CALLBACK_PARSE_BASE = "https://app.local.test";

export const loginEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email();

export const loginCodeSchema = z
  .string()
  .max(64)
  .transform(normalizeLoginCode)
  .refine(isLoginCode);

export const loginLocaleSchema = z.enum(loginLocales);

export function parseLoginEmail(value: unknown) {
  return loginEmailSchema.parse(value);
}

export function parseLoginCode(value: unknown) {
  return loginCodeSchema.parse(value);
}

export function parseLoginLocale(value: unknown) {
  return loginLocaleSchema.parse(value);
}

export function getHomePathForLocale(locale: z.infer<typeof loginLocaleSchema>) {
  return locale === "en" ? "/" : `/${locale}`;
}

export function getLoginPathForLocale(locale: z.infer<typeof loginLocaleSchema>) {
  return locale === "en" ? "/login" : `/${locale}/login`;
}

export function getAccountPathForLocale(locale: z.infer<typeof loginLocaleSchema>) {
  return locale === "en" ? "/account" : `/${locale}/account`;
}

function decodeCandidatePath(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseLoginCallbackPath(
  locale: z.infer<typeof loginLocaleSchema>,
  callbackValue: unknown,
) {
  const fallback = getHomePathForLocale(locale);
  if (typeof callbackValue !== "string") return fallback;

  const trimmed = callbackValue.trim();
  if (!trimmed) return fallback;

  const decoded = decodeCandidatePath(trimmed);
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;

  try {
    const parsed = new URL(decoded, CALLBACK_PARSE_BASE);
    const accountPath = getAccountPathForLocale(locale);
    const expectedPaths = new Set([accountPath, `${accountPath}/security`]);
    if (parsed.origin !== CALLBACK_PARSE_BASE) return fallback;
    if (!expectedPaths.has(parsed.pathname)) return fallback;
    if (parsed.search || parsed.hash) return fallback;
    return parsed.pathname;
  } catch {
    return fallback;
  }
}