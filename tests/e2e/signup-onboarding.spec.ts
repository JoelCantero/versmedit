import { createHash, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { source as axeSource } from "axe-core";
import { Pool } from "pg";

const providerControlUrl = process.env.E2E_PROVIDER_HTTP_URL;
const e2eProvider = process.env.E2E_MAIL_PROVIDER ?? "brevo";
const e2eApiKey = process.env.E2E_MAIL_API_KEY ?? "e2e-provider-key";
const e2eApiSecret = process.env.E2E_MAIL_API_SECRET ?? "e2e-provider-secret";
const trackedEmails = new Set<string>();

interface CapturedProviderRequest {
  target: "brevo.health" | "brevo.send" | "mailjet.health" | "mailjet.send";
  logicalUrl: string;
  method: string;
  headers: Record<string, string | string[]>;
  body: string;
}

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
    invalidEmail: "Enter a valid email address.",
    invalidPolicy: "Accept the terms of use and privacy notice to continue.",
    invalidRequest: "This request is no longer valid. Refresh the page and try again.",
    rateLimited: "Too many attempts. Try again in 47 seconds.",
    unavailable: "Signup is temporarily unavailable. Please try again later.",
    recovery: [
      {
        state: "invalid_link",
        title: "This signup link is not valid",
        action: "Request a new signup email",
      },
      {
        state: "session_conflict",
        title: "Sign out before using this link",
        action: "Sign out",
      },
      {
        state: "session_failed",
        title: "Your account is ready",
        action: "Sign in",
      },
    ],
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
    invalidEmail: "Introduce un correo electrónico válido.",
    invalidPolicy: "Acepta los términos de uso y el aviso de privacidad para continuar.",
    invalidRequest: "Esta solicitud ya no es válida. Actualiza la página y vuelve a intentarlo.",
    rateLimited: "Demasiados intentos. Vuelve a intentarlo en 47 segundos.",
    unavailable: "El registro no está disponible temporalmente. Inténtalo más tarde.",
    recovery: [
      {
        state: "invalid_link",
        title: "Este enlace de registro no es válido",
        action: "Solicitar un nuevo correo de registro",
      },
      {
        state: "session_conflict",
        title: "Cierra la sesión antes de usar este enlace",
        action: "Cerrar sesión",
      },
      {
        state: "session_failed",
        title: "Tu cuenta está lista",
        action: "Iniciar sesión",
      },
    ],
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
    invalidEmail: "Introdueix un correu electrònic vàlid.",
    invalidPolicy: "Accepta les condicions d'ús i l'avís de privacitat per continuar.",
    invalidRequest: "Aquesta sol·licitud ja no és vàlida. Actualitza la pàgina i torna-ho a provar.",
    rateLimited: "Massa intents. Torna-ho a provar d'aquí a 47 segons.",
    unavailable: "El registre no està disponible temporalment. Torna-ho a provar més tard.",
    recovery: [
      {
        state: "invalid_link",
        title: "Aquest enllaç de registre no és vàlid",
        action: "Sol·licita un correu de registre nou",
      },
      {
        state: "session_conflict",
        title: "Tanca la sessió abans d'utilitzar aquest enllaç",
        action: "Tanca la sessió",
      },
      {
        state: "session_failed",
        title: "El teu compte està preparat",
        action: "Inicia sessió",
      },
    ],
  },
] as const;

const signupViewports = [
  { name: "mobile", width: 375, height: 667 },
  { name: "desktop", width: 1440, height: 900 },
] as const;

interface SignupApiState {
  result: Record<string, unknown>;
  deferNext: boolean;
  release?: () => void;
}

async function mockSignupApi(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ csrfToken: "browser-csrf-fixture" }),
    }),
  );
  const state: SignupApiState = {
    result: { status: "accepted" },
    deferNext: false,
  };
  await page.route("**/api/signup", async (route) => {
    if (state.deferNext) {
      state.deferNext = false;
      await new Promise<void>((resolve) => {
        state.release = resolve;
      });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.result),
    });
  });
  return state;
}

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

