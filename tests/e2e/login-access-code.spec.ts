import { createHash, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import {
  cleanupAuthenticatedUsers,
  seedAuthenticatedUser,
} from "./helpers/authenticated-user";

const providerControlUrl = process.env.E2E_PROVIDER_HTTP_URL;
const provider = process.env.E2E_MAIL_PROVIDER ?? "brevo";
const providerTarget = `${provider}.send`;
const createdClientIdentifiers = new Set<string>();
const createdEmails = new Set<string>();

const CODE_LINE = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{10}$/m;

interface CapturedProviderRequest {
  target: string;
  body: string;
}

async function deliveredBodies(recipient: string) {
  const response = await fetch(`${providerControlUrl}/control/requests`);
  if (!response.ok) throw new Error("provider captures were unavailable");
  const { requests } = (await response.json()) as {
    requests: CapturedProviderRequest[];
  };
  return requests
    .filter(
      (request) =>
        request.target === providerTarget && request.body.includes(recipient),
    )
    .map((request) => request.body);
}

async function waitForLoginCode(recipient: string) {
  let code: string | null = null;
  await expect
    .poll(async () => {
      for (const body of await deliveredBodies(recipient)) {
        const payload = JSON.parse(body) as Record<string, unknown>;
        const text = (payload.textContent ??
          (payload.Messages as Array<Record<string, string>> | undefined)?.[0]
            ?.TextPart ??
          "") as string;
        const match = text.match(CODE_LINE);
        if (match) {
          code = match[0];
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  return code!;
}

async function cleanupClientLimiters() {
  if (createdClientIdentifiers.size === 0 && createdEmails.size === 0) return;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return;
  const pool = new Pool({ connectionString });
  try {
    const keys = [
      ...[...createdClientIdentifiers].flatMap((client) => [
        `auth:email:client:${client}`,
        `auth:login-code:client:${client}`,
      ]),
      ...[...createdEmails].flatMap((email) => {
        const digest = createHash("sha256").update(email).digest("hex");
        return [
          `auth:email:address:${digest}`,
          `auth:login-code:address:${digest}`,
        ];
      }),
    ];
    await pool.query(`DELETE FROM "RateLimitBucket" WHERE "key" = ANY($1)`, [
      keys,
    ]);
  } finally {
    createdClientIdentifiers.clear();
    createdEmails.clear();
    await pool.end();
  }
}

test.afterEach(async () => {
  await cleanupClientLimiters();
  await cleanupAuthenticatedUsers();
});

test.describe("login access code", () => {
  test.skip(
    !providerControlUrl,
    "controlled HTTP provider fixture is required",
  );

  test("walks the three login steps and signs in with the emailed code", async ({
    page,
  }) => {
    const user = await seedAuthenticatedUser();
    const clientSeed = randomUUID().replaceAll("-", "");
    const client = `2001:db8:${clientSeed.slice(0, 4)}:${clientSeed.slice(4, 8)}::2`;
    createdClientIdentifiers.add(client);
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": client });

    await page.goto("/login?callbackUrl=%2Faccount");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeEditable();
    await page.getByRole("textbox", { name: "Email" }).fill(user.email);
    await page.getByRole("button", { name: "Send sign-in link" }).click();
    createdEmails.add(user.email);

    // Confirmation step: same URL, no history entry, address echoed back.
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expect(page.getByText(user.email)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
    expect(new URL(page.url()).search).toBe("?callbackUrl=%2Faccount");

    const code = await waitForLoginCode(user.email);

    await page.getByRole("button", { name: "Enter code manually" }).click();
    await expect(
      page.getByRole("heading", { name: "Enter your login code" }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");

    await page
      .getByRole("textbox", { name: "Login code" })
      .fill(`${code.slice(0, 5).toLowerCase()}-${code.slice(5).toLowerCase()}`);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await page.waitForURL("**/account");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("keeps every step on one URL and recovers through back to login", async ({
    page,
  }) => {
    const clientSeed = randomUUID().replaceAll("-", "");
    const client = `2001:db8:${clientSeed.slice(0, 4)}:${clientSeed.slice(4, 8)}::3`;
    createdClientIdentifiers.add(client);
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": client });

    await page.goto("/login");
    const unknown = `login-code-unknown-${randomUUID()}@example.test`;
    createdEmails.add(unknown);
    await expect(page.getByRole("textbox", { name: "Email" })).toBeEditable();
    await page.getByRole("textbox", { name: "Email" }).fill(unknown);
    await page.getByRole("button", { name: "Send sign-in link" }).click();

    // An address with no account is indistinguishable from one that has an account.
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expect(page.getByText(unknown)).toBeVisible();
    expect(await deliveredBodies(unknown)).toHaveLength(0);

    await page.getByRole("button", { name: "Enter code manually" }).click();
    await page.getByRole("textbox", { name: "Login code" }).fill("ABCDEFGHJK");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText(/code is not valid/i)).toBeVisible();

    await page.getByRole("button", { name: "Back to login" }).click();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeEnabled();

    // A reload returns to the email step because no state lives in the URL.
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeEnabled();
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toHaveCount(0);
  });

  test("serves the code endpoint instead of the Auth.js catch-all", async ({
    request,
  }) => {
    const response = await request.post("/api/auth/login/code", {
      form: { email: "someone@example.test", code: "ABCDEFGHJK" },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toEqual({ status: "invalid_request" });
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("fits every step at 320px without overflow @mobile", async ({ page }) => {
    const clientSeed = randomUUID().replaceAll("-", "");
    const client = `2001:db8:${clientSeed.slice(0, 4)}:${clientSeed.slice(4, 8)}::4`;
    createdClientIdentifiers.add(client);
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": client });

    const expectNoHorizontalOverflow = async () => {
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    };

    await page.goto("/login");
    await expectNoHorizontalOverflow();

    const email = `login-code-narrow-${randomUUID()}@example.test`;
    createdEmails.add(email);
    await expect(page.getByRole("textbox", { name: "Email" })).toBeEditable();
    await page.getByRole("textbox", { name: "Email" }).fill(email);
    await page.getByRole("button", { name: "Send sign-in link" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your email" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow();

    await page.getByRole("button", { name: "Enter code manually" }).click();
    await expect(
      page.getByRole("heading", { name: "Enter your login code" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow();
  });
});
