import { z } from "zod";

import { loginLocales } from "@/modules/login/types";

export const loginEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email();

export const loginLocaleSchema = z.enum(loginLocales);

export function parseLoginEmail(value: unknown) {
  return loginEmailSchema.parse(value);
}

export function parseLoginLocale(value: unknown) {
  return loginLocaleSchema.parse(value);
}