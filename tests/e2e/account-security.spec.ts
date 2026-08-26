import {
  expect,
  test,
  type Locator,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { source as axeSource } from "axe-core";
import { Pool } from "pg";

import caMessages from "../../src/messages/ca.json";
import enMessages from "../../src/messages/en.json";
import esMessages from "../../src/messages/es.json";

import {
  cleanupAuthenticatedUsers,
  installAuthSessionCookie,
  seedAdditionalAuthSession,
  seedAuthenticatedUser,
} from "./helpers/authenticated-user";

const providerControlUrl = process.env.E2E_PROVIDER_HTTP_URL;
const providerTarget = `${process.env.E2E_MAIL_PROVIDER ?? "brevo"}.send`;

interface CapturedProviderRequest {
  target: string;
  body: string;
}

interface SessionSnapshotRow {
  id: string;
  createdAt: Date | null;
  authenticatedAt: Date | null;
}

const localeTargets = [
  {
    locale: "en",
    path: "/account/security",
    accountPath: "/account",
    dataPath: "/account/data",
    messages: enMessages.Account,
  },
  {
    locale: "es",
    path: "/es/account/security",
    accountPath: "/es/account",
    dataPath: "/es/account/data",
    messages: esMessages.Account,
  },
  {
    locale: "ca",
    path: "/ca/account/security",
    accountPath: "/ca/account",
    dataPath: "/ca/account/data",
    messages: caMessages.Account,
  },
] as const;

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for account security E2E tests");
  }
  return new Pool({ connectionString });
}

function requireProviderControlUrl() {
  if (!providerControlUrl) {
    throw new Error("E2E_PROVIDER_HTTP_URL is required for this journey");
  }
  return providerControlUrl;
}

async function configureNextProviderSend(
  recipient: string,
  behavior: { status: number; body?: string },
) {
  const response = await fetch(
    `${requireProviderControlUrl()}/control/behavior`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: providerTarget,
        bodyIncludes: recipient,
        once: true,
        behavior,
      }),
    },
  );
  if (!response.ok) throw new Error("provider fixture behavior was rejected");
}

async function getProviderRequests() {
  const response = await fetch(
    `${requireProviderControlUrl()}/control/requests`,
  );
  if (!response.ok) throw new Error("provider fixture requests were unavailable");
  return (await response.json()) as { requests: CapturedProviderRequest[] };
}

