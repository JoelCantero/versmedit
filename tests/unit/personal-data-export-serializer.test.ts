// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  canonicalJsonStringify,
  PersonalDataExportSerializationError,
  PersonalDataExportSizeLimitError,
  serializePersonalDataExportEnvelope,
} from "@/modules/account/data-export/serializer";
import type { PersonalDataExportEnvelopeV1 } from "@/modules/account/data-export/types";

function envelope(data: unknown = { zeta: "last", alpha: "é" }) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-23T12:00:00.000Z",
    manifest: {
      includedSections: [{ namespace: "account", schemaVersion: 1 }],
      unavailableSections: [],
    },
    sections: {
      account: { schemaVersion: 1, data },
    },
  } as PersonalDataExportEnvelopeV1;
}

describe("personal data export serializer", () => {
  it("emits the envelope in stable v1 order with recursively sorted keys", () => {
    const first = serializePersonalDataExportEnvelope(envelope(), 100_000);
    const second = serializePersonalDataExportEnvelope(
      envelope({ alpha: "é", zeta: "last" }),
      100_000,
    );

    expect(first.json).toBe(
      '{"schemaVersion":1,"generatedAt":"2026-08-23T12:00:00.000Z","manifest":{"includedSections":[{"namespace":"account","schemaVersion":1}],"unavailableSections":[]},"sections":{"account":{"schemaVersion":1,"data":{"alpha":"é","zeta":"last"}}}}',
    );
    expect(second.json).toBe(first.json);
    expect(new TextDecoder().decode(first.bytes)).toBe(first.json);
    expect(first.byteLength).toBe(Buffer.byteLength(first.json, "utf8"));
    expect(first.byteLength).toBeGreaterThan(first.json.length);
  });

  it("accepts the exact UTF-8 cap and rejects one byte less", () => {
    const baseline = serializePersonalDataExportEnvelope(envelope(), 100_000);
    expect(
      serializePersonalDataExportEnvelope(envelope(), baseline.byteLength)
        .byteLength,
    ).toBe(baseline.byteLength);
    expect(() =>
      serializePersonalDataExportEnvelope(envelope(), baseline.byteLength - 1),
    ).toThrow(PersonalDataExportSizeLimitError);
  });

  it.each([
    ["undefined", { value: undefined }],
    ["bigint", { value: BigInt(1) }],
    ["NaN", { value: Number.NaN }],
    ["Infinity", { value: Number.POSITIVE_INFINITY }],
    ["Date", { value: new Date() }],
    ["Map", { value: new Map() }],
    ["function", { value: () => undefined }],
  ])("rejects non-JSON %s values", (_label, value) => {
    expect(() => canonicalJsonStringify(value)).toThrow(
      PersonalDataExportSerializationError,
    );
  });

  it("rejects cyclic data", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(() => canonicalJsonStringify(value)).toThrow(
      PersonalDataExportSerializationError,
    );
  });

  it("rejects invalid timestamps and manifest/section disagreement", () => {
    expect(() =>
      serializePersonalDataExportEnvelope(
        { ...envelope(), generatedAt: "not-a-date" },
        100_000,
      ),
    ).toThrow(PersonalDataExportSerializationError);
    expect(() =>
      serializePersonalDataExportEnvelope(
        { ...envelope(), sections: {} },
        100_000,
      ),
    ).toThrow(PersonalDataExportSerializationError);
  });
});