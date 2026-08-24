const providerControlUrl = process.env.E2E_PROVIDER_HTTP_URL;
const providerTarget = `${process.env.E2E_MAIL_PROVIDER ?? "brevo"}.send`;

interface CapturedProviderRequest {
  target: string;
  body: string;
}

interface ProviderBehavior {
  status: number;
  body?: string;
  delayMs?: number;
  disconnect?: boolean;
}

function requireProviderControlUrl() {
  if (!providerControlUrl) {
    throw new Error("E2E_PROVIDER_HTTP_URL is required for this journey");
  }
  return providerControlUrl;
}

export async function resetPersonalDataExportProvider() {
  const response = await fetch(`${requireProviderControlUrl()}/control/reset`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("provider fixture reset was rejected");
}

export async function configureNextPersonalDataExportProviderSend(
  recipient: string,
  behavior: ProviderBehavior,
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

export async function getPersonalDataExportProviderRequests(
  recipient?: string,
) {
  const response = await fetch(
    `${requireProviderControlUrl()}/control/requests`,
  );
  if (!response.ok) throw new Error("provider fixture requests were unavailable");
  const capture = (await response.json()) as {
    requests: CapturedProviderRequest[];
  };
  return capture.requests.filter(
    (request) =>
      request.target === providerTarget &&
      (recipient === undefined || request.body.includes(recipient)),
  );
}

export async function getLatestPersonalDataExportConfirmationUrl(
  recipient: string,
) {
  const requests = await getPersonalDataExportProviderRequests(recipient);
  const sendRequest = requests.at(-1);
  const capturedUrl = sendRequest?.body.match(
    /https?:\/\/[^\s<"\\]+\/api\/account\/data-export\/verify\?token=[A-Za-z0-9_-]{43}(?:(?:&|&amp;|\\u0026)locale=(?:en|es|ca))?/u,
  )?.[0];
  if (!capturedUrl) {
    throw new Error("personal data export confirmation URL was not captured");
  }
  return capturedUrl.replace("&amp;", "&").replace("\\u0026", "&");
}