async function getLatestSecurityVerificationUrl(recipient: string) {
  const capture = await getProviderRequests();
  const sendRequest = capture.requests.findLast(
    (request) =>
      request.target === providerTarget && request.body.includes(recipient),
  );
  const verificationUrl = sendRequest?.body.match(
    /https?:\/\/[^\s<"\\]+\/api\/account\/security\/verify\?token=[A-Za-z0-9_-]{43}/,
  )?.[0];
  if (!verificationUrl) {
    throw new Error("security verification URL was not captured");
  }
  return verificationUrl;
}

async function getProviderSendCount(recipient: string) {
  const capture = await getProviderRequests();
  return capture.requests.filter(
    (request) =>
      request.target === providerTarget && request.body.includes(recipient),
  ).length;
}

async function countAccountSessions(userId: string) {
  const pool = getPool();
  try {
    const result = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count" FROM "Session" WHERE "userId" = $1 AND "expires" > NOW()`,
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await pool.end();
  }
}

async function countSecurityTokens(normalizedEmail: string) {
  const pool = getPool();
  try {
    const result = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count" FROM "VerificationToken" WHERE "identifier" = $1 AND "purpose" = 'ACCOUNT_SECURITY'`,
      [normalizedEmail],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await pool.end();
  }
}

async function captureSessionSnapshot(userId: string) {
  const pool = getPool();
  try {
    const result = await pool.query<SessionSnapshotRow>(
      `SELECT "id", "createdAt", "authenticatedAt" FROM "Session" WHERE "userId" = $1 ORDER BY "id"`,
      [userId],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

function sameTime(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

async function compareSessionSnapshot(
  before: SessionSnapshotRow[],
  userId: string,
  refreshedSessionId: string,
) {
  const after = await captureSessionSnapshot(userId);
  const beforeById = new Map(before.map((row) => [row.id, row]));
  return {
    count: after.length,
    sameRows:
      after.length === before.length &&
      after.every((row) => beforeById.has(row.id)),
    sameCreatedAt: after.every((row) =>
      sameTime(row.createdAt, beforeById.get(row.id)?.createdAt ?? null),
    ),
    onlyExpectedAuthenticationChanged: after.every((row) => {
      const previous = beforeById.get(row.id);
      if (!previous) return false;
      if (row.id !== refreshedSessionId) {
        return sameTime(row.authenticatedAt, previous.authenticatedAt);
      }
      return (
        row.authenticatedAt !== null &&
        (previous.authenticatedAt === null ||
          row.authenticatedAt.getTime() > previous.authenticatedAt.getTime())
      );
    }),
  };
}

async function expireSession(sessionId: string) {
  const pool = getPool();
  try {
    await pool.query(
      `UPDATE "Session" SET "expires" = NOW() - INTERVAL '1 second' WHERE "id" = $1`,
      [sessionId],
    );
  } finally {
    await pool.end();
  }
}

async function getAuthCookies(context: BrowserContext) {
  return (await context.cookies())
    .filter((cookie) => cookie.name.endsWith("next-auth.session-token"))
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function authCookiesMatch(
  before: Awaited<ReturnType<typeof getAuthCookies>>,
  after: Awaited<ReturnType<typeof getAuthCookies>>,
) {
  return JSON.stringify(before) === JSON.stringify(after);
}

function releasePendingRequest(release: (() => void) | undefined) {
  if (!release) throw new Error("pending request was not captured");
  release();
}

async function enterStaleIndividualReauthentication(page: Page) {
  const rows = page
    .getByRole("list", { name: "Active account sessions" })
    .getByRole("listitem");
  await rows.nth(1).getByRole("button", { name: "Revoke session" }).click();
  await page
    .getByRole("dialog", { name: "Revoke session 2?" })
    .getByRole("button", { name: "Revoke session" })
    .click();
  const reauthenticationDialog = page.getByRole("dialog", {
    name: "Authenticate again to continue",
  });
  await expect(reauthenticationDialog).toBeVisible();
  return reauthenticationDialog;
}

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

async function expectNoSeriousAxeViolations(page: Page) {
  await expect(page).toHaveTitle(/\S/u);
  const openDialog = page.locator('[data-slot="dialog-content"][data-open]');
  if ((await openDialog.count()) > 0) {
    await expect(openDialog).toHaveCSS("opacity", "1");
  }
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
  const seriousOrCritical = results.violations.filter((violation) =>
    violation.nodes.some((node) =>
      ["serious", "critical"].includes(node.impact ?? ""),
    ),
  );
  expect(seriousOrCritical).toEqual([]);
}

async function expectTwentySessionLayout(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        const main = document.querySelector("main");
        const list = main?.querySelector("ol");
        const rows = list
          ? [...list.querySelectorAll<HTMLElement>(":scope > li")]
          : [];
        const timestamps = list
          ? [...list.querySelectorAll<HTMLElement>("time")]
          : [];
        const controls = main
          ? [...main.querySelectorAll<HTMLElement>("a, button")]
          : [];
        const visible = (element: HTMLElement) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
          );
        };
        const clipped = [...timestamps, ...controls].filter(
          (element) =>
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + 1,
        ).length;
        const outOfBounds = [...timestamps, ...controls].filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -0.5 || rect.right > window.innerWidth + 0.5;
        }).length;
        let rowOverlaps = 0;
        const rowRects = rows.map((row) => row.getBoundingClientRect());
        for (let index = 1; index < rowRects.length; index += 1) {
          if (rowRects[index]!.top < rowRects[index - 1]!.bottom - 0.5) {
            rowOverlaps += 1;
          }
        }
        const obscuredFocus: number[] = [];
        controls.forEach((control, index) => {
          control.focus();
          control.scrollIntoView({ block: "nearest", inline: "nearest" });
          const rect = control.getBoundingClientRect();
          const x = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
          const y = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
          const hit = document.elementFromPoint(x, y);
          if (
            rect.top < -0.5 ||
            rect.bottom > window.innerHeight + 0.5 ||
            !hit ||
            !(hit === control || control.contains(hit))
          ) {
            obscuredFocus.push(index);
          }
        });

        return {
          horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
          rowCount: rows.length,
          timestampCount: timestamps.length,
          hiddenTimestamps: timestamps.filter((timestamp) => !visible(timestamp))
            .length,
          hiddenControls: controls.filter((control) => !visible(control)).length,
          clipped,
          outOfBounds,
          rowOverlaps,
          undersizedControls: controls.filter((control) => {
            const rect = control.getBoundingClientRect();
            return rect.width < 44 || rect.height < 44;
          }).length,
          obscuredFocus,
        };
      }),
    )
    .toEqual({
      horizontalOverflow: false,
      rowCount: 20,
      timestampCount: 40,
      hiddenTimestamps: 0,
      hiddenControls: 0,
      clipped: 0,
      outOfBounds: 0,
      rowOverlaps: 0,
      undersizedControls: 0,
      obscuredFocus: [],
    });
}

test.describe.configure({ mode: "serial" });

test.afterEach(async () => {
  await cleanupAuthenticatedUsers();
});