async function expectStableHeight(
  locator: import("@playwright/test").Locator,
  initialHeight: number,
) {
  await expect
    .poll(async () => {
      const height = await locator.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      return Math.abs(height - initialHeight);
    })
    .toBeLessThanOrEqual(1);
}

async function expectResponsiveState(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const root = document.documentElement;
        const controls = [
          ...document.querySelectorAll<HTMLElement>("main input, main button, main a"),
        ].filter((element) => element.getClientRects().length > 0);
        const entries = controls.map((element, index) => ({
          label: `${element.tagName.toLowerCase()}-${index}`,
          element,
          rects: [...element.getClientRects()],
        }));
        const outOfBounds = entries.flatMap(({ label, rects }) =>
          rects.some(
            (rect) => rect.left < -0.5 || rect.right > window.innerWidth + 0.5,
          )
            ? [label]
            : [],
        );
        const clippedControls = entries.flatMap(({ label, element }) =>
          element.scrollWidth > element.clientWidth + 1 ||
          element.scrollHeight > element.clientHeight + 1
            ? [label]
            : [],
        );
        const overlappingControls: string[] = [];
        for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
          for (
            let rightIndex = leftIndex + 1;
            rightIndex < entries.length;
            rightIndex += 1
          ) {
            const left = entries[leftIndex]!;
            const right = entries[rightIndex]!;
            const overlaps = left.rects.some((leftRect) =>
              right.rects.some(
                (rightRect) =>
                  Math.min(leftRect.right, rightRect.right) -
                    Math.max(leftRect.left, rightRect.left) >
                    0.5 &&
                  Math.min(leftRect.bottom, rightRect.bottom) -
                    Math.max(leftRect.top, rightRect.top) >
                    0.5,
              ),
            );
            if (overlaps) {
              overlappingControls.push(`${left.label}:${right.label}`);
            }
          }
        }
        return {
          horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
          outOfBounds,
          clippedControls,
          overlappingControls,
        };
      }),
    )
    .toEqual({
      horizontalOverflow: false,
      outOfBounds: [],
      clippedControls: [],
      overlappingControls: [],
    });
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
}) => {
  test.skip(!providerControlUrl, "controlled HTTP provider fixture is required");
  test.skip(
    e2eProvider !== "brevo" && e2eProvider !== "mailjet",
    "E2E_MAIL_PROVIDER must be brevo or mailjet",
  );

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

  const capture = (await fetch(
    `${providerControlUrl}/control/requests`,
  ).then((response) => response.json())) as {
    requests: CapturedProviderRequest[];
  };
  const providerPrefix = e2eProvider === "brevo" ? "brevo" : "mailjet";
  const healthRequests = capture.requests.filter(
    (request) => request.target === `${providerPrefix}.health`,
  );
  const recipients = [newEmail, pendingEmail, activeEmail];
  const sendRequests = capture.requests.filter(
    (request) =>
      request.target === `${providerPrefix}.send` &&
      recipients.some((email) => request.body.includes(email)),
  );
  expect(healthRequests.length).toBeGreaterThanOrEqual(1);
  expect(sendRequests).toHaveLength(3);
  const healthRequest = healthRequests.at(-1)!;

  const expectedAuthorization = `Basic ${Buffer.from(`${e2eApiKey}:${e2eApiSecret}`).toString("base64")}`;
  if (e2eProvider === "brevo") {
    expect(healthRequest).toMatchObject({
      logicalUrl: "https://api.brevo.com/v3/account",
      method: "GET",
    });
    expect(healthRequest.headers["api-key"]).toBe(e2eApiKey);
    for (const request of sendRequests) {
      expect(request).toMatchObject({
        logicalUrl: "https://api.brevo.com/v3/smtp/email",
        method: "POST",
      });
      expect(request.headers["api-key"]).toBe(e2eApiKey);
    }
  } else {
    expect(healthRequest).toMatchObject({
      logicalUrl: "https://api.mailjet.com/v3/REST/sender?Limit=1",
      method: "GET",
    });
    expect(healthRequest.headers.authorization).toBe(expectedAuthorization);
    for (const request of sendRequests) {
      expect(request).toMatchObject({
        logicalUrl: "https://api.mailjet.com/v3.1/send",
        method: "POST",
      });
      expect(request.headers.authorization).toBe(expectedAuthorization);
    }
  }

  const messages = sendRequests.map((request) => {
    const body = JSON.parse(request.body) as Record<string, unknown>;
    if (e2eProvider === "brevo") {
      const sender = body.sender as { email: string; name: string };
      const to = body.to as Array<{ email: string }>;
      return {
        recipient: to[0]!.email,
        sender,
        subject: body.subject as string,
        text: body.textContent as string,
        html: body.htmlContent as string,
      };
    }
    const message = (body.Messages as Array<Record<string, unknown>>)[0]!;
    const sender = message.From as { Email: string; Name: string };
    const to = message.To as Array<{ Email: string }>;
    return {
      recipient: to[0]!.Email,
      sender: { email: sender.Email, name: sender.Name },
      subject: message.Subject as string,
      text: message.TextPart as string,
      html: message.HTMLPart as string,
    };
  });
  for (const message of messages) {
    expect(message.sender).toEqual({
      email: "no-reply@example.test",
      name: "playwright",
    });
    expect(message.subject).toBeTruthy();
    expect(message.text).toBeTruthy();
    expect(message.html).toBeTruthy();
  }
  const activeNotice = messages.find((message) => message.recipient === activeEmail);
  expect(activeNotice?.text).toContain("/login");
  expect(activeNotice?.text).not.toContain("/api/signup/activate");

  const onboarding = messages.find((message) => message.recipient === newEmail);
  const activationUrl = onboarding?.text.match(
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

test("renders every locale accessibly and submits by keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockSignupApi(page);

  for (const target of localizedSignupTargets) {
    await page.goto(target.path);
    await expect(page.locator("html")).toHaveAttribute("lang", target.locale);
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: target.terms })).toHaveAttribute(
      "href",
      target.termsPath,
    );
    await expect(main.getByRole("link", { name: target.privacy })).toHaveAttribute(
      "href",
      target.privacyPath,
    );

    await page.getByRole("textbox", { name: target.name }).fill("Alexandra Montserrat");
    await page.getByRole("textbox", { name: target.email }).fill("alexandra@example.test");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: target.submit }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("form > p[aria-live]")).toHaveText(target.accepted);
    await expectResponsiveState(page);
    await expectNoSeriousAxeViolations(page);
  }
});

