export const ACCOUNT_SECURITY_INDIVIDUAL_CONFIRMATION =
  "revoke_session" as const;
export const ACCOUNT_SECURITY_BULK_CONFIRMATION =
  "revoke_other_sessions" as const;

export interface SessionListItem {
  sessionId: string;
  createdAt: string | null;
  expires: string;
  current: boolean;
  ordinal: number;
}

export type AccountSecurityRevocationResult =
  | { status: "completed" }
  | { status: "reauthentication_required" }
  | { status: "unauthenticated" }
  | { status: "revocation_failed" };

export type AccountSecurityReauthenticationResult =
  | { status: "sent" }
  | { status: "rate_limited"; retryAfter: number }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

export const accountSecurityCallbackStates = [
  "reauthenticated",
  "invalid_link",
  "session_conflict",
] as const;

export type AccountSecurityCallbackState =
  (typeof accountSecurityCallbackStates)[number];

export type AccountSecurityVerificationResult = {
  status: AccountSecurityCallbackState;
  locale: "en" | "es" | "ca";
};

export const ACCOUNT_SECURITY_REAUTHENTICATION_SENT_OUTCOME =
  "reauthentication_sent" as const;
export const ACCOUNT_SECURITY_REAUTHENTICATION_RATE_LIMITED_OUTCOME =
  "reauthentication_rate_limited" as const;
export const ACCOUNT_SECURITY_REAUTHENTICATION_UNAVAILABLE_OUTCOME =
  "reauthentication_unavailable" as const;
export const ACCOUNT_SECURITY_VERIFICATION_REAUTHENTICATED_OUTCOME =
  "verification_reauthenticated" as const;
export const ACCOUNT_SECURITY_VERIFICATION_INVALID_LINK_OUTCOME =
  "verification_invalid_link" as const;
export const ACCOUNT_SECURITY_VERIFICATION_SESSION_CONFLICT_OUTCOME =
  "verification_session_conflict" as const;

export const ACCOUNT_SECURITY_REVOKE_SESSION_COMPLETED_OUTCOME =
  "revoke_session_completed" as const;
export const ACCOUNT_SECURITY_REVOKE_SESSION_FAILED_OUTCOME =
  "revoke_session_failed" as const;
export const ACCOUNT_SECURITY_REVOKE_OTHER_SESSIONS_COMPLETED_OUTCOME =
  "revoke_other_sessions_completed" as const;
export const ACCOUNT_SECURITY_REVOKE_OTHER_SESSIONS_FAILED_OUTCOME =
  "revoke_other_sessions_failed" as const;

export const accountSecuritySanitizedOutcomes = [
  ACCOUNT_SECURITY_REAUTHENTICATION_SENT_OUTCOME,
  ACCOUNT_SECURITY_REAUTHENTICATION_RATE_LIMITED_OUTCOME,
  ACCOUNT_SECURITY_REAUTHENTICATION_UNAVAILABLE_OUTCOME,
  ACCOUNT_SECURITY_VERIFICATION_REAUTHENTICATED_OUTCOME,
  ACCOUNT_SECURITY_VERIFICATION_INVALID_LINK_OUTCOME,
  ACCOUNT_SECURITY_VERIFICATION_SESSION_CONFLICT_OUTCOME,
  ACCOUNT_SECURITY_REVOKE_SESSION_COMPLETED_OUTCOME,
  ACCOUNT_SECURITY_REVOKE_SESSION_FAILED_OUTCOME,
  ACCOUNT_SECURITY_REVOKE_OTHER_SESSIONS_COMPLETED_OUTCOME,
  ACCOUNT_SECURITY_REVOKE_OTHER_SESSIONS_FAILED_OUTCOME,
] as const;

export type AccountSecuritySanitizedOutcome =
  (typeof accountSecuritySanitizedOutcomes)[number];