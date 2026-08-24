import type { Prisma } from "@/generated/prisma/client";

import type { AccountLocale } from "@/modules/account/types";

export const PERSONAL_DATA_EXPORT_ENVELOPE_SCHEMA_VERSION = 1 as const;

export const personalDataClassifications = [
  "user_provided",
  "observed",
  "derived",
] as const;

export type PersonalDataClassification =
  (typeof personalDataClassifications)[number];

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface PersonalDataModuleDeclaration {
  readonly namespace: string;
  readonly schemaVersion: number;
  readonly classifications: readonly PersonalDataClassification[];
  readonly unavailableReasons: readonly string[];
}

export interface PersonalDataExportReadContext {
  readonly userId: string;
  readonly currentSessionId: string;
  readonly generatedAt: Date;
  readonly transaction: Prisma.TransactionClient;
  readonly signal: AbortSignal;
}

export type PersonalDataContribution =
  | { readonly status: "included"; readonly data: JsonValue }
  | { readonly status: "unavailable"; readonly reason: string };

export interface PersonalDataExportContributor {
  readonly namespace: string;
  readonly schemaVersion: number;
  contribute(
    context: PersonalDataExportReadContext,
  ): Promise<PersonalDataContribution>;
}

export interface PersonalDataExportRegistry {
  readonly namespaces: readonly string[];
  readonly declarations: readonly PersonalDataModuleDeclaration[];
  readonly contributors: readonly PersonalDataExportContributor[];
  getDeclaration(namespace: string): PersonalDataModuleDeclaration | undefined;
  getContributor(namespace: string): PersonalDataExportContributor | undefined;
}

export interface PersonalDataExportIncludedManifestEntry {
  readonly namespace: string;
  readonly schemaVersion: number;
}

export interface PersonalDataExportUnavailableManifestEntry
  extends PersonalDataExportIncludedManifestEntry {
  readonly reason: string;
}

export interface PersonalDataExportManifest {
  readonly includedSections: readonly PersonalDataExportIncludedManifestEntry[];
  readonly unavailableSections: readonly PersonalDataExportUnavailableManifestEntry[];
}

export interface PersonalDataExportSection {
  readonly schemaVersion: number;
  readonly data: JsonValue;
}

export interface PersonalDataExportEnvelopeV1 {
  readonly schemaVersion: typeof PERSONAL_DATA_EXPORT_ENVELOPE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly manifest: PersonalDataExportManifest;
  readonly sections: Readonly<Record<string, PersonalDataExportSection>>;
}

export interface SerializedPersonalDataExport {
  readonly envelope: PersonalDataExportEnvelopeV1;
  readonly json: string;
  readonly bytes: Uint8Array;
  readonly byteLength: number;
}

export interface PersonalDataExportGenerationLimits {
  readonly maxBytes: number;
  readonly timeoutMs: number;
}

export type PersonalDataExportAuthorizationState =
  | { readonly status: "absent" }
  | { readonly status: "expired" }
  | { readonly status: "ready"; readonly expiresAt: string };

export interface PersonalDataExportCommand {
  readonly csrfToken: string;
  readonly locale: AccountLocale;
}

export type PersonalDataExportProblemStatus =
  | "invalid_request"
  | "unauthenticated"
  | "forbidden"
  | "rate_limited"
  | "unavailable"
  | "not_ready";

export type PersonalDataExportRequestResult =
  | { readonly status: "sent" }
  | {
      readonly status: PersonalDataExportProblemStatus;
      readonly retryAfter?: number;
      readonly redirectTo?: string;
    };

export type PersonalDataExportVerificationResult = {
  readonly status: "ready" | "invalid" | "rate_limited";
  readonly locale: AccountLocale;
  readonly retryAfter?: number;
  readonly auditOutcome?: "confirmation_expired";
};

export type PersonalDataExportGenerationResult =
  | { readonly status: "completed"; readonly export: SerializedPersonalDataExport }
  | {
      readonly status: PersonalDataExportProblemStatus;
      readonly retryAfter?: number;
      readonly auditOutcome?: "contributor_failed";
    };

export const personalDataExportSanitizedOutcomes = [
  "request_sent",
  "request_failed",
  "request_rate_limited",
  "confirmation_completed",
  "confirmation_rejected",
  "confirmation_expired",
  "confirmation_rate_limited",
  "generation_failed",
  "generation_expired",
  "generation_rate_limited",
  "contributor_failed",
  "download_completed",
] as const;

export type PersonalDataExportSanitizedOutcome =
  (typeof personalDataExportSanitizedOutcomes)[number];