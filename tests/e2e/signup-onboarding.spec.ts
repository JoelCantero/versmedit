import { createHash, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { source as axeSource } from "axe-core";
import { Pool } from "pg";

const smtpControlUrl = process.env.E2E_SMTP_HTTP_URL;
const trackedEmails = new Set<string>();

const localizedSignupTargets = [
  {
    locale: "en",
    path: "/signup",
    name: "Name",
    email: "Email",
    terms: "terms of use",
    termsPath: "/terms",
    privacy: "privacy notice",
    privacyPath: "/privacy",
    submit: "Create account",
    sending: "Sending your request...",
    accepted: "Check your email for the next step.",
  },
  {
    locale: "es",
    path: "/es/signup",
    name: "Nombre",
    email: "Correo electrónico",
    terms: "términos de uso",
    termsPath: "/es/terms",
    privacy: "aviso de privacidad",
    privacyPath: "/es/privacy",
    submit: "Crear cuenta",
    sending: "Enviando tu solicitud...",
    accepted: "Revisa tu correo para continuar.",
  },
  {
    locale: "ca",
    path: "/ca/signup",
    name: "Nom",
    email: "Correu electrònic",
    terms: "condicions d'ús",
    termsPath: "/ca/terms",
    privacy: "l'avís de privacitat",
    privacyPath: "/ca/privacy",
    submit: "Crea el compte",
    sending: "Enviant la teva sol·licitud...",
    accepted: "Revisa el correu per continuar.",
  },
] as const;

const signupViewports = [
  { name: "mobile", width: 375, height: 667 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

async function expectNoSeriousAxeViolations(page: import("@playwright/test").Page) {
  await page.evaluate(axeSource);
  const results: {
    violations: Array<{
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

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for signup E2E");
  return new Pool({ connectionString });
}

async function seedUser(email: string, status: "PENDING" | "ACTIVE") {
  const pool = getPool();
  try {
    await pool.query(
      `INSERT INTO "User" ("id", "email", "normalizedEmail", "name", "emailVerified", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $2, $3, $4, $5, NOW(), NOW())`,
      [
        `user_${randomUUID()}`,
        email,
        status === "ACTIVE" ? "Existing Person" : null,
        status === "ACTIVE" ? new Date() : null,
        status,
      ],
    );
    trackedEmails.add(email);
  } finally {
    await pool.end();
  }
}

async function cleanupSignupData() {
  if (trackedEmails.size === 0) return;
  const emails = [...trackedEmails];
  const addressKeys = emails.map(
    (email) =>
      `auth:email:address:${createHash("sha256").update(email).digest("hex")}`,
  );
  const pool = getPool();
  try {
    await pool.query(
      `DELETE FROM "Session" WHERE "userId" IN (
         SELECT "id" FROM "User" WHERE "normalizedEmail" = ANY($1::text[])
       )`,
      [emails],
    );
    await pool.query(
      `DELETE FROM "PolicyAcceptance" WHERE "userId" IN (
         SELECT "id" FROM "User" WHERE "normalizedEmail" = ANY($1::text[])
       )`,
      [emails],
    );
    await pool.query(
      `DELETE FROM "VerificationToken" WHERE "identifier" = ANY($1::text[])`,
      [emails],
    );
    await pool.query(
      `DELETE FROM "User" WHERE "normalizedEmail" = ANY($1::text[])`,
      [emails],
    );
    await pool.query(
      `DELETE FROM "RateLimitBucket" WHERE "key" = ANY($1::text[])
         OR "key" = 'auth:email:client:untrusted-direct-client'`,
      [addressKeys],
    );
  } finally {
    trackedEmails.clear();
    await pool.end();
  }
}

test.afterEach(async () => {
  await cleanupSignupData();
});

test("keeps signup private and activates through the normal Auth.js session", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "critical journey runs once");
  test.skip(!smtpControlUrl, "controlled SMTP fixture is required");

  await fetch(`${smtpControlUrl}/reset`, { method: "POST" });
  const suffix = randomUUID();
  const newEmail = `new-${suffix}@example.test`;
  const pendingEmail = `pending-${suffix}@example.test`;
  const activeEmail = `active-${suffix}@example.test`;
  trackedEmails.add(newEmail);
  await seedUser(pendingEmail, "PENDING");
  await seedUser(activeEmail, "ACTIVE");

  async function submit(name: string, email: string) {
    await page.goto("/signup");
    await page.getByRole("textbox", { name: "Name" }).fill(name);
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();
    const confirmation = page.getByText("Check your email for the next step.");
    await expect(confirmation).toBeVisible();
    return {
      confirmation: await confirmation.textContent(),
      pathname: new URL(page.url()).pathname,
    };
  }

  const publicResults = [
    await submit("New Person", newEmail),
    await submit("Pending Person", pendingEmail),
    await submit("Ignored Active Name", activeEmail),
  ];
  expect(new Set(publicResults.map((result) => result.confirmation))).toEqual(
    new Set(["Check your email for the next step."]),
  );
  expect(new Set(publicResults.map((result) => result.pathname))).toEqual(
    new Set(["/signup"]),
  );

  const capture = (await fetch(`${smtpControlUrl}/messages`).then((response) =>
    response.json(),
  )) as { messages: Array<{ to: string[]; raw: string }> };
  expect(capture.messages).toHaveLength(3);
  const activeNotice = capture.messages.find((message) =>
    message.to.includes(activeEmail),
  );
  expect(activeNotice?.raw).toContain("/login");
  expect(activeNotice?.raw).not.toContain("/api/signup/activate");

  const onboarding = capture.messages.find((message) =>
    message.to.includes(newEmail),
  );
  const decodedMessage = onboarding?.raw
    .replace(/=\r?\n/g, "")
    .replaceAll("=3D", "=");
  const activationUrl = decodedMessage?.match(
    /https?:\/\/[^\s<"]+\/api\/signup\/activate\?token=[A-Za-z0-9_-]{43}/,
  )?.[0];
  expect(activationUrl).toBeTruthy();

  await page.goto(activationUrl!);
  await expect(page).toHaveURL(`${baseURL}/`);
  const sessionCookie = (await context.cookies()).find((cookie) =>
    cookie.name.endsWith("next-auth.session-token"),
  );
  expect(sessionCookie).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(baseURL!).protocol === "https:",
  });

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await context.clearCookies();
  await page.goto(activationUrl!);
  await expect(page).toHaveURL(`${baseURL}/signup?state=invalid_link`);
});

for (const target of localizedSignupTargets) {
  for (const theme of ["light", "dark"] as const) {
    for (const viewport of signupViewports) {
      test(`${target.locale} signup is accessible and stable in ${theme} at ${viewport.width}x${viewport.height}`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== "chromium", "responsive matrix runs once");
        test.slow();

        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme });
        await page.route("**/api/auth/csrf", (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ csrfToken: "browser-csrf-fixture" }),
          }),
        );
        let releaseSignup: (() => void) | undefined;
        await page.route("**/api/signup", async (route) => {
          await new Promise<void>((resolve) => {
            releaseSignup = resolve;
          });
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ status: "accepted" }),
          });
        });

        await page.goto(target.path);
        await expect(page.locator("html")).toHaveAttribute("lang", target.locale);
        await expect(page.locator("html")).toHaveClass(
          new RegExp(`(^|\\s)${theme}(\\s|$)`),
        );

        const name = page.getByRole("textbox", { name: target.name });
        const email = page.getByRole("textbox", { name: target.email });
        const checkbox = page.getByRole("checkbox");
        const terms = page.getByRole("link", { name: target.terms });
        const privacy = page.getByRole("link", { name: target.privacy });
        const submit = page.getByRole("button", { name: target.submit });
        await expect(checkbox).not.toBeChecked();
        await expect(terms).toHaveAttribute("href", target.termsPath);
        await expect(privacy).toHaveAttribute("href", target.privacyPath);

        const initialErrorHeight = await page.locator("#signup-name-error").evaluate(
          (element) => element.getBoundingClientRect().height,
        );
        const initialStatusHeight = await page.getByRole("status").evaluate(
          (element) => element.getBoundingClientRect().height,
        );

        await submit.focus();
        await page.keyboard.press("Enter");
        await expect(name).toBeFocused();
        const invalidErrorHeight = await page.locator("#signup-name-error").evaluate(
          (element) => element.getBoundingClientRect().height,
        );
        expect(Math.abs(invalidErrorHeight - initialErrorHeight)).toBeLessThanOrEqual(1);
        await expectNoSeriousAxeViolations(page);

        await page.keyboard.type("Alexandra Montserrat de la Vall");
        await page.keyboard.press("Tab");
        await expect(email).toBeFocused();
        await page.keyboard.type("alexandra@example.test");
        await page.keyboard.press("Tab");
        await expect(checkbox).toBeFocused();
        await page.keyboard.press("Space");
        await page.keyboard.press("Tab");
        await expect(terms).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(privacy).toBeFocused();
        await page.keyboard.press("Tab");
        await expect(submit).toBeFocused();
        await page.keyboard.press("Enter");

        await expect(page.getByRole("status")).toContainText(target.sending);
        await expect.poll(() => Boolean(releaseSignup)).toBe(true);
        const pendingStatusHeight = await page.getByRole("status").evaluate(
          (element) => element.getBoundingClientRect().height,
        );
        releaseSignup?.();
        await expect(page.getByRole("status")).toContainText(target.accepted);
        const acceptedStatusHeight = await page.getByRole("status").evaluate(
          (element) => element.getBoundingClientRect().height,
        );
        expect(Math.abs(pendingStatusHeight - initialStatusHeight)).toBeLessThanOrEqual(1);
        expect(Math.abs(acceptedStatusHeight - initialStatusHeight)).toBeLessThanOrEqual(1);

        const layout = await page.evaluate(() => {
          const root = document.documentElement;
          const controls = [...document.querySelectorAll("main input, main button, main a")];
          return {
            overflow: root.scrollWidth > root.clientWidth,
            outOfBounds: controls
              .filter((element) => {
                const rect = element.getBoundingClientRect();
                return rect.left < -0.5 || rect.right > window.innerWidth + 0.5;
              })
              .map((element) => `${element.tagName}:${element.textContent ?? ""}`),
          };
        });
        expect(layout).toEqual({ overflow: false, outOfBounds: [] });

        await page.screenshot({
          path: testInfo.outputPath(
            `signup-${target.locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });
      });
    }
  }
}