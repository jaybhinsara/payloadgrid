import { createHmac, timingSafeEqual } from "node:crypto";

export class PayloadGridError extends Error {
  constructor(message, status, details) {
    super(message); this.name = "PayloadGridError"; this.status = status; this.details = details;
  }
}

function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

export class PayloadGrid {
  constructor(options) {
    if (!options?.apiKey) throw new Error("PayloadGrid apiKey is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://payloadgrid.com").replace(/\/$/, "");
    this.timeoutMs = options.timeoutMs || 15000;
    this.retries = options.retries ?? 2;
  }

  async request(path, body, idempotencyKey) {
    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            "content-type": "application/json",
            ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs)
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) return payload;
        const retryable = response.status === 429 || response.status >= 500;
        const error = new PayloadGridError(payload.error || `PayloadGrid HTTP ${response.status}`, response.status, payload);
        if (!retryable || attempt === this.retries) throw error;
        const retryAfter = Number(response.headers.get("retry-after") || 0) * 1000;
        await sleep(retryAfter || 250 * 2 ** attempt);
      } catch (error) {
        lastError = error;
        if (error instanceof PayloadGridError || attempt === this.retries) throw error;
        await sleep(250 * 2 ** attempt);
      }
    }
    throw lastError;
  }

  send(event, options = {}) {
    return this.request("/api/v1/messages", event, options.idempotencyKey);
  }

  sendBatch(events) {
    return this.request("/api/v1/messages/batch", { events });
  }
}

export function verifyWebhook(rawBody, headers, secret, options = {}) {
  const id = headers["payloadgrid-id"] || headers["PayloadGrid-Id"];
  const timestamp = headers["payloadgrid-timestamp"] || headers["PayloadGrid-Timestamp"];
  const signatureHeader = headers["payloadgrid-signature"] || headers["PayloadGrid-Signature"];
  if (!id || !timestamp || !signatureHeader) throw new Error("Missing PayloadGrid signature headers");
  const toleranceSeconds = options.toleranceSeconds ?? 300;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) throw new Error("PayloadGrid signature timestamp is outside tolerance");
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${rawBody}`).digest();
  const signatures = String(signatureHeader).split(/[ ,]+/).filter((value) => value && value !== "v1");
  const verified = signatures.some((value) => {
    try { const received = Buffer.from(value, "base64"); return received.length === expected.length && timingSafeEqual(received, expected); }
    catch { return false; }
  });
  if (!verified) throw new Error("PayloadGrid signature verification failed");
  return { id: String(id), timestamp: Number(timestamp) };
}