test("redirects signed-out Security routes through localized login callbacks", async ({
  page,
}) => {
  const targets = [
    ["/account/security", "/login?callbackUrl=%2Faccount%2Fsecurity"],
    [
      "/es/account/security",
      "/es/login?callbackUrl=%2Fes%2Faccount%2Fsecurity",
    ],
    [
      "/ca/account/security",
      "/ca/login?callbackUrl=%2Fca%2Faccount%2Fsecurity",
    ],
  ] as const;

  for (const [path, expected] of targets) {
    await page.goto(path);
    await expect(page).toHaveURL(
      new RegExp(`${expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
    );
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("shows the current session first with immutable starts and keeps cancellation non-destructive", async ({
  context,
  page,
  baseURL,
}) => {
  const immutableStart = new Date(Date.now() - 60 * 60_000);
  const seeded = await seedAuthenticatedUser({
    additionalSessionCount: 2,
    createdAt: immutableStart,
    authenticatedAt: new Date(),
  });
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionTokens[1]!, appUrl);

  await page.goto("/account/security");
  await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Security" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  const list = page.getByRole("list", { name: "Active account sessions" });
  const rows = list.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0).getByRole("heading")).toHaveText("Session 1");
  await expect(rows.nth(0).getByText("Current session")).toBeVisible();
  await expect(rows.nth(0).getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(
    rows.nth(0).getByRole("button", { name: "Revoke session" }),
  ).toHaveCount(0);

  const expectedStarts = [
    seeded.sessions[1]!.createdAt!.toISOString(),
    seeded.sessions[0]!.createdAt!.toISOString(),
    seeded.sessions[2]!.createdAt!.toISOString(),
  ];
  await expect
    .poll(async () =>
      rows.evaluateAll((items) =>
        items.map((item) =>
          item
            .querySelector('time[data-kind="started"]')
            ?.getAttribute("datetime"),
        ),
      ),
    )
    .toEqual(expectedStarts);

  const revokeTrigger = rows.nth(1).getByRole("button", {
    name: "Revoke session",
  });
  await revokeTrigger.click();
  const dialog = page.getByRole("dialog", { name: "Revoke session 2?" });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(dialog.getByText("Only this session will end.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(revokeTrigger).toBeFocused();
  await expect(rows).toHaveCount(3);

  await rows.nth(0).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${appUrl}/`);
  await page.goto("/account/security");
  await expect(page).toHaveURL(
    new RegExp("/login\\?callbackUrl=%2Faccount%2Fsecurity$"),
  );
});

test("revokes only the explicitly confirmed non-current session", async ({
  browser,
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser({ additionalSessionCount: 2 });
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionTokens[0]!, appUrl);

  const selectedContext = await browser.newContext();
  const unselectedContext = await browser.newContext();
  await installAuthSessionCookie(
    selectedContext,
    seeded.sessionTokens[1]!,
    appUrl,
  );
  await installAuthSessionCookie(
    unselectedContext,
    seeded.sessionTokens[2]!,
    appUrl,
  );
  const selectedPage = await selectedContext.newPage();
  const unselectedPage = await unselectedContext.newPage();

  try {
    await page.goto("/account/security");
    const list = page.getByRole("list", { name: "Active account sessions" });
    const rows = list.getByRole("listitem");
    await expect(rows).toHaveCount(3);

    await rows.nth(1).getByRole("button", { name: "Revoke session" }).click();
    const dialog = page.getByRole("dialog", { name: "Revoke session 2?" });
    await expect(dialog.getByText("Only this session will end.")).toBeVisible();
    await dialog.getByRole("button", { name: "Revoke session" }).click();

    await expect(dialog).toBeHidden();
    await expect(rows).toHaveCount(2);
    await expect(
      page.getByRole("heading", { name: "Active sessions" }),
    ).toBeFocused();
    await expect(rows.nth(0).getByText("Current session")).toBeVisible();

    await selectedPage.goto("/account/security");
    await expect(selectedPage).toHaveURL(
      new RegExp("/login\\?callbackUrl=%2Faccount%2Fsecurity$"),
    );

    await unselectedPage.goto("/account/security");
    await expect(
      unselectedPage.getByRole("heading", { name: "Security" }),
    ).toBeVisible();
    await expect(
      unselectedPage.getByRole("list", { name: "Active account sessions" }),
    ).toBeVisible();

    await page.goto("/account/security");
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
  } finally {
    await selectedContext.close();
    await unselectedContext.close();
  }
});

test("opens and cancels bulk review with Escape or Cancel without changing sessions", async ({
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser({ additionalSessionCount: 1 });
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);

  await page.goto("/account/security");
  const rows = page
    .getByRole("list", { name: "Active account sessions" })
    .getByRole("listitem");
  const trigger = page.getByRole("button", {
    name: "Revoke all other sessions",
  });
  await expect(rows).toHaveCount(2);

  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Revoke all other sessions?",
  });
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expect(
    dialog.getByText(
      "Every session except the one confirming this action will end.",
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      "Sessions created before you confirm are included, even if they are not shown here.",
    ),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(rows).toHaveCount(2);

  await trigger.click();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(rows).toHaveCount(2);
});

test("keeps bulk unavailable when only the current session is active", async ({
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser();
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);

  await page.goto("/account/security");

  await expect(
    page.getByText("Only your current session is active."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Revoke all other sessions" }),
  ).toBeDisabled();
  await expectNoSeriousAxeViolations(page);
});

test("bulk confirmation preserves its exact context and revokes every other pre-lock session", async ({
  browser,
  context,
  page,
  baseURL,
}) => {
  const seeded = await seedAuthenticatedUser({ additionalSessionCount: 2 });
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionTokens[0]!, appUrl);

  const firstOtherContext = await browser.newContext();
  const secondOtherContext = await browser.newContext();
  const createdDuringReviewContext = await browser.newContext();
  await installAuthSessionCookie(
    firstOtherContext,
    seeded.sessionTokens[1]!,
    appUrl,
  );
  await installAuthSessionCookie(
    secondOtherContext,
    seeded.sessionTokens[2]!,
    appUrl,
  );
  const firstOtherPage = await firstOtherContext.newPage();
  const secondOtherPage = await secondOtherContext.newPage();
  const createdDuringReviewPage = await createdDuringReviewContext.newPage();

  try {
    await page.goto("/account/security");
    const list = page.getByRole("list", { name: "Active account sessions" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Revoke all other sessions" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Revoke all other sessions?",
    });

    const createdDuringReview = await seedAdditionalAuthSession({
      userId: seeded.userId,
    });
    await installAuthSessionCookie(
      createdDuringReviewContext,
      createdDuringReview.sessionToken,
      appUrl,
    );
    await createdDuringReviewPage.goto("/account/security");
    await expect(
      createdDuringReviewPage.getByRole("heading", { name: "Security" }),
    ).toBeVisible();

    await dialog
      .getByRole("button", { name: "Revoke all other sessions" })
      .click();
    await expect(dialog).toBeHidden();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(
      list.getByRole("listitem").getByText("Current session"),
    ).toBeVisible();

    for (const otherPage of [
      firstOtherPage,
      secondOtherPage,
      createdDuringReviewPage,
    ]) {
      await otherPage.goto("/account/security");
      await expect(otherPage).toHaveURL(
        new RegExp("/login\\?callbackUrl=%2Faccount%2Fsecurity$"),
      );
    }

    await page.goto("/account/security");
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Active account sessions" })
        .getByRole("listitem"),
    ).toHaveCount(1);
  } finally {
    await firstOtherContext.close();
    await secondOtherContext.close();
    await createdDuringReviewContext.close();
  }
});

