import { safeCapturedHeaders } from "@/lib/constants";
import { createWebhookSignature } from "@/lib/security";
import { assertSafeDestinationUrl } from "@/lib/destination-security";

export type DeliveryResult = {
  ok: boolean;
  status: number | null;
  body: string;
  responseHeaders: Record<string, string>;
  error: string | null;
  latencyMs: number;
};

export type DeliveryMode = "forward" | "replay" | "retry" | "outbound";
export type SigningContext = { secret: string; previousSecret?: string | null; deliveryId: string };
export type DeliveryContent = { rawBody?: string | null; contentType?: string | null };

export async function deliverWebhook(
  destinationUrl: string,
  payload: unknown,
  mode: DeliveryMode,
  extraHeaders: Record<string, string> = {},
  signing?: SigningContext,
  content?: DeliveryContent
): Promise<DeliveryResult> {
  const started = Date.now();
  const body = content?.rawBody ?? JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatures = signing ? [signing.secret, signing.previousSecret].filter(Boolean).map((secret) => `v1,${createWebhookSignature(String(secret), signing.deliveryId, timestamp, body)}`).join(" ") : null;
  const signedHeaders: Record<string, string> = signing ? {
    "payloadgrid-id": signing.deliveryId,
    "payloadgrid-timestamp": timestamp,
    "payloadgrid-signature": String(signatures)
  } : {};

  try {
    await assertSafeDestinationUrl(destinationUrl);
    const response = await fetch(destinationUrl, {
      method: "POST",
      headers: {
        "content-type": content?.contentType || "application/json",
        "user-agent": "PayloadGrid-Webhooks/1.0",
        "x-payloadgrid-delivery-mode": mode,
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
      responseHeaders: safeCapturedHeaders(response.headers),
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
