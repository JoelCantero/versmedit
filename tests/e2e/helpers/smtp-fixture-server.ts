import { createServer } from "node:http";

import { startTestSmtpServer } from "../../helpers/smtp-server.ts";

const smtpPort = Number(process.env.E2E_SMTP_PORT);
const controlPort = Number(process.env.E2E_SMTP_HTTP_PORT);

if (!Number.isInteger(smtpPort) || !Number.isInteger(controlPort)) {
  throw new Error("E2E_SMTP_PORT and E2E_SMTP_HTTP_PORT are required integers");
}

const smtp = await startTestSmtpServer({ port: smtpPort, clientTimeoutMs: 1_000 });
const control = createServer((request, response) => {
  response.setHeader("content-type", "application/json");

  if (request.method === "GET" && request.url === "/health") {
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.method === "POST" && request.url === "/reset") {
    smtp.reset();
    response.end(JSON.stringify({ status: "reset" }));
    return;
  }
  if (request.method === "GET" && request.url === "/messages") {
    response.end(
      JSON.stringify({
        messages: smtp.messages.map((message) => ({
          from: message.from,
          to: message.to,
          raw: message.raw.toString("utf8"),
        })),
      }),
    );
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ status: "not_found" }));
});

await new Promise<void>((resolve, reject) => {
  control.once("error", reject);
  control.listen(controlPort, "127.0.0.1", () => {
    control.off("error", reject);
    resolve();
  });
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await new Promise<void>((resolve) => control.close(() => resolve()));
  await smtp.stop();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void stop().finally(() => process.exit(0));
  });
}

console.log(
  `E2E SMTP fixture ready on 127.0.0.1:${smtp.port} with control port ${controlPort}`,
);