test("handles stale proof and a provider delivery failure before a safe retry", async ({
  context,
  page,
  baseURL,
}) => {
  test.skip(!providerControlUrl, "controlled HTTP provider fixture is required");
  const seeded = await seedAuthenticatedUser({
    additionalSessionCount: 1,
    authenticatedAt: new Date(Date.now() - 11 * 60_000),
  });
  await installAuthSessionCookie(
    context,
    seeded.sessionToken,
    baseURL ?? "http://127.0.0.1:3100",
  );
  await configureNextProviderSend(seeded.email, { status: 503, body: "{}" });
  let issuanceShape:
    | { keys: string[]; locale: unknown; csrfType: string }
    | undefined;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname ===
        "/api/account/security/reauthenticate"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      issuanceShape = {
        keys: Object.keys(body).sort(),
        locale: body.locale,
        csrfType: typeof body.csrfToken,
      };
    }
  });

  await page.goto("/account/security");
  const dialog = await enterStaleIndividualReauthentication(page);
  await dialog.getByRole("button", { name: "Send fresh link" }).click();

  const alert = dialog.getByRole("alert");
  await expect(alert).toHaveText(
    "We could not send the link. No sessions changed. Try again.",
  );
  await expect(alert).toBeFocused();
  expect(issuanceShape).toEqual({
    keys: ["csrfToken", "locale"],
    locale: "en",
    csrfType: "string",
  });
  await expect(countAccountSessions(seeded.userId)).resolves.toBe(2);
  await expect(countSecurityTokens(seeded.normalizedEmail)).resolves.toBe(0);

  await dialog.getByRole("button", { name: "Send fresh link" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Check your email for the fresh authentication link. After using it, choose the action again.",
  );
  await expect(countAccountSessions(seeded.userId)).resolves.toBe(2);
  await expect(countSecurityTokens(seeded.normalizedEmail)).resolves.toBe(1);
  await expect(getProviderSendCount(seeded.email)).resolves.toBe(2);
});

