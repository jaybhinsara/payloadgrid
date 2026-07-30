import { createWebhookSignature } from "@/lib/security";

export type DeliveryResult = {
  ok: boolean;
  status: number | null;
  body: string;
  responseHeaders: Record<string, string>;
  error: string | null;
  latencyMs: number;
};

export type DeliveryMode = "forward" | "replay" | "retry" | "outbound";
export type SigningContext = { secret: string; deliveryId: string };

export async function deliverWebhook(
  destinationUrl: string,
  payload: unknown,
  mode: DeliveryMode,
  extraHeaders: Record<string, string> = {},
  signing?: SigningContext
): Promise<DeliveryResult> {
  const started = Date.now();
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedHeaders: Record<string, string> = signing ? {
    "hookin-id": signing.deliveryId,
    "hookin-timestamp": timestamp,
    "hookin-signature": `v1,${createWebhookSignature(signing.secret, signing.deliveryId, timestamp, body)}`
  } : {};

  try {
    const response = await fetch(destinationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "HookIn-Webhooks/1.0",
        "x-hookin-delivery-mode": mode,
        ...signedHeaders,
        ...extraHeaders
      },
      body,
      signal: AbortSignal.timeout(15000)
    });
    return {
      ok: response.ok,
      status: response.status,
      body: (await response.text().catch(() => "")).slice(0, 4000),
      responseHeaders: Object.fromEntries(response.headers.entries()),
      error: null,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: "",
      responseHeaders: {},
      error: error instanceof Error ? error.message : "Delivery failed",
      latencyMs: Date.now() - started
    };
  }
}

export function nextRetryDelayMinutes(attemptNumber: number) {
  const delays = [1, 5, 30, 120, 360, 720];
  return delays[Math.min(Math.max(attemptNumber - 1, 0), delays.length - 1)];
}

export function shouldRetry(attemptNumber: number, maxRetries: number) {
  return attemptNumber < maxRetries;
}