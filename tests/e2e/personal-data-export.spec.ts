import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { source as axeSource } from "axe-core";

import {
  cleanupAuthenticatedUsers,
  installAuthSessionCookie,
  revokeAuthenticatedSession,
  seedAuthenticatedUser,
} from "./helpers/authenticated-user";
import {
  configureNextPersonalDataExportProviderSend,
  getLatestPersonalDataExportConfirmationUrl,
  getPersonalDataExportProviderRequests,
} from "./helpers/personal-data-export";

const localeJourneys = [
  {
    locale: "en",
    path: "/account/data",
    title: "Download your data",
    request: "Request data export",
    sent: "Check your email for a confirmation link.",
    ready: "Your export is ready to download.",
    download: "Download data",
    downloaded: "Your data export was downloaded.",
    invalid: "This confirmation link is not valid. Request a new one.",
    deletion: "Permanent account deletion",
  },
  {
    locale: "es",
    path: "/es/account/data",
    title: "Descarga tus datos",
    request: "Solicitar exportación de datos",
    sent: "Consulta tu correo para abrir el enlace de confirmación.",
    ready: "Tu exportación está lista para descargar.",
    download: "Descargar datos",
    downloaded: "Se ha descargado tu exportación de datos.",
    invalid: "Este enlace de confirmación no es válido. Solicita uno nuevo.",
    deletion: "Eliminación permanente de la cuenta",
  },
  {
    locale: "ca",
    path: "/ca/account/data",
    title: "Descarrega les teves dades",
    request: "Sol·licita l'exportació de dades",
    sent: "Consulta el teu correu per obrir l'enllaç de confirmació.",
    ready: "La teva exportació està a punt per baixar.",
    download: "Descarrega les dades",
    downloaded: "S'ha descarregat l'exportació de dades.",
    invalid: "Aquest enllaç de confirmació no és vàlid. Sol·licita'n un de nou.",
    deletion: "Eliminació permanent del compte",
  },
] as const;

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

function getDataExportPanel(page: Page) {
  return page.locator(
    'section[aria-labelledby="personal-data-export-heading"]',
  );
}

async function expectNoSeriousAxeViolations(page: Page) {
  await page.evaluate(axeSource);
  const results: {
    violations: Array<{
      id: string;
      nodes: Array<{ impact?: string | null }>;
    }>;
  } = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axe = (window as any).axe;
    return axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
  });
  expect(
    results.violations.filter((violation) =>
      violation.nodes.some((node) =>
        ["serious", "critical"].includes(node.impact ?? ""),
      ),
    ),
  ).toEqual([]);
}

async function expectExportLayout(page: Page, region: Locator) {
  const layout = await region.evaluate((element) => {
    const root = document.documentElement;
    const visible = (candidate: HTMLElement) => {
      const style = getComputedStyle(candidate);
      const bounds = candidate.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        bounds.width > 0 &&
        bounds.height > 0
      );
    };
    const content = [
      ...element.querySelectorAll<HTMLElement>("h2, p, button"),
    ].filter(visible);
    const directChildren = [...element.children]
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .filter(visible);
    const childBounds = directChildren.map((child) =>
      child.getBoundingClientRect(),
    );
    const buttonBounds = element
      .querySelector<HTMLElement>("button")
      ?.getBoundingClientRect();

    return {
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      clipped: content.filter(
        (candidate) =>
          candidate.scrollWidth > candidate.clientWidth + 1 ||
          candidate.scrollHeight > candidate.clientHeight + 1,
      ).length,
      outOfBounds: content.filter((candidate) => {
        const bounds = candidate.getBoundingClientRect();
        return bounds.left < -0.5 || bounds.right > window.innerWidth + 0.5;
      }).length,
      overlaps: childBounds.filter(
        (bounds, index) =>
          index > 0 && bounds.top < childBounds[index - 1]!.bottom - 0.5,
      ).length,
      buttonWidth: buttonBounds?.width ?? 0,
      buttonHeight: buttonBounds?.height ?? 0,
    };
  });

  expect(layout).toEqual({
    horizontalOverflow: false,
    clipped: 0,
    outOfBounds: 0,
    overlaps: 0,
    buttonWidth: expect.any(Number),
    buttonHeight: expect.any(Number),
  });
  expect(layout.buttonWidth).toBeGreaterThanOrEqual(44);
  expect(layout.buttonHeight).toBeGreaterThanOrEqual(44);
}

