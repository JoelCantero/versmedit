import type {
  PersonalDataExportContributor,
  PersonalDataExportRegistry,
  PersonalDataModuleDeclaration,
} from "@/modules/account/data-export/internal-types";
import {
  personalDataClassifications,
  type PersonalDataClassification,
} from "@/modules/account/data-export/types";

const NAMESPACE_PATTERN =
  /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/u;
const UNAVAILABLE_REASON_PATTERN = /^[a-z][a-z0-9_]*$/u;

function registryError(message: string): never {
  throw new Error(`Invalid personal data export registry: ${message}`);
}

function assertUnique(values: readonly string[], description: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) registryError(`duplicate ${description} ${value}`);
    seen.add(value);
  }
}

function validateNamespace(namespace: string) {
  if (namespace.length > 128 || !NAMESPACE_PATTERN.test(namespace)) {
    registryError(`invalid namespace ${namespace}`);
  }
}

function validateSchemaVersion(schemaVersion: number, namespace: string) {
  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    registryError(`invalid schema version for ${namespace}`);
  }
}

function validateDeclaration(declaration: PersonalDataModuleDeclaration) {
  validateNamespace(declaration.namespace);
  validateSchemaVersion(declaration.schemaVersion, declaration.namespace);
  assertUnique(declaration.classifications, "classification");
  for (const classification of declaration.classifications) {
    if (
      !personalDataClassifications.includes(
        classification as PersonalDataClassification,
      )
    ) {
      registryError(`invalid classification for ${declaration.namespace}`);
    }
  }
  assertUnique(declaration.unavailableReasons, "unavailable reason");
  for (const reason of declaration.unavailableReasons) {
    if (reason.length > 64 || !UNAVAILABLE_REASON_PATTERN.test(reason)) {
      registryError(`invalid unavailable reason for ${declaration.namespace}`);
    }
  }
}

function copyDeclaration(
  declaration: PersonalDataModuleDeclaration,
): PersonalDataModuleDeclaration {
  return Object.freeze({
    namespace: declaration.namespace,
    schemaVersion: declaration.schemaVersion,
    classifications: Object.freeze([...declaration.classifications]),
    unavailableReasons: Object.freeze([...declaration.unavailableReasons]),
  });
}

function copyContributor(
  contributor: PersonalDataExportContributor,
): PersonalDataExportContributor {
  return Object.freeze({
    namespace: contributor.namespace,
    schemaVersion: contributor.schemaVersion,
    contribute: contributor.contribute.bind(contributor),
  });
}

export function createPersonalDataExportRegistry(
  declarationsInput: readonly PersonalDataModuleDeclaration[],
  contributorsInput: readonly PersonalDataExportContributor[],
): PersonalDataExportRegistry {
  const declarationNamespaces = declarationsInput.map(
    ({ namespace }) => namespace,
  );
  const contributorNamespaces = contributorsInput.map(
    ({ namespace }) => namespace,
  );
  assertUnique(declarationNamespaces, "declaration namespace");
  assertUnique(contributorNamespaces, "contributor namespace");

  for (const declaration of declarationsInput) {
    validateDeclaration(declaration);
  }
  for (const contributor of contributorsInput) {
    validateNamespace(contributor.namespace);
    validateSchemaVersion(contributor.schemaVersion, contributor.namespace);
    if (typeof contributor.contribute !== "function") {
      registryError(`missing contributor function for ${contributor.namespace}`);
    }
  }

  const declarationsByNamespace = new Map(
    declarationsInput.map((declaration) => [
      declaration.namespace,
      copyDeclaration(declaration),
    ]),
  );
  const contributorsByNamespace = new Map(
    contributorsInput.map((contributor) => [
      contributor.namespace,
      copyContributor(contributor),
    ]),
  );

  for (const [namespace, declaration] of declarationsByNamespace) {
    const contributor = contributorsByNamespace.get(namespace);
    if (!contributor) registryError(`missing contributor for ${namespace}`);
    if (contributor.schemaVersion !== declaration.schemaVersion) {
      registryError(`schema version mismatch for ${namespace}`);
    }
  }
  for (const namespace of contributorsByNamespace.keys()) {
    if (!declarationsByNamespace.has(namespace)) {
      registryError(`undeclared contributor ${namespace}`);
    }
  }

  const namespaces = Object.freeze(
    [...declarationsByNamespace.keys()].sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
  const declarations = Object.freeze(
    namespaces.map((namespace) => declarationsByNamespace.get(namespace)!),
  );
  const contributors = Object.freeze(
    namespaces.map((namespace) => contributorsByNamespace.get(namespace)!),
  );

  return Object.freeze({
    namespaces,
    declarations,
    contributors,
    getDeclaration(namespace: string) {
      return declarationsByNamespace.get(namespace);
    },
    getContributor(namespace: string) {
      return contributorsByNamespace.get(namespace);
    },
  });
}