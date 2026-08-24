// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  PersonalDataExportSerializationError,
  serializePersonalDataExportEnvelope,
} from "@/modules/account/data-export/serializer";
import type { PersonalDataExportEnvelopeV1 } from "@/modules/account/data-export/types";

function envelope(): PersonalDataExportEnvelopeV1 {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-23T12:00:00.000Z",
    manifest: {
      includedSections: [
        { namespace: "account", schemaVersion: 1 },
        { namespace: "journal.entries", schemaVersion: 7 },
      ],
      unavailableSections: [],
    },
    sections: {
      account: { schemaVersion: 1, data: {} },
      "journal.entries": { schemaVersion: 7, data: [] },
    },
  };
}

describe("personal data export envelope compatibility", () => {
  it("accepts an unknown future namespace with an independent section version", () => {
    const serialized = serializePersonalDataExportEnvelope(envelope(), 100_000);
    expect(serialized.envelope.schemaVersion).toBe(1);
    expect(serialized.envelope.sections["journal.entries"]?.schemaVersion).toBe(7);
  });

  it("allows one section to evolve without changing the envelope or another section", () => {
    const baseline = envelope();
    const evolved: PersonalDataExportEnvelopeV1 = {
      ...baseline,
      manifest: {
        ...baseline.manifest,
        includedSections: [
          baseline.manifest.includedSections[0]!,
          { namespace: "journal.entries", schemaVersion: 8 },
        ],
      },
      sections: {
        ...baseline.sections,
        "journal.entries": {
          schemaVersion: 8,
          data: [{ futureField: true }],
        },
      },
    };

    const serialized = serializePersonalDataExportEnvelope(evolved, 100_000);
    expect(serialized.envelope.schemaVersion).toBe(1);
    expect(serialized.envelope.sections.account?.schemaVersion).toBe(1);
    expect(serialized.envelope.sections["journal.entries"]?.schemaVersion).toBe(8);
  });

  it("rejects manifest/section disagreement and incompatible envelopes", () => {
    const baseline = envelope();
    const mismatched: PersonalDataExportEnvelopeV1 = {
      ...baseline,
      sections: {
        ...baseline.sections,
        "journal.entries": { schemaVersion: 6, data: [] },
      },
    };
    expect(() =>
      serializePersonalDataExportEnvelope(mismatched, 100_000),
    ).toThrow(PersonalDataExportSerializationError);

    expect(() =>
      serializePersonalDataExportEnvelope(
        { ...envelope(), schemaVersion: 2 } as unknown as PersonalDataExportEnvelopeV1,
        100_000,
      ),
    ).toThrow(PersonalDataExportSerializationError);
  });
});