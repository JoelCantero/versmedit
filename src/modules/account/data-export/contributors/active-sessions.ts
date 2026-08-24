import "server-only";

import { canonicalJsonStringify } from "@/modules/account/data-export/serializer";
import type {
  PersonalDataContribution,
  PersonalDataExportContributor,
  PersonalDataExportReadContext,
  PersonalDataModuleDeclaration,
} from "@/modules/account/data-export/types";
import { RECENT_AUTHENTICATION_MS } from "@/modules/account/session";

export const activeSessionsDataExportDeclaration = Object.freeze({
  namespace: "activeSessions",
  schemaVersion: 1,
  classifications: Object.freeze(["observed", "derived"] as const),
  unavailableReasons: Object.freeze([] as const),
}) satisfies PersonalDataModuleDeclaration;

interface ActiveSessionProjection {
  observed: {
    createdAt: string | null;
    expiresAt: string;
    authenticatedAt: string | null;
  };
  derived: {
    current: boolean;
    recentlyAuthenticated: boolean;
  };
}

function compareNullableTimestamp(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

function compareSessionProjections(
  left: ActiveSessionProjection,
  right: ActiveSessionProjection,
) {
  const leftObserved = left.observed;
  const rightObserved = right.observed;
  for (const key of ["createdAt", "expiresAt", "authenticatedAt"] as const) {
    const compared = compareNullableTimestamp(
      leftObserved[key],
      rightObserved[key],
    );
    if (compared !== 0) return compared;
  }
  const leftCurrent = left.derived.current;
  const rightCurrent = right.derived.current;
  if (leftCurrent !== rightCurrent) return leftCurrent ? 1 : -1;
  const leftCanonical = canonicalJsonStringify(left);
  const rightCanonical = canonicalJsonStringify(right);
  return leftCanonical < rightCanonical
    ? -1
    : leftCanonical > rightCanonical
      ? 1
      : 0;
}

export const activeSessionsDataExportContributor: PersonalDataExportContributor = Object.freeze({
  namespace: activeSessionsDataExportDeclaration.namespace,
  schemaVersion: activeSessionsDataExportDeclaration.schemaVersion,
  async contribute(
    context: PersonalDataExportReadContext,
  ): Promise<PersonalDataContribution> {
    context.signal.throwIfAborted();
    const sessions = await context.transaction.session.findMany({
      where: {
        userId: context.userId,
        expires: { gt: context.generatedAt },
      },
      select: {
        id: true,
        createdAt: true,
        expires: true,
        authenticatedAt: true,
      },
    });
    context.signal.throwIfAborted();

    const data = sessions
      .map((session) => {
        const authenticationTime = session.authenticatedAt?.getTime();
        const generatedTime = context.generatedAt.getTime();
        return {
          observed: {
            createdAt: session.createdAt?.toISOString() ?? null,
            expiresAt: session.expires.toISOString(),
            authenticatedAt: session.authenticatedAt?.toISOString() ?? null,
          },
          derived: {
            current: session.id === context.currentSessionId,
            recentlyAuthenticated:
              authenticationTime !== undefined &&
              authenticationTime <= generatedTime &&
              authenticationTime >= generatedTime - RECENT_AUTHENTICATION_MS,
          },
        };
      })
      .sort(compareSessionProjections);

    return { status: "included", data };
  },
});