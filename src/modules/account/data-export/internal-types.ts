import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import type {
  JsonValue,
  PersonalDataClassification,
} from "@/modules/account/data-export/types";

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
