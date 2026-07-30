export type DeliveryResult = {
  ok: boolean;
  status: number | null;
  body: string;
  error: string | null;
  latencyMs: number;
};

export type DeliveryMode = "forward" | "replay" | "retry";

export async function deliverWebhook(destinationUrl: string, payload: unknown, mode: DeliveryMode, extraHeaders: Record<string, string> = {}): Promise<DeliveryResult> {
  const started = Date.now();
  try {
    const response = await fetch(destinationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hookin-delivery-mode": mode,
        ...extraHeaders
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    return {
      ok: response.ok,
      status: response.status,
      body: (await response.text().catch(() => "")).slice(0, 4000),
      error: null,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: "",
      error: error instanceof Error ? error.message : "Delivery failed",
      latencyMs: Date.now() - started
    };
  }
}

export function nextRetryDelayMinutes(attemptNumber: number) {
  const delays = [1, 5, 30, 120];
  return delays[Math.min(Math.max(attemptNumber - 1, 0), delays.length - 1)];
}

export function shouldRetry(attemptNumber: number, maxRetries: number) {
  return attemptNumber < maxRetries;
}
