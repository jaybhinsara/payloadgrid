import { deliverWebhook, type DeliveryContent, type DeliveryMode, type DeliveryResult, type SigningContext } from "@/lib/delivery";

export type DestinationType = "webhook";
export type DestinationInput = {
  type: DestinationType;
  url: string;
  payload: unknown;
  mode: DeliveryMode;
  headers?: Record<string, string>;
  signing?: SigningContext;
  content?: DeliveryContent;
};

type DestinationAdapter = (input: DestinationInput) => Promise<DeliveryResult>;

const adapters: Record<DestinationType, DestinationAdapter> = {
  webhook: (input) => deliverWebhook(input.url, input.payload, input.mode, input.headers, input.signing, input.content)
};

export function deliverToDestination(input: DestinationInput) {
  const adapter = adapters[input.type];
  if (!adapter) throw new Error(`Unsupported destination type: ${input.type}`);
  return adapter(input);
}

const blockedHeaders = /^(host|content-length|content-type|user-agent|payloadgrid-|x-payloadgrid-)/i;
export function normalizeDeliveryHeaders(value: Record<string, string>) {
  const entries = Object.entries(value);
  if (entries.length > 20) throw new Error("At most 20 custom delivery headers are allowed");
  const result: Record<string, string> = {};
  for (const [rawName, rawValue] of entries) {
    const name = rawName.trim().toLowerCase();
    if (!/^[a-z0-9!#$%&'*+.^_`|~-]+$/.test(name) || blockedHeaders.test(name)) throw new Error(`Delivery header is not allowed: ${rawName}`);
    if (rawValue.length > 2000) throw new Error(`Delivery header value is too long: ${rawName}`);
    result[name] = rawValue;
  }
  return result;
}
