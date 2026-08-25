import { expect, test, type Page } from "@playwright/test";

import { previewManifest } from "../../emails/lib/preview-manifest";

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

function monitorPreviewNetwork(page: Page) {
  const externalRequests: string[] = [];
  const mutationRequests: string[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:", "ws:", "wss:"].includes(url.protocol)) {
      if (!loopbackHosts.has(url.hostname)) externalRequests.push(request.url());
      if (
        ["http:", "https:"].includes(url.protocol) &&
        !["GET", "HEAD"].includes(request.method())
      ) {
        mutationRequests.push(`${request.method()} ${request.url()}`);
      }
    }
  });

  return { externalRequests, mutationRequests };
}

test.describe("isolated email preview catalogue", () => {
  test("lists exactly 36 localized preview routes", async ({ page }) => {
    const network = monitorPreviewNetwork(page);

    const response = await page.goto("/");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Email proofs",
    );
    await expect(page.getByTestId("preview-link")).toHaveCount(36);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
    expect(network.externalRequests).toEqual([]);
    expect(network.mutationRequests).toEqual([]);
  });

  test("opens all 36 routes in display, source, text, desktop, and mobile modes", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const network = monitorPreviewNetwork(page);

    for (const entry of previewManifest) {
      const response = await page.goto(entry.path);

      expect(response?.status(), entry.path).toBe(200);
      await expect(page).toHaveURL(entry.path);
      await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
      await expect(page.getByRole("button", { name: "Display" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      const emailFrame = page.frameLocator('iframe[title="Rendered email"]');
      await expect(emailFrame.locator("body")).toContainText(
        entry.request.brand.productName,
      );

      await page.getByRole("button", { name: "HTML source" }).click();
      await expect(page.getByTestId("html-source")).toContainText(/<!DOCTYPE html/i);

      await page.getByRole("button", { name: "Plain text" }).click();
      await expect(page.getByTestId("plain-text")).toContainText(
        entry.request.brand.productName,
      );

      await page.getByRole("button", { name: "Display" }).click();
      await page.getByRole("button", { name: "Mobile width" }).click();
      await expect(page.getByTestId("preview-viewport")).toHaveAttribute(
        "data-viewport",
        "mobile",
      );
      await expect(page.getByTestId("preview-viewport")).toHaveCSS(
        "width",
        "390px",
      );
      const mobileBox = await page.getByTestId("preview-viewport").boundingBox();
      expect(mobileBox?.width).toBeLessThanOrEqual(420);

      await page.getByRole("button", { name: "Desktop width" }).click();
      await expect(page.getByTestId("preview-viewport")).toHaveAttribute(
        "data-viewport",
        "desktop",
      );

      await expect(page.locator("form, input, textarea, select")).toHaveCount(0);
      const controlNames = await page.locator("button").allTextContents();
      expect(controlNames.join(" ")).not.toMatch(
        /send|deliver|provider|recipient|credential|upload|submit/i,
      );
    }

    expect(network.externalRequests).toEqual([]);
    expect(network.mutationRequests).toEqual([]);
  });

  test("returns not found for routes outside the closed manifest", async ({ page }) => {
    const network = monitorPreviewNetwork(page);

    const response = await page.goto("/en/not-a-preview");

    expect(response?.status()).toBe(404);
    expect(network.externalRequests).toEqual([]);
    expect(network.mutationRequests).toEqual([]);
  });

  test("fits catalogue and proof controls at 320 pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 });
    const network = monitorPreviewNetwork(page);

    await page.goto("/");
    await expect(page.getByTestId("preview-link")).toHaveCount(36);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBe(0);

    await page.goto("/ca/securityAlert");
    await expect(page.getByRole("button", { name: "Plain text" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mobile width" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBe(0);
    expect(
      await page.locator("button").evaluateAll((buttons) =>
        buttons
          .filter(
            (button) =>
              button.scrollWidth > button.clientWidth ||
              button.scrollHeight > button.clientHeight,
          )
          .map((button) => button.textContent?.trim()),
      ),
    ).toEqual([]);

    expect(network.externalRequests).toEqual([]);
    expect(network.mutationRequests).toEqual([]);
  });
});