const responsiveTarget = localizedSignupTargets[2];

for (const viewport of signupViewports) {
  for (const theme of ["light", "dark"] as const) {
    test(
      `signup states are stable in ${theme} at ${viewport.width}x${viewport.height}`,
      { tag: viewport.name === "mobile" ? "@mobile" : "@desktop" },
      async ({
        page,
      }, testInfo) => {
        test.slow();

        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme });
        const signupApi = await mockSignupApi(page);

        await page.goto(responsiveTarget.path);
        await expect(page.locator("html")).toHaveAttribute(
          "lang",
          responsiveTarget.locale,
        );
        await expect(page.locator("html")).toHaveClass(
          new RegExp(`(^|\\s)${theme}(\\s|$)`),
        );

        const name = page.getByRole("textbox", { name: responsiveTarget.name });
        const email = page.getByRole("textbox", { name: responsiveTarget.email });
        const checkbox = page.getByRole("checkbox");
        const main = page.getByRole("main");
        const terms = main.getByRole("link", { name: responsiveTarget.terms });
        const privacy = main.getByRole("link", { name: responsiveTarget.privacy });
        const submit = page.getByRole("button", { name: responsiveTarget.submit });
        const nameError = page.locator("#signup-name-error");
        const emailError = page.locator("#signup-email-error");
        const policyError = page.locator("#signup-policy-error");
        const statusRegion = page.locator("form > p[aria-live]");
        await expect(checkbox).not.toBeChecked();
        await expect(terms).toHaveAttribute("href", responsiveTarget.termsPath);
        await expect(privacy).toHaveAttribute("href", responsiveTarget.privacyPath);

        const initialErrorHeights = {
          name: await nameError.evaluate(
            (element) => element.getBoundingClientRect().height,
          ),
          email: await emailError.evaluate(
            (element) => element.getBoundingClientRect().height,
          ),
          policy: await policyError.evaluate(
            (element) => element.getBoundingClientRect().height,
          ),
        };
        const initialStatusHeight = await statusRegion.evaluate(
          (element) => element.getBoundingClientRect().height,
        );

        await test.step("invalid-name state", async () => {
          await submit.click();
          await expect(name).toBeFocused();
          await expect(nameError).not.toHaveText("");
          await expectStableHeight(nameError, initialErrorHeights.name);
          await expectResponsiveState(page);
          await expectNoSeriousAxeViolations(page);
        });

        await test.step("invalid-email state", async () => {
          await name.fill("Alexandra Montserrat de la Vall");
          await email.fill("not-an-email");
          await checkbox.check();
          await submit.click();
          await expect(email).toBeFocused();
          await expect(emailError).toHaveText(responsiveTarget.invalidEmail);
          await expectStableHeight(emailError, initialErrorHeights.email);
          await expectResponsiveState(page);
        });

        await test.step("missing-policy state", async () => {
          await email.fill("alexandra@example.test");
          await checkbox.uncheck();
          await submit.click();
          await expect(checkbox).toBeFocused();
          await expect(policyError).toHaveText(responsiveTarget.invalidPolicy);
          await expectStableHeight(policyError, initialErrorHeights.policy);
          await expectResponsiveState(page);
        });

        await checkbox.check();
        for (const serverState of [
          {
            name: "invalid-request",
            result: { status: "invalid_request" },
            message: responsiveTarget.invalidRequest,
            role: "alert",
          },
          {
            name: "rate-limited",
            result: { status: "rate_limited", retryAfter: 47 },
            message: responsiveTarget.rateLimited,
            role: "status",
          },
          {
            name: "shared-unavailable",
            result: { status: "unavailable" },
            message: responsiveTarget.unavailable,
            role: "alert",
          },
        ] as const) {
          await test.step(`${serverState.name} state`, async () => {
            signupApi.result = serverState.result;
            await submit.click();
            await expect(statusRegion).toHaveAttribute("role", serverState.role);
            await expect(statusRegion).toHaveText(serverState.message);
            await expectStableHeight(statusRegion, initialStatusHeight);
            await expectResponsiveState(page);
          });
        }

        await test.step("pending and accepted states", async () => {
          signupApi.result = { status: "accepted" };
          signupApi.deferNext = true;
          await submit.focus();
          await page.keyboard.press("Enter");
          await expect(statusRegion).toHaveText(responsiveTarget.sending);
          await expect.poll(() => Boolean(signupApi.release)).toBe(true);
          await expectStableHeight(statusRegion, initialStatusHeight);
          await expectResponsiveState(page);
          signupApi.release?.();
          signupApi.release = undefined;
          await expect(statusRegion).toHaveText(responsiveTarget.accepted);
          await expectStableHeight(statusRegion, initialStatusHeight);
          await expectResponsiveState(page);
        });

        await page.screenshot({
          path: testInfo.outputPath(
            `signup-${responsiveTarget.locale}-${theme}-${viewport.name}.png`,
          ),
          fullPage: true,
        });

        for (const recovery of responsiveTarget.recovery) {
          await test.step(`${recovery.state} state`, async () => {
            await page.goto(`${responsiveTarget.path}?state=${recovery.state}`);
            await expect(page.locator("html")).toHaveClass(
              new RegExp(`(^|\\s)${theme}(\\s|$)`),
            );
            await expect(
              page.getByRole("heading", { name: recovery.title }),
            ).toBeVisible();
            await expect(
              page
                .getByRole("main")
                .getByRole("link", { name: recovery.action }),
            ).toBeVisible();
            await expectResponsiveState(page);
          });
        }
      },
    );
  }
}