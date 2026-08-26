import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { previewManifest } from "../../emails/lib/preview-manifest";

const futureTriggerPaths = [
  "/api/email/personal-data-export-ready",
  "/api/email/account-deleted",
  "/api/email/email-change-requested",
  "/api/email/email-changed",
  "/api/email/security-alert",
  "/api/email/generic-confirmation",
] as const;

async function getFreePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("could not reserve a startup-test port");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({
      code: child.exitCode,
      signal: child.signalCode,
    });
  }

  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("malformed standalone server did not exit"));
      }, timeoutMs);
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code, signal) => {
        clearTimeout(timeout);
        resolve({ code, signal });
      });
    },
  );
}

test("exits before health with a redacted malformed-brand diagnostic", async () => {
  const distDir = process.env.NEXT_DIST_DIR ?? ".next";
  const serverPath = path.resolve(distDir, "standalone", "server.js");
  const port = await getFreePort();
  const invalidValue = `private-invalid-color-${crypto.randomUUID()}`;
  let output = "";
  let healthSucceeded = false;
  const child = spawn(process.execPath, [serverPath], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      NEXTAUTH_URL: `http://127.0.0.1:${port}`,
      MAIL_ENABLED: "true",
      BRAND_COLOR: invalidValue,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk: Buffer) => {
    output = `${output}${chunk.toString("utf8")}`.slice(-65_536);
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  const probeHealth = (async () => {
    while (child.exitCode === null && child.signalCode === null) {
      try {
        const response = await fetch(
          `http://127.0.0.1:${port}/api/health`,
          { signal: AbortSignal.timeout(100) },
        );
        if (response.ok) healthSucceeded = true;
      } catch {
        // The malformed process is expected to refuse or close the connection.
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  })();

  try {
    const result = await waitForExit(child, 15_000);
    await probeHealth;

    expect(result.code).not.toBe(0);
    expect(healthSucceeded).toBe(false);
    expect(output).toContain("BRAND_COLOR");
    expect(output).not.toContain(invalidValue);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }
});

test("keeps preview pages and future email triggers absent from production", async ({
  request,
}) => {
  for (const { path: previewPath } of previewManifest) {
    const response = await request.get(previewPath);
    expect(response.status(), previewPath).toBe(404);
  }

  for (const triggerPath of futureTriggerPaths) {
    const [readResponse, writeResponse] = await Promise.all([
      request.get(triggerPath),
      request.post(triggerPath, { data: {} }),
    ]);
    expect(readResponse.status(), `GET ${triggerPath}`).toBe(404);
    expect(writeResponse.status(), `POST ${triggerPath}`).toBe(404);
  }
});