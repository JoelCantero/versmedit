export const loginLocales = ["en", "es", "ca"] as const;

export type LoginLocale = (typeof loginLocales)[number];

export type LoginUiState =
  | "initial"
  | "pending"
  | "accepted"
  | "invalidEmail"
  | "invalidRequest"
  | "rateLimited"
  | "unavailable"
  | "invalidLink";

export interface LoginRequest {
  email: string;
  csrfToken: string;
  callbackUrl: string;
  json: "true";
}

export type LoginResult =
  | { status: "accepted" }
  | { status: "invalid"; field: "email" }
  | { status: "invalid_request" }
  | { status: "rate_limited"; retryAfter: number }
  | { status: "unavailable" };