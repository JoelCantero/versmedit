// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { previewManifest } from "../../emails/lib/preview-manifest";
import { createBrevoProvider } from "@/lib/email/brevo";
import { createMailjetProvider } from "@/lib/email/mailjet";
import {
  renderEmailPresentation,
  validateEmailBrand,
  type EmailPresentationRequest,
} from "@/lib/email/presentation";
import {
  EMAIL_REQUEST_LIMIT_BYTES,
  type TransactionalEmail,
} from "@/lib/email/types";
import { createHttpMailProvider } from "../helpers/http-mail-provider";

const longBrand = validateEmailBrand({
  productName: "P".repeat(70),
  canonicalOrigin: "https://app.example.test",
  primaryColor: "#0057B8",
  supportEmail: "support@example.test",
  legalName: "L".repeat(200),
  legalAddress: "A".repeat(500),
  logoUrl: `https://assets.example.test/mail/${"i".repeat(1_900)}.png`,
});

const longActionUrl =
  `https://preview.example.test/actions/confirmation?token=` +
  "t".repeat(1_900);
const longFictionalEmail =
  `${"n".repeat(60)}@${"d".repeat(60)}.${"e".repeat(60)}.` +
  `${"f".repeat(60)}.test`;
const recipient = "catalogue-fixture-recipient@example.test";

const providerConfig = {
  fromEmail: "no-reply@example.test",
  senderName: "Release Contract",
  brand: longBrand,
  sendTimeoutMs: 2_500 as const,
  healthTimeoutMs: 1_500 as const,
  responseLimitBytes: 65_536 as const,
};

function addRepresentativeLongValues(
  request: EmailPresentationRequest,
): Record<string, unknown> {
  const expanded: Record<string, unknown> = { ...request, brand: longBrand };

  if (
    "actionUrl" in request &&
    request.variant !== "existingAccountSignupNotice"
  ) {
    expanded.actionUrl = longActionUrl;
  }
  if ("newEmail" in request) expanded.newEmail = longFictionalEmail;
  if ("reference" in request) expanded.reference = "R".repeat(80);

  return expanded;
}

async function renderCatalogue(): Promise<TransactionalEmail[]> {
  return Promise.all(
    previewManifest.map(async ({ locale, request }) => ({
      recipient,
      locale,
      ...(await renderEmailPresentation(addRepresentativeLongValues(request))),
    })),
  );
}

function percentile95(durations: number[]): number {
  const ordered = durations.toSorted((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
}

describe("email presentation release contract", () => {
  it("keeps every catalogue render below one MiB through both provider adapters", async () => {
    const messages = await renderCatalogue();
    const brevoHttp = createHttpMailProvider();
    const mailjetHttp = createHttpMailProvider();
    const brevo = createBrevoProvider(
      {
        ...providerConfig,
        enabled: true,
        provider: "brevo",
        apiKey: "brevo-release-key",
      },
      brevoHttp.client,
    );
    const mailjet = createMailjetProvider(
      {
        ...providerConfig,
        enabled: true,
        provider: "mailjet",
        apiKey: "mailjet-release-key",
        apiSecret: "mailjet-release-secret",
      },
      mailjetHttp.client,
    );

    for (const message of messages) {
      await brevo.send(message);
      await mailjet.send(message);
    }

    expect(messages).toHaveLength(36);
    for (const requests of [brevoHttp.requests, mailjetHttp.requests]) {
      expect(requests).toHaveLength(36);
      for (const request of requests) {
        expect(request.body).not.toBeNull();
        expect(Buffer.byteLength(request.body!, "utf8")).toBeLessThan(
          EMAIL_REQUEST_LIMIT_BYTES,
        );
      }
    }
  });

  it("renders the warm catalogue with p95 below 100 ms and total below five seconds", async () => {
    await renderEmailPresentation(
      addRepresentativeLongValues(previewManifest[0]!.request),
    );
    const durations: number[] = [];
    const startedAt = performance.now();

    for (const { request } of previewManifest) {
      const renderStartedAt = performance.now();
      await renderEmailPresentation(addRepresentativeLongValues(request));
      durations.push(performance.now() - renderStartedAt);
    }

    expect(performance.now() - startedAt).toBeLessThan(5_000);
    expect(percentile95(durations)).toBeLessThan(100);
  });
});