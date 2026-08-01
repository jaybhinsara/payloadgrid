import { Client } from "@upstash/qstash";
import { appUrl } from "@/lib/constants";

export type QueueDeliveryInput = {
  eventId: string;
  endpointId: string;
  attempt: number;
  delaySeconds?: number;
  rateLimitPerMinute?: number;
};

export function queueConfigured() {
  return Boolean(process.env.QSTASH_TOKEN && process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY);
}

export function queueErrorMessage(error: unknown) {
  let message = error instanceof Error ? error.message : "QStash publish failed";
  const token = process.env.QSTASH_TOKEN;
  if (token) message = message.replaceAll(token, "[redacted]");
  return message.slice(0, 300);
}

export async function enqueueDelivery(input: QueueDeliveryInput) {
  if (!process.env.QSTASH_TOKEN) return { queued: false as const, reason: "QStash is not configured" };
  const client = new Client({ token: process.env.QSTASH_TOKEN });
  const result = await client.publishJSON({
    url: `${appUrl()}/api/jobs/deliver`,
    body: { eventId: input.eventId },
    delay: input.delaySeconds || 0,
    deduplicationId: `${input.eventId}-attempt-${input.attempt}`,
    retries: 3,
    retryDelay: "max(1000, pow(2, retried) * 1000)",
    timeout: "30s",
    label: ["payloadgrid-delivery", `endpoint-${input.endpointId}`],
    flowControl: {
      key: `endpoint-${input.endpointId}`,
      parallelism: 5,
      rate: Math.max(1, input.rateLimitPerMinute || 120),
      period: "1m"
    },
    redact: { body: true }
  });
  return { queued: true as const, messageId: result.messageId };
}