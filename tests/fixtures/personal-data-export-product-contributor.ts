import type {
  PersonalDataContribution,
  PersonalDataExportContributor,
  PersonalDataExportReadContext,
  PersonalDataModuleDeclaration,
} from "@/modules/account/data-export/internal-types";

export interface FixtureJournalEntry {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly normalizedTitle: string;
  readonly body: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly globalPrompt: string;
}

export type FixtureProductContributorMode =
  | "present"
  | "empty"
  | "unavailable"
  | "undeclared_unavailable"
  | "omits_material_data"
  | "nondeterministic"
  | "invalid"
  | "throws";

export const fixtureProductDeclaration: PersonalDataModuleDeclaration =
  Object.freeze({
    namespace: "journal.entries",
    schemaVersion: 1,
    classifications: Object.freeze([
      "user_provided",
      "observed",
      "derived",
    ] as const),
    unavailableReasons: Object.freeze(["feature_disabled"] as const),
  });

export const fixtureJournalEntries: readonly FixtureJournalEntry[] =
  Object.freeze([
    Object.freeze({
      id: "hidden-entry-2",
      userId: "hidden-user-id",
      title: "Second note",
      normalizedTitle: "second note",
      body: "A short follow-up.",
      createdAt: new Date("2026-08-22T12:00:00.000Z"),
      updatedAt: new Date("2026-08-23T10:00:00.000Z"),
      globalPrompt: "globally shared editor prompt",
    }),
    Object.freeze({
      id: "hidden-entry-1",
      userId: "hidden-user-id",
      title: "First note",
      normalizedTitle: "first note",
      body: "My private journal text.",
      createdAt: new Date("2026-08-21T12:00:00.000Z"),
      updatedAt: new Date("2026-08-21T13:00:00.000Z"),
      globalPrompt: "globally shared editor prompt",
    }),
  ]);

function compareProjectedEntries(
  left: { observed: { createdAt: string }; userProvided: { title: string } },
  right: { observed: { createdAt: string }; userProvided: { title: string } },
) {
  if (left.observed.createdAt !== right.observed.createdAt) {
    return left.observed.createdAt < right.observed.createdAt ? -1 : 1;
  }
  return left.userProvided.title < right.userProvided.title
    ? -1
    : left.userProvided.title > right.userProvided.title
      ? 1
      : 0;
}

export function createFixtureProductContributor({
  mode = "present",
  entries = fixtureJournalEntries,
}: {
  mode?: FixtureProductContributorMode;
  entries?: readonly FixtureJournalEntry[];
} = {}): PersonalDataExportContributor {
  let invocation = 0;

  return Object.freeze({
    namespace: fixtureProductDeclaration.namespace,
    schemaVersion: fixtureProductDeclaration.schemaVersion,
    async contribute(
      context: PersonalDataExportReadContext,
    ): Promise<PersonalDataContribution> {
      context.signal.throwIfAborted();
      const owner = await context.transaction.user.findUnique({
        where: { id: context.userId },
        select: { id: true },
      });
      context.signal.throwIfAborted();
      if (!owner) throw new Error("fixture owner unavailable");
      if (mode === "throws") throw new Error("fixture contributor failed");
      if (mode === "unavailable") {
        return { status: "unavailable", reason: "feature_disabled" };
      }
      if (mode === "undeclared_unavailable") {
        return { status: "unavailable", reason: "database_failure" };
      }
      if (mode === "invalid") {
        return {
          status: "included",
          data: { forbidden: BigInt(1) },
        } as unknown as PersonalDataContribution;
      }
      if (mode === "empty") return { status: "included", data: [] };

      const projected = entries
        .filter(({ userId }) => userId === context.userId)
        .map((entry) => {
          const userProvided: { title: string; [key: string]: string } = {
            title: entry.title,
          };
          if (mode !== "omits_material_data") userProvided.body = entry.body;
          return {
            userProvided,
            observed: {
              createdAt: entry.createdAt.toISOString(),
              updatedAt: entry.updatedAt.toISOString(),
            },
            derived: {
              characterCount: [...entry.body].length,
              characterCountUnit: "unicode_code_points",
            },
          };
        })
        .sort(compareProjectedEntries);

      if (mode === "nondeterministic") {
        invocation += 1;
        if (invocation % 2 === 0) projected.reverse();
      }
      return { status: "included", data: projected };
    },
  });
}