test("returns on the same device with no carried action and requires a new confirmation", async ({
  context,
  page,
  baseURL,
}) => {
  test.skip(!providerControlUrl, "controlled HTTP provider fixture is required");
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  const seeded = await seedAuthenticatedUser({
    additionalSessionCount: 1,
    authenticatedAt: new Date(Date.now() - 11 * 60_000),
  });
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);
  let revocationPosts = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname ===
        "/api/account/security/sessions/revoke"
    ) {
      revocationPosts += 1;
    }
  });

  await page.goto("/account/security");
  const dialog = await enterStaleIndividualReauthentication(page);
  await dialog.getByRole("button", { name: "Send fresh link" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Check your email for the fresh authentication link. After using it, choose the action again.",
  );
  const verificationUrl = await getLatestSecurityVerificationUrl(seeded.email);
  const beforeCallbackPosts = revocationPosts;

  await page.goto(verificationUrl);
  await expect(page).toHaveURL(
    `${appUrl}/account/security?state=reauthenticated`,
  );
  await expect(page.getByRole("status")).toHaveText(
    "Authentication refreshed. Review the current list and choose an action again.",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const rows = page
    .getByRole("list", { name: "Active account sessions" })
    .getByRole("listitem");
  await expect(rows).toHaveCount(2);
  expect(revocationPosts).toBe(beforeCallbackPosts);

  await rows.nth(1).getByRole("button", { name: "Revoke session" }).click();
  const freshDialog = page.getByRole("dialog", { name: "Revoke session 2?" });
  await expect(freshDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(revocationPosts).toBe(beforeCallbackPosts);
  await freshDialog.getByRole("button", { name: "Revoke session" }).click();
  await expect(rows).toHaveCount(1);
  expect(revocationPosts).toBe(beforeCallbackPosts + 1);
});

test("refreshes an already-authenticated same-account device in place at the cap", async ({
  browser,
  context,
  page,
  baseURL,
}) => {
  test.skip(!providerControlUrl, "controlled HTTP provider fixture is required");
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  const seeded = await seedAuthenticatedUser({
    additionalSessionCount: 19,
    authenticatedAt: new Date(Date.now() - 11 * 60_000),
  });
  await installAuthSessionCookie(context, seeded.sessionTokens[0]!, appUrl);
  const consumingContext = await browser.newContext();
  await installAuthSessionCookie(
    consumingContext,
    seeded.sessionTokens[1]!,
    appUrl,
  );
  const consumingPage = await consumingContext.newPage();

  try {
    await page.goto("/account/security");
    const dialog = await enterStaleIndividualReauthentication(page);
    await dialog.getByRole("button", { name: "Send fresh link" }).click();
    await expect(dialog.getByRole("status")).toHaveText(
      "Check your email for the fresh authentication link. After using it, choose the action again.",
    );
    const verificationUrl = await getLatestSecurityVerificationUrl(seeded.email);
    const sessionSnapshot = await captureSessionSnapshot(seeded.userId);
    const initiatingCookies = await getAuthCookies(context);
    const consumingCookies = await getAuthCookies(consumingContext);

    await consumingPage.goto(verificationUrl);
    await expect(consumingPage).toHaveURL(
      `${appUrl}/account/security?state=reauthenticated`,
    );
    await expect(consumingPage.getByRole("status")).toBeVisible();
    await expect(consumingPage.getByRole("dialog")).toHaveCount(0);
    await expect(
      consumingPage
        .getByRole("list", { name: "Active account sessions" })
        .getByRole("listitem"),
    ).toHaveCount(20);
    await expect(
      compareSessionSnapshot(
        sessionSnapshot,
        seeded.userId,
        seeded.sessions[1]!.id,
      ),
    ).resolves.toEqual({
      count: 20,
      sameRows: true,
      sameCreatedAt: true,
      onlyExpectedAuthenticationChanged: true,
    });
    expect(
      authCookiesMatch(initiatingCookies, await getAuthCookies(context)),
    ).toBe(true);
    expect(
      authCookiesMatch(
        consumingCookies,
        await getAuthCookies(consumingContext),
      ),
    ).toBe(true);
  } finally {
    await consumingContext.close();
  }
});

test("keeps valid credentials unconsumed for ineligible browsers and rejects replay", async ({
  browser,
  context,
  page,
  baseURL,
}) => {
  test.skip(!providerControlUrl, "controlled HTTP provider fixture is required");
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  const owner = await seedAuthenticatedUser({
    additionalSessionCount: 1,
    authenticatedAt: new Date(Date.now() - 11 * 60_000),
  });
  const conflicting = await seedAuthenticatedUser();
  await installAuthSessionCookie(context, owner.sessionTokens[0]!, appUrl);

  await page.goto("/account/security");
  const dialog = await enterStaleIndividualReauthentication(page);
  await dialog.getByRole("button", { name: "Send fresh link" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Check your email for the fresh authentication link. After using it, choose the action again.",
  );
  const verificationUrl = await getLatestSecurityVerificationUrl(owner.email);
  await expect(countSecurityTokens(owner.normalizedEmail)).resolves.toBe(1);

  await page.goto("/api/account/security/verify?token=invalid");
  await expect(page).toHaveURL(`${appUrl}/account/security?state=invalid_link`);
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(countSecurityTokens(owner.normalizedEmail)).resolves.toBe(1);

  const conflictContext = await browser.newContext();
  const signedOutContext = await browser.newContext();
  const expiredContext = await browser.newContext();
  await installAuthSessionCookie(
    conflictContext,
    conflicting.sessionToken,
    appUrl,
  );
  await installAuthSessionCookie(
    expiredContext,
    owner.sessionTokens[1]!,
    appUrl,
  );
  await expireSession(owner.sessions[1]!.id);
  const conflictPage = await conflictContext.newPage();
  const signedOutPage = await signedOutContext.newPage();
  const expiredPage = await expiredContext.newPage();

  try {
    await conflictPage.goto(verificationUrl);
    await expect(conflictPage).toHaveURL(
      `${appUrl}/account/security?state=session_conflict`,
    );
    await expect(
      conflictPage.getByRole("main").getByRole("alert"),
    ).toBeVisible();
    await expect(countSecurityTokens(owner.normalizedEmail)).resolves.toBe(1);

    await signedOutPage.goto(verificationUrl);
    await expect(signedOutPage).toHaveURL(
      `${appUrl}/login?callbackUrl=%2Faccount%2Fsecurity`,
    );
    await expect(countSecurityTokens(owner.normalizedEmail)).resolves.toBe(1);

    await expiredPage.goto(verificationUrl);
    await expect(expiredPage).toHaveURL(
      `${appUrl}/login?callbackUrl=%2Faccount%2Fsecurity`,
    );
    await expect(countSecurityTokens(owner.normalizedEmail)).resolves.toBe(1);

    await page.goto(verificationUrl);
    await expect(page).toHaveURL(
      `${appUrl}/account/security?state=reauthenticated`,
    );
    await expect(countSecurityTokens(owner.normalizedEmail)).resolves.toBe(0);

    await page.goto(verificationUrl);
    await expect(page).toHaveURL(
      `${appUrl}/account/security?state=invalid_link`,
    );
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
    await expect(countSecurityTokens(owner.normalizedEmail)).resolves.toBe(0);
  } finally {
    await conflictContext.close();
    await signedOutContext.close();
    await expiredContext.close();
  }
});

test("recovers one authoritative committed response loss without a second POST", async ({
  context,
  page,
  baseURL,
}) => {
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  const seeded = await seedAuthenticatedUser({ additionalSessionCount: 1 });
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);
  let revocationPosts = 0;
  let recoveryRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      url.pathname === "/account/security" &&
      url.searchParams.get("state") === "recovered"
    ) {
      recoveryRequests += 1;
    }
  });
  await page.route("**/api/account/security/sessions/revoke", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    revocationPosts += 1;
    await route.fetch();
    await route.abort("failed");
  });

  await page.goto("/account/security");
  const rows = page
    .getByRole("list", { name: "Active account sessions" })
    .getByRole("listitem");
  await rows.nth(1).getByRole("button", { name: "Revoke session" }).click();
  await page
    .getByRole("dialog", { name: "Revoke session 2?" })
    .getByRole("button", { name: "Revoke session" })
    .click();

  await expect(page).toHaveURL(`${appUrl}/account/security?state=recovered`);
  await expect(page.getByRole("status")).toHaveText(
    "The active session list was refreshed. Review it before choosing another action.",
  );
  await expect(
    page.getByRole("heading", { name: "Active sessions" }),
  ).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rows).toHaveCount(1);
  await expectNoSeriousAxeViolations(page);
  expect(revocationPosts).toBe(1);
  expect(recoveryRequests).toBe(1);
});

