import { expect, test } from "@playwright/test";

test("serves localized pages with strict CSP and request correlation", async ({
  page,
}) => {
  const cspViolations: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Content Security Policy")) {
      cspViolations.push(message.text());
    }
  });

  const response = await page.goto("/");
  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(response!.headers()["x-request-id"]).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

  const policy = response!.headers()["content-security-policy"];
  expect(policy).toContain("'strict-dynamic'");
  expect(policy).toMatch(/script-src[^;]*'nonce-[^']+'/);
  expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.goto("/es");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  expect(cspViolations).toEqual([]);
});

test("reports database readiness", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    database: "ok",
  });
  expect(response.headers()["x-request-id"]).toBeTruthy();
});