test.describe.configure({ mode: "serial" });

test.afterEach(async () => {
  await cleanupAuthenticatedUsers();
});

test("redirects signed-out localized data pages through fixed login callbacks", async ({
  page,
}) => {
  for (const [path, expected] of [
    ["/account/data", "/login?callbackUrl=%2Faccount%2Fdata"],
    ["/es/account/data", "/es/login?callbackUrl=%2Fes%2Faccount%2Fdata"],
    ["/ca/account/data", "/ca/login?callbackUrl=%2Fca%2Faccount%2Fdata"],
  ] as const) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  }
});

test("completes a localized keyboard-only explicit download in every supported locale", async ({
  context,
  page,
  baseURL,
}) => {
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  const automaticDownloads: string[] = [];
  page.on("download", (download) => automaticDownloads.push(download.suggestedFilename()));

  for (const target of localeJourneys) {
    const seeded = await seedAuthenticatedUser({
      accountCount: 2,
      additionalSessionCount: 1,
      withDataExportFixtures: true,
    });
    await installAuthSessionCookie(context, seeded.sessionToken, appUrl);

    await page.goto(target.path);
    const requestButton = page.getByRole("button", { name: target.request });
    await tabTo(page, requestButton);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toHaveText(target.sent);
    const confirmation = new URL(
      await getLatestPersonalDataExportConfirmationUrl(seeded.email),
    );
    const downloadCountBeforeConfirmation = automaticDownloads.length;
    await page.goto(`${appUrl}${confirmation.pathname}${confirmation.search}`);
    await expect(page).toHaveURL(
      new RegExp(`${target.path.replaceAll("/", "\\/")}\\?exportState=ready$`, "u"),
    );
    const readyStatus = page.getByRole("status");
    await expect(readyStatus).toHaveText(target.ready);
    await expect(readyStatus).toBeFocused();
    expect(automaticDownloads).toHaveLength(downloadCountBeforeConfirmation);

    const downloadButton = page.getByRole("button", { name: target.download });
    await tabTo(page, downloadButton);
    const [download, response] = await Promise.all([
      page.waitForEvent("download"),
      page.waitForResponse((candidate) =>
        candidate.url().endsWith("/api/account/data-export/download"),
      ),
      page.keyboard.press("Enter"),
    ]);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers()["cache-control"]).toBe("no-store, private");
    expect(response.headers().pragma).toBe("no-cache");
    expect(Number(response.headers()["content-length"])).toBeGreaterThan(0);
    expect(download.suggestedFilename()).toMatch(
      /^personal-data-export-[0-9]{8}T[0-9]{6}Z\.json$/u,
    );
    expect(download.suggestedFilename()).not.toContain(seeded.email);
    const path = await download.path();
    if (!path) throw new Error("download path was unavailable");
    const envelope = JSON.parse(await readFile(path, "utf8")) as {
      schemaVersion: number;
      manifest: { includedSections: Array<{ namespace: string }> };
    };
    expect(envelope.schemaVersion).toBe(1);
    expect(
      envelope.manifest.includedSections.map(({ namespace }) => namespace),
    ).toEqual(["account", "activeSessions", "policyAcceptances"]);
    await expect(page.getByRole("status")).toHaveText(target.downloaded);
  }
});