test("reports an uncommitted response loss generically and retries only after a new confirmation", async ({
  context,
  page,
  baseURL,
}) => {
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  const seeded = await seedAuthenticatedUser({ additionalSessionCount: 1 });
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);
  let revocationPosts = 0;
  let recoveryRequests = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "GET" &&
      url.pathname === "/account/security" &&
      url.searchParams.get("state") === "recovered"
    ) {
      recoveryRequests += 1;
    }
  });
  await page.route("**/api/account/security/sessions/revoke", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    revocationPosts += 1;
    if (revocationPosts === 1) {
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await page.goto("/account/security");
  const rows = page
    .getByRole("list", { name: "Active account sessions" })
    .getByRole("listitem");
  await rows.nth(1).getByRole("button", { name: "Revoke session" }).click();
  await page
    .getByRole("dialog", { name: "Revoke session 2?" })
    .getByRole("button", { name: "Revoke session" })
    .click();

  await expect(page).toHaveURL(`${appUrl}/account/security?state=recovered`);
  await expect(page.getByRole("status")).toHaveText(
    "The active session list was refreshed. Review it before choosing another action.",
  );
  await expect(page.getByText("The request completed.")).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  expect(revocationPosts).toBe(1);
  expect(recoveryRequests).toBe(1);

  await rows.nth(1).getByRole("button", { name: "Revoke session" }).click();
  const retryDialog = page.getByRole("dialog", { name: "Revoke session 2?" });
  await expect(retryDialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  expect(revocationPosts).toBe(1);
  await retryDialog.getByRole("button", { name: "Revoke session" }).click();
  await expect(rows).toHaveCount(1);
  expect(revocationPosts).toBe(2);
});

test("supports localized keyboard-only review, pending, reauthentication, and error states", async ({
  context,
  page,
  baseURL,
}) => {
  test.slow();
  const seeded = await seedAuthenticatedUser({ additionalSessionCount: 1 });
  const appUrl = baseURL ?? "http://127.0.0.1:3100";
  await installAuthSessionCookie(context, seeded.sessionToken, appUrl);

  let revocationMode: "error" | "stale" = "error";
  let releaseRevocation: (() => void) | undefined;
  let releaseReauthentication: (() => void) | undefined;
  await page.route("**/api/account/security/sessions/revoke", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (revocationMode === "error") {
      await new Promise<void>((resolve) => {
        releaseRevocation = resolve;
      });
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ status: "revocation_failed" }),
      });
      return;
    }
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ status: "reauthentication_required" }),
    });
  });
  await page.route("**/api/account/security/reauthenticate", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise<void>((resolve) => {
      releaseReauthentication = resolve;
    });
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ status: "unavailable" }),
    });
  });

  for (const target of localeTargets) {
    const messages = target.messages.security;
    await context.addCookies([
      {
        name: "NEXT_LOCALE",
        value: target.locale,
        url: new URL(appUrl).origin,
        sameSite: "Lax",
      },
    ]);
    await page.goto(target.path);
    await expect(page.locator("html")).toHaveAttribute("lang", target.locale);
    await expectNoSeriousAxeViolations(page);

    const rows = page
      .getByRole("list", { name: messages.list.ariaLabel })
      .getByRole("listitem");
    const individualTrigger = rows.nth(1).getByRole("button", {
      name: messages.actions.revokeSession,
    });
    await tabTo(page, individualTrigger);
    await page.keyboard.press("Enter");
    let dialog = page.getByRole("dialog", {
      name: messages.dialog.individual.title.replace("{number}", "2"),
    });
    const cancel = dialog.getByRole("button", {
      name: messages.dialog.cancel,
    });
    await expect(cancel).toBeFocused();
    for (let press = 0; press < 4; press += 1) {
      await page.keyboard.press("Tab");
      await expect
        .poll(() =>
          dialog.evaluate((element) => element.contains(document.activeElement)),
        )
        .toBe(true);
    }
    await expectNoSeriousAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(individualTrigger).toBeFocused();

    revocationMode = "error";
    releaseRevocation = undefined;
    await page.keyboard.press("Enter");
    dialog = page.getByRole("dialog", {
      name: messages.dialog.individual.title.replace("{number}", "2"),
    });
    const errorCancel = dialog.getByRole("button", {
      name: messages.dialog.cancel,
    });
    const close = dialog.getByRole("button", {
      name: messages.dialog.closeLabel,
    });
    const confirm = dialog.getByRole("button", {
      name: messages.dialog.individual.confirm,
    });
    await expect(dialog).toHaveCSS("scale", "none");
    const footer = dialog.locator('[data-slot="dialog-footer"]');
    const footerBefore = await footer.boundingBox();
    await tabTo(page, confirm);
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("status")).toHaveText(
      messages.pending.revokingSession,
    );
    await expect(errorCancel).toBeDisabled();
    await expect(close).toBeDisabled();
    await expect(confirm).toBeDisabled();
    expect(await footer.boundingBox()).toEqual(footerBefore);
    await expectNoSeriousAxeViolations(page);
    await expect.poll(() => Boolean(releaseRevocation)).toBe(true);
    releasePendingRequest(releaseRevocation);
    const revocationAlert = dialog.getByRole("alert");
    await expect(revocationAlert).toHaveText(
      messages.errors.revocationFailed,
    );
    await expect(revocationAlert).toBeFocused();
    await expectNoSeriousAxeViolations(page);
    await tabTo(page, dialog.getByRole("button", { name: messages.dialog.cancel }));
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(individualTrigger).toBeFocused();

    revocationMode = "stale";
    await page.keyboard.press("Enter");
    dialog = page.getByRole("dialog");
    await tabTo(
      page,
      dialog.getByRole("button", {
        name: messages.dialog.individual.confirm,
      }),
    );
    await page.keyboard.press("Enter");
    await expect(
      dialog.getByRole("heading", {
        name: messages.reauthentication.title,
      }),
    ).toBeVisible();
    const reauthenticationAlert = dialog.getByRole("alert");
    await expect(reauthenticationAlert).toHaveText(
      messages.reauthentication.description,
    );
    await expect(reauthenticationAlert).toBeFocused();
    await expectNoSeriousAxeViolations(page);

    releaseReauthentication = undefined;
    const reauthenticationCancel = dialog.getByRole("button", {
      name: messages.dialog.cancel,
    });
    const reauthenticationClose = dialog.getByRole("button", {
      name: messages.dialog.closeLabel,
    });
    const sendLink = dialog.getByRole("button", {
      name: messages.reauthentication.sendLink,
    });
    const reauthenticationFooter = dialog.locator(
      '[data-slot="dialog-footer"]',
    );
    const reauthenticationFooterBefore =
      await reauthenticationFooter.boundingBox();
    await tabTo(page, sendLink);
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("status")).toHaveText(
      messages.pending.sendingLink,
    );
    await expect(reauthenticationCancel).toBeDisabled();
    await expect(reauthenticationClose).toBeDisabled();
    await expect(sendLink).toBeDisabled();
    expect(await reauthenticationFooter.boundingBox()).toEqual(
      reauthenticationFooterBefore,
    );
    await expectNoSeriousAxeViolations(page);
    await expect.poll(() => Boolean(releaseReauthentication)).toBe(true);
    releasePendingRequest(releaseReauthentication);
    const sendAlert = dialog.getByRole("alert");
    await expect(sendAlert).toHaveText(messages.errors.sendFailed);
    await expect(sendAlert).toBeFocused();
    await expectNoSeriousAxeViolations(page);
    await tabTo(page, dialog.getByRole("button", { name: messages.dialog.cancel }));
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(individualTrigger).toBeFocused();

    const bulkTrigger = page.getByRole("button", {
      name: messages.actions.revokeOtherSessions,
    });
    await tabTo(page, bulkTrigger);
    await page.keyboard.press("Enter");
    const bulkDialog = page.getByRole("dialog", {
      name: messages.dialog.bulk.title,
    });
    await expect(
      bulkDialog.getByRole("button", { name: messages.dialog.cancel }),
    ).toBeFocused();
    await expectNoSeriousAxeViolations(page);
    await page.keyboard.press("Escape");
    await expect(bulkDialog).toBeHidden();
    await expect(bulkTrigger).toBeFocused();
  }
});

