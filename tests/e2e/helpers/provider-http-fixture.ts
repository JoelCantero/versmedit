import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const port = Number(process.env.E2E_PROVIDER_HTTP_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("E2E_PROVIDER_HTTP_PORT must be a valid port");
}

type ProviderTarget =
  | "brevo.health"
  | "brevo.send"
  | "mailjet.health"
  | "mailjet.send";

interface ProviderBehavior {
  status: number;
  headers?: Record<string, string>;
  body?: string;
  delayMs?: number;
  disconnect?: boolean;
}

interface CapturedRequest {
  target: ProviderTarget;
  logicalUrl: string;
  method: string;
  headers: Record<string, string | string[]>;
  body: string;
}

const targetByPath = new Map<string, ProviderTarget>([
  ["/provider/brevo/health", "brevo.health"],
  ["/provider/brevo/send", "brevo.send"],
  ["/provider/mailjet/health", "mailjet.health"],
  ["/provider/mailjet/send", "mailjet.send"],
]);
const logicalUrlByTarget: Record<ProviderTarget, string> = {
  "brevo.health": "https://api.brevo.com/v3/account",
  "brevo.send": "https://api.brevo.com/v3/smtp/email",
  "mailjet.health": "https://api.mailjet.com/v3/REST/sender?Limit=1",
  "mailjet.send": "https://api.mailjet.com/v3.1/send",
};
const requests: CapturedRequest[] = [];
const behaviors = new Map<ProviderTarget, ProviderBehavior>();

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > 1_048_576) throw new Error("fixture request body too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function defaultResponse(target: ProviderTarget, body: string): ProviderBehavior {
  if (target.endsWith(".health")) {
    return { status: 200, body: "{}" };
  }
  if (target === "brevo.send") {
    return {
      status: 201,
      body: JSON.stringify({ messageId: `e2e-brevo-${requests.length}` }),
    };
  }

  let recipient = "unknown@example.test";
  try {
    const parsed = JSON.parse(body) as {
      Messages?: Array<{ To?: Array<{ Email?: string }> }>;
    };
    recipient = parsed.Messages?.[0]?.To?.[0]?.Email ?? recipient;
  } catch {
    // The application adapter decides how malformed requests are handled.
  }
  return {
    status: 200,
    body: JSON.stringify({
      Messages: [
        {
          Status: "success",
          To: [
            {
              Email: recipient,
              MessageUUID: `e2e-mailjet-${requests.length}`,
            },
          ],
        },
      ],
    }),
  };
}

async function handleControl(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
) {
  if (request.method === "GET" && pathname === "/control/health") {
    json(response, 200, { status: "ok" });
    return true;
  }
  if (request.method === "POST" && pathname === "/control/reset") {
    requests.splice(0);
    behaviors.clear();
    json(response, 200, { status: "reset" });
    return true;
  }
  if (request.method === "GET" && pathname === "/control/requests") {
    json(response, 200, { requests });
    return true;
  }
  if (request.method === "POST" && pathname === "/control/behavior") {
    const payload = JSON.parse(await readBody(request)) as {
      target?: ProviderTarget;
      behavior?: ProviderBehavior;
    };
    if (!payload.target || !logicalUrlByTarget[payload.target] || !payload.behavior) {
      json(response, 400, { status: "invalid" });
      return true;
    }
    const { status, delayMs } = payload.behavior;
    if (
      !Number.isInteger(status) ||
      status < 100 ||
      status > 599 ||
      (delayMs !== undefined && (!Number.isInteger(delayMs) || delayMs < 0))
    ) {
      json(response, 400, { status: "invalid" });
      return true;
    }
    behaviors.set(payload.target, payload.behavior);
    json(response, 200, { status: "configured", target: payload.target });
    return true;
  }
  return false;
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://fixture.test").pathname;
    if (await handleControl(request, response, pathname)) return;

    const target = targetByPath.get(pathname);
    if (!target) {
      json(response, 404, { status: "not_found" });
      return;
    }
    const body = await readBody(request);
    requests.push({
      target,
      logicalUrl: logicalUrlByTarget[target],
      method: request.method ?? "GET",
      headers: request.headers as Record<string, string | string[]>,
      body,
    });
    const behavior = behaviors.get(target) ?? defaultResponse(target, body);
    if (behavior.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, behavior.delayMs));
    }
    if (behavior.disconnect) {
      request.socket.destroy();
      return;
    }
    response.statusCode = behavior.status;
    for (const [name, value] of Object.entries(
      behavior.headers ?? { "content-type": "application/json" },
    )) {
      response.setHeader(name, value);
    }
    response.end(behavior.body ?? "");
  } catch {
    if (!response.headersSent) json(response, 400, { status: "invalid" });
    else response.destroy();
  }
});

await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", () => {
    server.off("error", reject);
    resolve();
  });
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void stop().finally(() => process.exit(0));
  });
}

console.log(`E2E provider fixture ready on 127.0.0.1:${port}`);
