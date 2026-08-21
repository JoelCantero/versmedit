import type { AccountLocale } from "@/modules/account/types";

export const ACCOUNT_DELETION_CONFIRMATION = "permanently_delete" as const;
export const ACCOUNT_DELETION_INTENT = "delete" as const;
export const ACCOUNT_DELETION_PENDING_STORAGE_KEY = "account-deletion-pending";

export const accountDeletionUiStates = [
  "closed",
  "reviewing",
  "reauth_required",
  "sending_reauth",
  "reauth_sent",
  "reauth_error",
  "final_ready",
  "deleting",
  "deletion_error",
  "recovering",
] as const;

export type AccountDeletionUiState = (typeof accountDeletionUiStates)[number];

export interface AccountDeletionReauthenticationRequest {
  csrfToken: string;
  locale: AccountLocale;
}

export interface AccountDeletionCommand extends AccountDeletionReauthenticationRequest {
  confirmation: typeof ACCOUNT_DELETION_CONFIRMATION;
}

export interface PendingAccountDeletionSignal {
  locale: AccountLocale;
  expiresAt: number;
}

export type AccountDeletionRedirect =
  | "/account-deleted"
  | "/es/account-deleted"
  | "/ca/account-deleted";

export type AccountDeletionProblemStatus =
  | "invalid_request"
  | "unauthenticated"
  | "forbidden"
  | "rate_limited"
  | "unavailable"
  | "deletion_failed";

export type AccountDeletionReauthenticationResult =
  | { status: "sent" }
  | { status: AccountDeletionProblemStatus; retryAfter?: number; redirectTo?: string };

export type AccountDeletionResult =
  | { status: "completed"; redirectTo: AccountDeletionRedirect }
  | { status: "reauthentication_required" }
  | { status: AccountDeletionProblemStatus; retryAfter?: number; redirectTo?: string };