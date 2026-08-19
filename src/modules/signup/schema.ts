import { z } from "zod";

import { profileNameSchema } from "@/lib/validation/profile-name";
import { loginEmailSchema } from "@/modules/login/schema";
import type {
  SignupClientInput,
  ValidatedSignupRequest,
} from "@/modules/signup/types";

export const signupLocaleSchema = z.enum(["en", "es", "ca"]);
const policyAcceptanceSchema = z.literal(true);

export const signupClientSchema = z.strictObject({
  name: profileNameSchema,
  email: loginEmailSchema,
  policyAccepted: policyAcceptanceSchema,
});

export const signupRequestSchema = z.strictObject({
  name: profileNameSchema,
  email: loginEmailSchema,
  policyAccepted: policyAcceptanceSchema,
  locale: signupLocaleSchema,
  csrfToken: z.string().min(1),
});

export function parseSignupClientInput(value: unknown): SignupClientInput {
  return signupClientSchema.parse(value);
}

export function parseSignupRequest(value: unknown): ValidatedSignupRequest {
  return signupRequestSchema.parse(value);
}

export function parseSignupLocale(value: unknown) {
  return signupLocaleSchema.parse(value);
}