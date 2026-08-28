// @vitest-environment node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  EMAIL_LOCALES,
  EMAIL_VARIANTS,
} from "@/lib/email/presentation";
import { createPreviewBrand } from "../../emails/lib/preview-fixtures";
import { previewManifest } from "../../emails/lib/preview-manifest";

const reservedHostPattern = /(?:^|\.)example\.(?:com|net|org|test)$/u;

describe("email preview catalogue", () => {
  it("keeps both preview control groups deferred to the preview application", async () => {
    const inspectionControls = await readFile(
      path.join(process.cwd(), "emails/components/preview-inspector.tsx"),
      "utf8",
    );
    const viewportControls = await readFile(
      path.join(process.cwd(), "emails/components/viewport-control.tsx"),
      "utf8",
    );

    for (const source of [inspectionControls, viewportControls]) {
      expect(source).not.toMatch(/@\/components\/ui/u);
      expect(source).not.toMatch(/<(?:Checkbox|Alert|Badge|Separator)\b/u);
    }
  });

  it("accepts only validated, explicitly forwarded public brand values", () => {
    const configured = createPreviewBrand({
      PROJECT_NAME: "Example Workspace Local",
      EMAIL_PREVIEW_BRAND_COLOR: "#0e79b2",
      EMAIL_PREVIEW_SUPPORT_EMAIL: "support@example.test",
      EMAIL_PREVIEW_LOGO_URL: "",
      AUTH_SECRET: "must-not-be-read",
      MAIL_API_KEY: "must-not-be-read",
    });

    expect(configured).toEqual({
      productName: "Example Workspace Local",
      canonicalOrigin: "https://app.example.test",
      primaryColor: "#0E79B2",
      actionForeground: "#FFFFFF",
      supportEmail: "support@example.test",
      logoUrl: null,
    });
    expect(Object.isFrozen(configured)).toBe(true);

    expect(
      createPreviewBrand({
        PROJECT_NAME: "Configured deployment name",
        BRAND_COLOR: "#FFFFFF",
        SUPPORT_EMAIL: "ignored@example.test",
      }),
    ).toEqual({
      ...previewManifest[0]!.request.brand,
      productName: "Configured deployment name",
    });
  });

  it("contains the exact stable 12-by-3 Cartesian product", () => {
    const expected = EMAIL_LOCALES.flatMap((locale) =>
      EMAIL_VARIANTS.map((variant) => ({
        key: `${locale}:${variant}`,
        locale,
        variant,
        path: `/${locale}/${variant}`,
      })),
    );

    expect(previewManifest).toHaveLength(36);
    expect(
      previewManifest.map(({ key, locale, variant, path }) => ({
        key,
        locale,
        variant,
        path,
      })),
    ).toEqual(expected);
    expect(new Set(previewManifest.map(({ key }) => key))).toHaveLength(36);
    expect(new Set(previewManifest.map(({ path }) => path))).toHaveLength(36);
  });

  it("uses only frozen, deterministic, obviously fictional fixture data", () => {
    expect(Object.isFrozen(previewManifest)).toBe(true);

    for (const entry of previewManifest) {
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.request)).toBe(true);
      expect(entry.request.locale).toBe(entry.locale);
      expect(entry.request.variant).toBe(entry.variant);
      expect(entry.request.brand.logoUrl).toBeNull();
      expect(
        new URL(entry.request.brand.canonicalOrigin).hostname,
      ).toMatch(reservedHostPattern);
      expect(entry.request.brand.supportEmail.split("@").at(-1)).toMatch(
        reservedHostPattern,
      );

      if ("actionUrl" in entry.request) {
        const actionUrl = new URL(entry.request.actionUrl);
        expect(actionUrl.hostname).toMatch(reservedHostPattern);
        expect(actionUrl.username).toBe("");
        expect(actionUrl.password).toBe("");
        expect([...actionUrl.searchParams.keys()]).not.toEqual(
          expect.arrayContaining([
            "token",
            "secret",
            "password",
            "credential",
            "email",
          ]),
        );
      }
      if ("newEmail" in entry.request) {
        expect(entry.request.newEmail.split("@").at(-1)).toMatch(
          reservedHostPattern,
        );
      }
    }

    const serialized = JSON.stringify(previewManifest);
    expect(serialized).not.toMatch(
      /"(?:recipient|password|secret|credential|apiKey|apiSecret|token)"\s*:/iu,
    );
    expect(serialized).not.toMatch(
      /@(?:gmail|outlook|hotmail|icloud|yahoo)\./iu,
    );
  });
});