import type { AddressInfo } from "node:net";

import {
  SMTPServer,
  type SMTPServerAuthentication,
  type SMTPServerDataStream,
  type SMTPServerSession,
} from "smtp-server";

export type SmtpBehavior = "accept" | "reject" | "timeout";

export interface CapturedSmtpMessage {
  from: string | null;
  to: string[];
  raw: Buffer;
}

interface TestSmtpServerOptions {
  behavior?: SmtpBehavior;
  clientTimeoutMs?: number;
  port?: number;
}

const HOST = "127.0.0.1";
const USERNAME = "signup-test";
const PASSWORD = "signup-test-password";
const FROM = "Versmedit Test <no-reply@example.test>";

function smtpError(message: string, responseCode: number) {
  return Object.assign(new Error(message), { responseCode });
}

export async function startTestSmtpServer(options: TestSmtpServerOptions = {}) {
  let behavior = options.behavior ?? "accept";
  let stopped = false;
  const messages: CapturedSmtpMessage[] = [];

  const server = new SMTPServer({
    name: "smtp.example.test",
    authOptional: false,
    allowInsecureAuth: true,
    disabledCommands: ["STARTTLS"],
    disableReverseLookup: true,
    closeTimeout: 100,
    socketTimeout: 5_000,
    onAuth(
      auth: SMTPServerAuthentication,
      _session: SMTPServerSession,
      callback,
    ) {
      if (auth.username !== USERNAME || auth.password !== PASSWORD) {
        callback(smtpError("Authentication failed", 535));
        return;
      }
      callback(null, { user: USERNAME });
    },
    onRcptTo(_address, _session, callback) {
      if (behavior === "reject") {
        callback(smtpError("Recipient rejected", 550));
        return;
      }
      callback();
    },
    onData(
      stream: SMTPServerDataStream,
      session: SMTPServerSession,
      callback,
    ) {
      if (behavior === "timeout") {
        stream.resume();
        return;
      }

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.once("error", callback);
      stream.once("end", () => {
        messages.push({
          from: session.envelope.mailFrom
            ? session.envelope.mailFrom.address
            : null,
          to: session.envelope.rcptTo.map((recipient) => recipient.address),
          raw: Buffer.concat(chunks),
        });
        callback();
      });
    },
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("error", onError);
      reject(error);
    };
    server.once("error", onError);
    server.listen(options.port ?? 0, HOST, () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.server.address() as AddressInfo;
  const clientTimeoutMs = options.clientTimeoutMs ?? 250;

  return {
    host: HOST,
    port: address.port,
    messages,
    transportConfig: {
      server: {
        host: HOST,
        port: address.port,
        secure: false,
        ignoreTLS: true,
        connectionTimeout: clientTimeoutMs,
        greetingTimeout: clientTimeoutMs,
        socketTimeout: clientTimeoutMs,
        auth: {
          user: USERNAME,
          pass: PASSWORD,
        },
      },
      from: FROM,
    },
    setBehavior(nextBehavior: SmtpBehavior) {
      behavior = nextBehavior;
    },
    reset() {
      messages.splice(0);
      behavior = options.behavior ?? "accept";
    },
    async stop() {
      if (stopped) return;
      stopped = true;

      for (const connection of server.connections) {
        connection.close?.();
        connection.destroy?.();
      }

      await new Promise<void>((resolve) => {
        server.close(resolve);
      });
    },
  };
}