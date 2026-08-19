import type { ProviderHttpClient } from "@/lib/email/types";

export interface CapturedProviderRequest {
  logicalUrl: string;
  method: string;
  headers: Headers;
  body: string | null;
}

export type FakeProviderBehavior =
  | {
      status?: number;
      headers?: HeadersInit;
      body?: string;
      delayMs?: number;
    }
  | { error: Error; delayMs?: number };

export function createHttpMailProvider(
  initialBehaviors: FakeProviderBehavior[] = [],
) {
  const behaviors = [...initialBehaviors];
  const requests: CapturedProviderRequest[] = [];

  const client: ProviderHttpClient = async (logicalUrl, init) => {
    requests.push({
      logicalUrl,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? init.body : null,
    });

    const behavior: FakeProviderBehavior = behaviors.shift() ?? {
      status: 200,
      headers: { "content-type": "application/json" },
      body: "{}",
    };
    if (behavior.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, behavior.delayMs);
        init.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(init.signal?.reason);
          },
          { once: true },
        );
      });
    }
    if ("error" in behavior) throw behavior.error;
    return new Response(behavior.body ?? "", {
      status: behavior.status ?? 200,
      headers: behavior.headers ?? { "content-type": "application/json" },
    });
  };

  return {
    client,
    requests,
    enqueue(...next: FakeProviderBehavior[]) {
      behaviors.push(...next);
    },
  };
}