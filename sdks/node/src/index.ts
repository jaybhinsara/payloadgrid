import { createHmac, timingSafeEqual } from "node:crypto";

export type CreateMessage = { applicationId: string; eventType: string; payload: unknown; idempotencyKey?: string };
export type AcceptedMessage = { ok: true; messageId: string; status: "accepted" | "queued" | "processing" | "delivered" | "partial" | "failed"; duplicate: boolean; queuedDeliveries: number };
export type SignatureHeaders = { id: string; timestamp: string; signature: string };

export class PayloadGrid {
  readonly apiKey: string;
  readonly baseUrl: string;
  constructor(options: { apiKey: string; baseUrl?: string }) {
    if (!options.apiKey) throw new Error("PayloadGrid apiKey is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || "https://payloadgrid.com").replace(/\/$/, "");
  }
  async messagesCreate(input: CreateMessage): Promise<AcceptedMessage> {
    const response = await fetch(`${this.baseUrl}/api/v1/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", ...(input.idempotencyKey ? { "idempotency-key": input.idempotencyKey } : {}) },
      body: JSON.stringify({ applicationId: input.applicationId, eventType: input.eventType, payload: input.payload })
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(String(body.error || `PayloadGrid request failed with ${response.status}`));
    return body as AcceptedMessage;
  }
}

export function verifyPayloadGridSignature(secret: string, rawBody: string, headers: SignatureHeaders, toleranceSeconds = 300) {
  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) return false;
  const received = headers.signature.startsWith("v1,") ? headers.signature.slice(3) : headers.signature;
  const expected = createHmac("sha256", secret).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest("base64");
  const left = Buffer.from(expected); const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}