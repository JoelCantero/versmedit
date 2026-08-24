import { describe, expect, it } from "vitest";

import { accountMessageKeys } from "@/modules/account/messages";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import ca from "@/messages/ca.json";

const accountSecurityMessageKeys = [
  "Account.navigation.security",
  "Account.security.metadata.title",
  "Account.security.metadata.description",
  "Account.security.heading.title",
  "Account.security.heading.description",
  "Account.security.list.title",
  "Account.security.list.description",
  "Account.security.list.ariaLabel",
  "Account.security.list.sessionLabel",
  "Account.security.list.current",
  "Account.security.list.currentOnly",
  "Account.security.timestamps.startedAt",
  "Account.security.timestamps.expiresAt",
  "Account.security.timestamps.unavailable",
  "Account.security.actions.signOut",
  "Account.security.actions.revokeSession",
  "Account.security.actions.revokeOtherSessions",
  "Account.security.dialog.closeLabel",
  "Account.security.dialog.cancel",
  "Account.security.dialog.close",
  "Account.security.dialog.individual.title",
  "Account.security.dialog.individual.description",
  "Account.security.dialog.individual.endSelected",
  "Account.security.dialog.individual.nextRequest",
  "Account.security.dialog.individual.keepOthers",
  "Account.security.dialog.individual.confirm",
  "Account.security.dialog.bulk.title",
  "Account.security.dialog.bulk.description",
  "Account.security.dialog.bulk.endOthers",
  "Account.security.dialog.bulk.includeNew",
  "Account.security.dialog.bulk.keepCurrent",
  "Account.security.dialog.bulk.confirm",
  "Account.security.reauthentication.title",
  "Account.security.reauthentication.description",
  "Account.security.reauthentication.sendLink",
  "Account.security.reauthentication.sent",
  "Account.security.pending.revokingSession",
  "Account.security.pending.revokingOtherSessions",
  "Account.security.pending.sendingLink",
  "Account.security.pending.refreshing",
  "Account.security.recovery.recovering",
  "Account.security.recovery.recovered",
  "Account.security.success.reauthenticated",
  "Account.security.success.revocationCompleted",
  "Account.security.errors.invalidLink",
  "Account.security.errors.sessionConflict",
  "Account.security.errors.sendFailed",
  "Account.security.errors.rateLimited",
  "Account.security.errors.revocationFailed",
  "Account.security.errors.refreshFailed",
  "Account.security.email.subject",
  "Account.security.email.introduction",
  "Account.security.email.action",
] as const;

const personalDataExportMessageKeys = [
  "Account.dataExport.panel.title",
  "Account.dataExport.panel.description",
  "Account.dataExport.panel.sensitiveWarning",
  "Account.dataExport.panel.request",
  "Account.dataExport.panel.requesting",
  "Account.dataExport.panel.sent",
  "Account.dataExport.panel.ready",
  "Account.dataExport.panel.expiringSoon",
  "Account.dataExport.panel.download",
  "Account.dataExport.panel.downloading",
  "Account.dataExport.panel.downloaded",
  "Account.dataExport.panel.expired",
  "Account.dataExport.panel.requestNew",
  "Account.dataExport.panel.invalid",
  "Account.dataExport.panel.requestError",
  "Account.dataExport.panel.downloadError",
  "Account.dataExport.panel.rateLimited",
  "Account.dataExport.panel.availableFor",
  "Account.dataExport.email.subject",
  "Account.dataExport.email.introduction",
  "Account.dataExport.email.sessionRequirement",
  "Account.dataExport.email.expiry",
  "Account.dataExport.email.action",
] as const;

const catalogs = { en, es, ca } as const;
const allowedPlaceholders = new Set(["date", "number", "projectName", "seconds"]);
const forbiddenMetadataTerms = [
  "device",
  "devices",
  "browser",
  "browsers",
  "operating system",
  "user agent",
  "fingerprint",
  "ip address",
  "network address",
  "location",
  "dispositivo",
  "dispositivos",
  "navegador",
  "navegadores",
  "sistema operativo",
  "agente de usuario",
  "huella",
  "dirección ip",
  "dirección de red",
  "ubicación",
  "localización",
  "dispositiu",
  "dispositius",
  "navegadors",
  "sistema operatiu",
  "agent d'usuari",
  "empremta",
  "adreça ip",
  "adreça de xarxa",
  "ubicació",
  "localització",
] as const;