for (const viewport of [
  { name: "desktop", tag: "@desktop" },
  { name: "320x900 mobile", tag: "@mobile" },
] as const) {
  test(
    `keeps 20 localized sessions usable in light and dark at ${viewport.name}`,
    { tag: viewport.tag },
    async ({ context, page, baseURL }) => {
      test.slow();
      const authenticatedAt = new Date();
      const seeded = await seedAuthenticatedUser({
        additionalSessionCount: 19,
        createdAt: new Date("2026-08-20T08:00:00.000Z"),
        authenticatedAt,
      });
      const appUrl = baseURL ?? "http://127.0.0.1:3100";
      await installAuthSessionCookie(context, seeded.sessionToken, appUrl);

      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
        for (const target of localeTargets) {
          await context.addCookies([
            {
              name: "NEXT_LOCALE",
              value: target.locale,
              url: new URL(appUrl).origin,
              sameSite: "Lax",
            },
          ]);
          await page.goto(target.path);
          await expect(page.locator("html")).toHaveAttribute(
            "lang",
            target.locale,
          );
          const navigation = page.getByRole("navigation", {
            name: target.messages.navigation.profileAriaLabel,
          });
          await expect(
            navigation.getByRole("link", {
              name: target.messages.navigation.profile,
            }),
          ).toHaveAttribute("href", target.accountPath);
          await expect(
            navigation.getByRole("link", {
              name: target.messages.navigation.dataAndPrivacy,
            }),
          ).toHaveAttribute("href", target.dataPath);
          await expect(
            navigation.getByRole("link", {
              name: target.messages.navigation.security,
            }),
          ).toHaveAttribute("href", target.path);
          await expect(navigation.locator('[aria-current="page"]')).toHaveCount(
            1,
          );

          const list = page.getByRole("list", {
            name: target.messages.security.list.ariaLabel,
          });
          await expect(list).toHaveAttribute(
            "aria-describedby",
            "active-sessions-description",
          );
          await expect(list.getByRole("listitem")).toHaveCount(20);
          await expect(list.locator("time")).toHaveCount(40);
          await expect(
            list.getByText(target.messages.security.list.current),
          ).toHaveCount(1);

          const mainMarkup = await page.getByRole("main").evaluate(
            (element) => element.innerHTML,
          );
          for (const forbidden of [
            seeded.email,
            authenticatedAt.toISOString(),
            ...seeded.sessionIds,
            ...seeded.sessionTokens,
          ]) {
            expect(mainMarkup).not.toContain(forbidden);
          }

          await expectTwentySessionLayout(page);
          const motionEnabled = await page
            .locator("main nav a, main button")
            .evaluateAll((elements) =>
              elements.flatMap((element) => {
                const style = getComputedStyle(element);
                const transitionDuration = style.transitionDuration;
                const motionDisabled =
                  style.transitionProperty === "none" ||
                  transitionDuration
                    .split(",")
                    .every((duration) => Number.parseFloat(duration) === 0);
                return motionDisabled
                  ? []
                  : [
                      {
                        element: element.outerHTML,
                        transitionProperty: style.transitionProperty,
                        transitionDuration,
                      },
                    ];
              }),
            );
          expect(motionEnabled).toEqual([]);
          await expectNoSeriousAxeViolations(page);
        }
      }
    },
  );
}