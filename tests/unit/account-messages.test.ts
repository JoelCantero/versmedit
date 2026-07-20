import { describe, expect, it } from "vitest";

import { accountMessageKeys } from "@/modules/account/messages";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import ca from "@/messages/ca.json";

function getByPath(source: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object") {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

describe("account message catalogs", () => {
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
});