import type { PolicyLocale } from "@/modules/signup/policy";

export type SignupLocale = PolicyLocale;

export interface SignupClientInput {
  name: string;
  email: string;
  policyAccepted: true;
}

export interface ValidatedSignupRequest extends SignupClientInput {
  locale: SignupLocale;
  csrfToken: string;
}

export interface SignupCandidateSnapshot {
  proposedName: string;
  locale: SignupLocale;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: Date;
}

export type SignupPublicResult =
  | { status: "accepted" }
  | { status: "invalid"; field: "name" | "email" | "policyAccepted" }
  | { status: "invalid_request" }
  | { status: "rate_limited"; retryAfter: number }
  | { status: "unavailable" };

export type SignupLifecycleOutcome =
  | "onboarding_sent"
  | "active_notice_sent"
  | "onboarding_delivery_failed"
  | "active_notice_failed"
  | "processing_failed";

export interface SignupLifecycleResult {
  outcome: SignupLifecycleOutcome;
}

export interface SanitizedSignupEvent {
  category: "signup_submission";
  outcome: SignupLifecycleOutcome;
  durationMs: number;
}