function getByPath(source: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

function getShape(source: unknown, path = "root"): string[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return [`${path}:${Array.isArray(source) ? "array" : typeof source}`];
  }

  const record = source as Record<string, unknown>;
  return [
    `${path}:object`,
    ...Object.keys(record)
      .sort()
      .flatMap((key) => getShape(record[key], `${path}.${key}`)),
  ];
}

function getPlaceholders(value: string) {
  return [...value.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)]
    .map((match) => match[1])
    .sort();
}

describe("account message catalogs", () => {
  it("declares the complete account security message contract", () => {
    expect(accountMessageKeys).toEqual(
      expect.arrayContaining([...accountSecurityMessageKeys]),
    );
  });

  it("declares the complete personal data export message contract", () => {
    expect(accountMessageKeys).toEqual(
      expect.arrayContaining([...personalDataExportMessageKeys]),
    );
  });

  it.each(accountMessageKeys)("contains key %s in all locales", (key) => {
    const enValue = getByPath(en as unknown as Record<string, unknown>, key);
    const esValue = getByPath(es as unknown as Record<string, unknown>, key);
    const caValue = getByPath(ca as unknown as Record<string, unknown>, key);

    expect(typeof enValue).toBe("string");
    expect(typeof esValue).toBe("string");
    expect(typeof caValue).toBe("string");
    expect(String(enValue).trim().length).toBeGreaterThan(0);
    expect(String(esValue).trim().length).toBeGreaterThan(0);
    expect(String(caValue).trim().length).toBeGreaterThan(0);
  });

  it.each(accountSecurityMessageKeys)(
    "contains non-empty security key %s in all locales",
    (key) => {
      for (const catalog of Object.values(catalogs)) {
        const value = getByPath(
          catalog as unknown as Record<string, unknown>,
          key,
        );
        expect(typeof value).toBe("string");
        expect(String(value).trim().length).toBeGreaterThan(0);
      }
    },
  );

  it.each(personalDataExportMessageKeys)(
    "keeps export key %s non-empty and behaviorally equivalent",
    (key) => {
      const values = Object.values(catalogs).map((catalog) =>
        String(
          getByPath(catalog as unknown as Record<string, unknown>, key) ?? "",
        ),
      );
      expect(values.every((value) => value.trim().length > 0)).toBe(true);
      expect(values.map(getPlaceholders)).toEqual([
        getPlaceholders(values[0]!),
        getPlaceholders(values[0]!),
        getPlaceholders(values[0]!),
      ]);
      for (const placeholder of getPlaceholders(values[0]!)) {
        expect(["projectName", "seconds", "time"]).toContain(placeholder);
      }
    },
  );

  it("uses no sensitive export placeholders", () => {
    const serialized = personalDataExportMessageKeys
      .flatMap((key) =>
        Object.values(catalogs).map((catalog) =>
          String(getByPath(catalog as unknown as Record<string, unknown>, key)),
        ),
      )
      .join(" ");
    expect(serialized).not.toMatch(
      /\{(?:email|userId|sessionId|sessionToken|token|digest|filename|namespace|bytes|sections|url)\}/iu,
    );
  });

  it("keeps locale catalog objects structurally identical", () => {
    expect(getShape(es)).toEqual(getShape(en));
    expect(getShape(ca)).toEqual(getShape(en));
  });

  it.each(accountSecurityMessageKeys)(
    "keeps placeholders consistent for %s without sensitive selectors",
    (key) => {
      const values = Object.values(catalogs).map((catalog) =>
        String(
          getByPath(catalog as unknown as Record<string, unknown>, key) ?? "",
        ),
      );
      const placeholders = values.map(getPlaceholders);

      expect(placeholders[1]).toEqual(placeholders[0]);
      expect(placeholders[2]).toEqual(placeholders[0]);
      for (const placeholder of placeholders[0] ?? []) {
        expect(allowedPlaceholders.has(placeholder)).toBe(true);
      }
    },
  );

  it.each(accountSecurityMessageKeys)(
    "does not expose forbidden device or network metadata in %s",
    (key) => {
      for (const catalog of Object.values(catalogs)) {
        const value = String(
          getByPath(catalog as unknown as Record<string, unknown>, key) ?? "",
        ).toLocaleLowerCase();

        for (const term of forbiddenMetadataTerms) {
          expect(value).not.toContain(term);
        }
      }
    },
  );
});