test("binds a confirmation opened in another same-account browser to only that Session", async ({
  browser,
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser({
    additionalSessionCount: 1,
    withDataExportFixtures: true,
  });
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionTokens[0]!, appUrl);
  await page.goto("/account/data");
  await page.getByRole("button", { name: "Request data export" }).click();
  await expect(
    page.getByText("Check your email for a confirmation link."),
  ).toBeVisible();
  const confirmation = new URL(
    await getLatestPersonalDataExportConfirmationUrl(seeded.email),
  );

  const otherContext = await browser.newContext();
  try {
    await installAuthSessionCookie(otherContext, seeded.sessionTokens[1]!, appUrl);
    const otherPage = await otherContext.newPage();
    await otherPage.goto(`${appUrl}${confirmation.pathname}${confirmation.search}`);
    await expect(
      otherPage.getByRole("button", { name: "Download data" }),
    ).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("button", { name: "Request data export" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Download data" }),
    ).toHaveCount(0);
  } finally {
    await otherContext.close();
  }
});

test("retries a rejected delivery only after an explicit action", async ({
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser();
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);
  await configureNextPersonalDataExportProviderSend(seeded.email, {
    status: 503,
    body: JSON.stringify({ status: "unavailable" }),
  });

  await page.goto("/account/data");
  await page.getByRole("button", { name: "Request data export" }).click();
  const alert = getDataExportPanel(page).getByRole("alert");
  await expect(alert).toHaveText("Couldn’t send the confirmation. Try again.");
  await expect(alert).toBeFocused();
  await expect
    .poll(async () =>
      (await getPersonalDataExportProviderRequests(seeded.email)).length,
    )
    .toBe(1);
  await page.waitForTimeout(150);
  expect(await getPersonalDataExportProviderRequests(seeded.email)).toHaveLength(1);

  await page
    .getByRole("button", { name: "Request new confirmation" })
    .click();
  await expect(page.getByRole("status")).toHaveText(
    "Check your email for a confirmation link.",
  );
  expect(await getPersonalDataExportProviderRequests(seeded.email)).toHaveLength(2);
});

test("preserves the previously delivered link when a newer delivery fails", async ({
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser();
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);

  await page.goto("/account/data");
  await page.getByRole("button", { name: "Request data export" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Check your email for a confirmation link.",
  );
  const previousConfirmation = new URL(
    await getLatestPersonalDataExportConfirmationUrl(seeded.email),
  );
  await configureNextPersonalDataExportProviderSend(seeded.email, {
    status: 503,
  });
  await page
    .getByRole("button", { name: "Request new confirmation" })
    .click();
  await expect(getDataExportPanel(page).getByRole("alert")).toHaveText(
    "Couldn’t send the confirmation. Try again.",
  );

  await page.goto(
    `${appUrl}${previousConfirmation.pathname}${previousConfirmation.search}`,
  );
  await expect(page).toHaveURL(/\/account\/data\?exportState=ready$/u);
  await expect(page.getByRole("button", { name: "Download data" })).toBeVisible();
});

test("does not authenticate, consume, or download when a signed-out visitor opens a link", async ({
  browser,
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser();
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);
  await page.goto("/account/data");
  await page.getByRole("button", { name: "Request data export" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Check your email for a confirmation link.",
  );
  const confirmation = new URL(
    await getLatestPersonalDataExportConfirmationUrl(seeded.email),
  );

  const anonymousContext = await browser.newContext();
  try {
    const anonymousPage = await anonymousContext.newPage();
    const downloads: string[] = [];
    anonymousPage.on("download", (download) =>
      downloads.push(download.suggestedFilename()),
    );
    await anonymousPage.goto(
      `${appUrl}${confirmation.pathname}${confirmation.search}`,
    );
    await expect(anonymousPage).toHaveURL(
      /\/login\?callbackUrl=%2Faccount%2Fdata$/u,
    );
    expect(anonymousPage.url()).not.toContain("token=");
    expect(
      (await anonymousContext.cookies(appUrl)).filter((cookie) =>
        cookie.name.includes("session-token"),
      ),
    ).toEqual([]);
    expect(downloads).toEqual([]);
  } finally {
    await anonymousContext.close();
  }

  await page.goto(`${appUrl}${confirmation.pathname}${confirmation.search}`);
  await expect(page.getByRole("button", { name: "Download data" })).toBeVisible();
});

test("uses one generic outcome for a conflicting confirmation link", async ({
  browser,
  context,
  page,
  baseURL,
}) => {
  const owner = await seedAuthenticatedUser();
  const conflictingUser = await seedAuthenticatedUser();
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  const automaticDownloads: string[] = [];
  page.on("download", (download) =>
    automaticDownloads.push(download.suggestedFilename()),
  );
  await installAuthSessionCookie(context, owner.sessionToken, appUrl);
  await page.goto("/account/data");
  await page.getByRole("button", { name: "Request data export" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Check your email for a confirmation link.",
  );
  const confirmation = new URL(
    await getLatestPersonalDataExportConfirmationUrl(owner.email),
  );

  const conflictingContext = await browser.newContext();
  try {
    await installAuthSessionCookie(
      conflictingContext,
      conflictingUser.sessionToken,
      appUrl,
    );
    const conflictingPage = await conflictingContext.newPage();
    await conflictingPage.goto(
      `${appUrl}${confirmation.pathname}${confirmation.search}`,
    );
    await expect(conflictingPage).toHaveURL(
      /\/account\/data\?exportState=invalid$/u,
    );
    const conflictCopy = await getDataExportPanel(conflictingPage)
      .getByRole("alert")
      .textContent();
    expect(conflictCopy).toBe(
      "This confirmation link is not valid. Request a new one.",
    );
    expect(conflictingPage.url()).not.toContain("token=");
    await conflictingPage.goto(`${appUrl}/account/data`);
    await expect(
      conflictingPage.getByRole("button", { name: "Download data" }),
    ).toHaveCount(0);

    expect(automaticDownloads).toEqual([]);
  } finally {
    await conflictingContext.close();
  }
});

for (const target of localeJourneys) {
  test(`keeps a ready ${target.locale} grant usable after replaying its confirmation link`, async ({
    context,
    page,
    baseURL,
  }) => {
    const owner = await seedAuthenticatedUser();
    const appUrl = baseURL ?? "http://127.0.0.1:3100";
    const automaticDownloads: string[] = [];
    page.on("download", (download) =>
      automaticDownloads.push(download.suggestedFilename()),
    );
    await installAuthSessionCookie(context, owner.sessionToken, appUrl);
    await page.goto(target.path);
    await page.getByRole("button", { name: target.request }).click();
    await expect(page.getByRole("status")).toHaveText(target.sent);
    const confirmation = new URL(
      await getLatestPersonalDataExportConfirmationUrl(owner.email),
    );

    await page.goto(`${appUrl}${confirmation.pathname}${confirmation.search}`);
    await expect(page).toHaveURL(
      new RegExp(`${target.path.replaceAll("/", "\\/")}\\?exportState=ready$`, "u"),
    );
    await expect(page.getByRole("button", { name: target.download })).toBeVisible();

    await page.goto(`${appUrl}${confirmation.pathname}${confirmation.search}`);
    await expect(page).toHaveURL(
      new RegExp(`${target.path.replaceAll("/", "\\/")}\\?exportState=invalid$`, "u"),
    );
    await expect(getDataExportPanel(page).getByRole("alert")).toHaveText(
      target.invalid,
    );
    await expect(page.getByRole("button", { name: target.download })).toBeEnabled();
    expect(page.url()).not.toContain("token=");
    expect(automaticDownloads).toEqual([]);
  });
}

test("fails closed when the requesting session is revoked before confirmation", async ({
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser();
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  const automaticDownloads: string[] = [];
  page.on("download", (download) =>
    automaticDownloads.push(download.suggestedFilename()),
  );
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);
  await page.goto("/account/data");
  await page.getByRole("button", { name: "Request data export" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Check your email for a confirmation link.",
  );
  const confirmation = new URL(
    await getLatestPersonalDataExportConfirmationUrl(seeded.email),
  );
  await revokeAuthenticatedSession(seeded.sessionId);

  await page.goto(`${appUrl}${confirmation.pathname}${confirmation.search}`);
  await expect(page).toHaveURL(
    /\/login\?callbackUrl=%2Faccount%2Fdata$/u,
  );
  expect(page.url()).not.toContain("token=");
  expect(automaticDownloads).toEqual([]);
});

test("shows a generic account-limit wait without contacting the provider", async ({
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser({
    withDataExportFixtures: true,
    rateLimitCount: 3,
  });
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);
  await page.goto("/account/data");

  const responsePromise = page.waitForResponse((response) =>
    response.url().endsWith("/api/account/data-export/request"),
  );
  await page.getByRole("button", { name: "Request data export" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(429);
  expect(Number(response.headers()["retry-after"])).toBeGreaterThan(0);
  const alert = getDataExportPanel(page).getByRole("alert");
  await expect(alert).toContainText("Too many attempts. Try again in");
  await expect(alert).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Request new confirmation" }),
  ).toBeDisabled();
  expect(await getPersonalDataExportProviderRequests(seeded.email)).toEqual([]);
});

test("maps timeout and oversize failures to one retryable state without a partial download", async ({
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser({
    withDataExportAuthorization: true,
  });
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);
  await page.goto("/account/data");

  for (const cause of ["timeout", "oversize"] as const) {
    let attempts = 0;
    await page.route("**/api/account/data-export/download", async (route) => {
      attempts += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "x-e2e-boundary": cause },
        body: JSON.stringify({ status: "unavailable" }),
      });
    });
    const responsePromise = page.waitForResponse((response) =>
      response.url().endsWith("/api/account/data-export/download"),
    );
    await page.getByRole("button", { name: "Download data" }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(503);
    expect(response.headers()["content-disposition"]).toBeUndefined();
    const alert = getDataExportPanel(page).getByRole("alert");
    await expect(alert).toHaveText("Couldn’t prepare your export. Try again.");
    await expect(alert).toBeFocused();
    await page.waitForTimeout(150);
    expect(attempts).toBe(1);
    expect(downloads).toEqual([]);
    await page.unroute("**/api/account/data-export/download");
  }
});

test("renders an expired authorization with a focused recovery action", async ({
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser({
    withDataExportAuthorization: true,
    dataExportAuthorizationExpiresAt: new Date(Date.now() - 60_000),
  });
  await installAuthSessionCookie(
    context,
    seeded.sessionToken,
    baseURL ?? "http://127.0.0.1:3100",
  );
  await page.goto("/ca/account/data");

  const alert = getDataExportPanel(page).getByRole("alert");
  await expect(alert).toHaveText("L'autorització de baixada ha caducat.");
  await expect(alert).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Sol·licita una confirmació nova" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Descarrega les dades" }),
  ).toHaveCount(0);
});

test("keeps every localized ready state accessible across themes and target viewports", async ({
  context,
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const seeded = await seedAuthenticatedUser({
    withDataExportAuthorization: true,
  });
  await installAuthSessionCookie(
    context,
    seeded.sessionToken,
    baseURL ?? "http://127.0.0.1:3100",
  );

  for (const viewport of [
    { width: 375, height: 667 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto(localeJourneys[0].path);
      await page.evaluate((theme) => {
        window.localStorage.setItem("theme", theme);
      }, colorScheme);
      for (const target of localeJourneys) {
        await context.addCookies([
          {
            name: "NEXT_LOCALE",
            value: target.locale,
            url: new URL(
              baseURL ?? "http://127.0.0.1:3100",
            ).origin,
            sameSite: "Lax",
          },
        ]);
        await page.goto(target.path);
        await expect(page.locator("html")).toHaveAttribute("lang", target.locale);
        await expect
          .poll(() =>
            page.evaluate((theme) =>
              document.documentElement.classList.contains(theme),
            colorScheme),
          )
          .toBe(true);
        const region = page.getByRole("region", { name: target.title });
        await expect(region.getByRole("status")).toHaveText(target.ready);
        const downloadButton = region.getByRole("button", {
          name: target.download,
        });
        await tabTo(page, downloadButton);
        await expectExportLayout(page, region);
        await expectNoSeriousAxeViolations(page);

        const exportBounds = await region.boundingBox();
        const deletionBounds = await page
          .getByRole("heading", { name: target.deletion })
          .boundingBox();
        expect(exportBounds).not.toBeNull();
        expect(deletionBounds).not.toBeNull();
        expect(exportBounds!.y + exportBounds!.height).toBeLessThanOrEqual(
          deletionBounds!.y,
        );
      }
    }
  }
});

test("limits generation before a fourth explicit download", async ({
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser({
    withDataExportAuthorization: true,
  });
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);
  await page.goto("/account/data");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download data" }).click();
    await downloadPromise;
    await expect(page.getByText("Your data export was downloaded.")).toBeVisible();
  }

  const responsePromise = page.waitForResponse(
    (response) => response.url().endsWith("/api/account/data-export/download"),
  );
  await page.getByRole("button", { name: "Download data" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(429);
  await expect(getDataExportPanel(page).getByRole("alert")).toContainText(
    "Too many attempts",
  );
});