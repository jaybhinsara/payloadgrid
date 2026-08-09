export type PayloadGridOptions = { apiKey: string; baseUrl?: string; timeoutMs?: number; retries?: number };
export type MessageInput = { applicationId: string; eventType: string; payload: unknown; idempotencyKey?: string };
export type AcceptedMessage = { ok: boolean; messageId: string; status: string; duplicate: boolean; queuedDeliveries: number; scheduledDeliveries: number };
export type BatchResult = { ok: boolean; accepted: number; rejected: number; results: Array<(AcceptedMessage & { index: number }) | { index: number; ok: false; error: string }> };
export class PayloadGridError extends Error { status: number; details: unknown; constructor(message: string, status: number, details: unknown); }
export class PayloadGrid {
  constructor(options: PayloadGridOptions);
  send(event: Omit<MessageInput, "idempotencyKey">, options?: { idempotencyKey?: string }): Promise<AcceptedMessage>;
  sendBatch(events: MessageInput[]): Promise<BatchResult>;
}
export function verifyWebhook(rawBody: string | Buffer, headers: Record<string, string | undefined>, secret: string, options?: { toleranceSeconds?: number }): { id: string; timestamp: number };
