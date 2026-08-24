import {
  PERSONAL_DATA_EXPORT_ENVELOPE_SCHEMA_VERSION,
  type JsonValue,
  type PersonalDataExportEnvelopeV1,
  type PersonalDataExportIncludedManifestEntry,
  type PersonalDataExportSection,
  type PersonalDataExportUnavailableManifestEntry,
  type SerializedPersonalDataExport,
} from "@/modules/account/data-export/types";

const NAMESPACE_PATTERN =
  /^[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9]*)*$/u;
const UNAVAILABLE_REASON_PATTERN = /^[a-z][a-z0-9_]*$/u;

export class PersonalDataExportSerializationError extends Error {
  constructor() {
    super("Personal data export serialization failed");
    this.name = "PersonalDataExportSerializationError";
  }
}

export class PersonalDataExportSizeLimitError extends Error {
  constructor() {
    super("Personal data export exceeds its configured size limit");
    this.name = "PersonalDataExportSizeLimitError";
  }
}

function serializationError(): never {
  throw new PersonalDataExportSerializationError();
}

function assertNamespace(namespace: string) {
  if (namespace.length > 128 || !NAMESPACE_PATTERN.test(namespace)) {
    serializationError();
  }
}

function assertVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 1) serializationError();
}

function canonicalize(value: unknown, ancestors: Set<object>): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) serializationError();
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") serializationError();
  if (ancestors.has(value)) serializationError();
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) serializationError();
        result.push(canonicalize(value[index], ancestors));
      }
      return result;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      serializationError();
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== "string")) serializationError();

    const source = value as Record<string, unknown>;
    const result: Record<string, JsonValue> = {};
    for (const key of (ownKeys as string[]).sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(source, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        serializationError();
      }
      result[key] = canonicalize(descriptor.value, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

export function toCanonicalJsonValue(value: unknown): JsonValue {
  return canonicalize(value, new Set());
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
  canonicalize(value, new Set());
}

function stringifyCanonical(value: JsonValue): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stringifyCanonical).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stringifyCanonical(value[key] as JsonValue)}`,
    )
    .join(",")}}`;
}

export function canonicalJsonStringify(value: unknown) {
  return stringifyCanonical(toCanonicalJsonValue(value));
}

function assertSortedUniqueNamespaces(entries: readonly { namespace: string }[]) {
  let previous: string | undefined;
  for (const { namespace } of entries) {
    assertNamespace(namespace);
    if (previous !== undefined && previous >= namespace) serializationError();
    previous = namespace;
  }
}

function validateIncludedEntry(entry: PersonalDataExportIncludedManifestEntry) {
  if (
    Reflect.ownKeys(entry).length !== 2 ||
    !("namespace" in entry) ||
    !("schemaVersion" in entry)
  ) {
    serializationError();
  }
  assertNamespace(entry.namespace);
  assertVersion(entry.schemaVersion);
}

function validateUnavailableEntry(
  entry: PersonalDataExportUnavailableManifestEntry,
) {
  if (
    Reflect.ownKeys(entry).length !== 3 ||
    !("namespace" in entry) ||
    !("schemaVersion" in entry) ||
    !("reason" in entry)
  ) {
    serializationError();
  }
  assertNamespace(entry.namespace);
  assertVersion(entry.schemaVersion);
  if (
    entry.reason.length > 64 ||
    !UNAVAILABLE_REASON_PATTERN.test(entry.reason)
  ) {
    serializationError();
  }
}

function validateSection(section: PersonalDataExportSection) {
  if (
    Reflect.ownKeys(section).length !== 2 ||
    !("schemaVersion" in section) ||
    !("data" in section)
  ) {
    serializationError();
  }
  assertVersion(section.schemaVersion);
  return toCanonicalJsonValue(section.data);
}

function normalizeEnvelope(
  envelope: PersonalDataExportEnvelopeV1,
): PersonalDataExportEnvelopeV1 {
  const generatedAt = new Date(envelope.generatedAt);
  if (
    envelope.schemaVersion !== PERSONAL_DATA_EXPORT_ENVELOPE_SCHEMA_VERSION ||
    Number.isNaN(generatedAt.getTime()) ||
    generatedAt.toISOString() !== envelope.generatedAt
  ) {
    serializationError();
  }
  if (
    Reflect.ownKeys(envelope).length !== 4 ||
    Reflect.ownKeys(envelope.manifest).length !== 2
  ) {
    serializationError();
  }

  const includedSections = [...envelope.manifest.includedSections];
  const unavailableSections = [...envelope.manifest.unavailableSections];
  assertSortedUniqueNamespaces(includedSections);
  assertSortedUniqueNamespaces(unavailableSections);
  includedSections.forEach(validateIncludedEntry);
  unavailableSections.forEach(validateUnavailableEntry);

  const includedNames = new Set(includedSections.map(({ namespace }) => namespace));
  for (const { namespace } of unavailableSections) {
    if (includedNames.has(namespace)) serializationError();
  }

  const sectionNames = Object.keys(envelope.sections).sort();
  if (
    sectionNames.length !== includedSections.length ||
    sectionNames.some((namespace, index) => namespace !== includedSections[index]?.namespace)
  ) {
    serializationError();
  }

  const sections: Record<string, PersonalDataExportSection> = {};
  for (const entry of includedSections) {
    const section = envelope.sections[entry.namespace];
    if (!section || section.schemaVersion !== entry.schemaVersion) {
      serializationError();
    }
    sections[entry.namespace] = {
      schemaVersion: section.schemaVersion,
      data: validateSection(section),
    };
  }

  return {
    schemaVersion: PERSONAL_DATA_EXPORT_ENVELOPE_SCHEMA_VERSION,
    generatedAt: envelope.generatedAt,
    manifest: { includedSections, unavailableSections },
    sections,
  };
}

function stringifyEnvelope(envelope: PersonalDataExportEnvelopeV1) {
  const included = envelope.manifest.includedSections
    .map(
      ({ namespace, schemaVersion }) =>
        `{"namespace":${JSON.stringify(namespace)},"schemaVersion":${schemaVersion}}`,
    )
    .join(",");
  const unavailable = envelope.manifest.unavailableSections
    .map(
      ({ namespace, schemaVersion, reason }) =>
        `{"namespace":${JSON.stringify(namespace)},"schemaVersion":${schemaVersion},"reason":${JSON.stringify(reason)}}`,
    )
    .join(",");
  const sections = Object.entries(envelope.sections)
    .map(
      ([namespace, section]) =>
        `${JSON.stringify(namespace)}:{"schemaVersion":${section.schemaVersion},"data":${stringifyCanonical(section.data)}}`,
    )
    .join(",");
  return `{"schemaVersion":${envelope.schemaVersion},"generatedAt":${JSON.stringify(envelope.generatedAt)},"manifest":{"includedSections":[${included}],"unavailableSections":[${unavailable}]},"sections":{${sections}}}`;
}

export function serializePersonalDataExportEnvelope(
  envelopeInput: PersonalDataExportEnvelopeV1,
  maxBytes: number,
): SerializedPersonalDataExport {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new PersonalDataExportSizeLimitError();
  }
  const envelope = normalizeEnvelope(envelopeInput);
  const json = stringifyEnvelope(envelope);
  const bytes = new TextEncoder().encode(json);
  if (bytes.byteLength > maxBytes) throw new PersonalDataExportSizeLimitError();
  return { envelope, json, bytes, byteLength: bytes.byteLength };
}