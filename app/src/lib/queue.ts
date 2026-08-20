import { Client } from "@upstash/qstash";
import { appUrl } from "@/lib/constants";

export type QueueDeliveryInput = {
  eventId: string;
  endpointId: string;
  workspaceId: string;
  attempt: number;
  delaySeconds?: number;
  workspaceRateLimitPerMinute?: number;
  workspaceParallelism?: number;
  deduplicationId?: string;
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
    deduplicationId: input.deduplicationId || `${input.eventId}-attempt-${input.attempt}`,
    retries: 3,
    retryDelay: "max(1000, pow(2, retried) * 1000)",
    timeout: "30s",
    label: ["payloadgrid-delivery", `workspace-${input.workspaceId}`, `endpoint-${input.endpointId}`],
    flowControl: {
      key: `workspace-${input.workspaceId}`,
      parallelism: Math.max(1, input.workspaceParallelism || 10),
      rate: Math.max(1, input.workspaceRateLimitPerMinute || 600),
      period: "1m"
    },
    redact: { body: true }
  });
  return { queued: true as const, messageId: result.messageId };
}
