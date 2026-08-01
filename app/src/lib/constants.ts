import { SITE_URL } from "@/lib/site";

export type Provider = "razorpay" | "stripe" | "cashfree" | "shopify" | "custom";
export type WebhookStatus = "queued" | "processing" | "received" | "delivered" | "failed" | "retrying";

export const providers = [
  { id: "razorpay", name: "Razorpay", category: "Payments", color: "#2563eb" },
  { id: "stripe", name: "Stripe", category: "Payments", color: "#635bff" },
  { id: "cashfree", name: "Cashfree", category: "Payments", color: "#16a34a" },
  { id: "shopify", name: "Shopify", category: "Commerce", color: "#22c55e" },
  { id: "custom", name: "Custom", category: "API", color: "#0f172a" }
] as const;

export function appUrl() { return SITE_URL; }

export function eventTypeFromPayload(payload: unknown, provider: Provider, headers?: Headers) {
  if (provider === "shopify" && headers?.get("x-shopify-topic")) return String(headers.get("x-shopify-topic"));
  if (!payload || typeof payload !== "object") return "custom.event";
  const body = payload as Record<string, unknown>;
  return String(body.event || body.type || body.event_type || body.topic || "custom.event");
}

export function providerEventIdFromPayload(payload: unknown, provider: Provider, headers?: Headers) {
  const byHeader = provider === "razorpay" ? headers?.get("x-razorpay-event-id")
    : provider === "shopify" ? headers?.get("x-shopify-webhook-id")
    : provider === "cashfree" ? headers?.get("x-idempotency-key")
    : null;
  if (byHeader) return byHeader;
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  return body.id || body.event_id || body.order_id || body.payment_id || null;
}

function readNestedValue(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function numericValue(source: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = readNestedValue(source, path);
    const amount = typeof value === "string" ? Number(value) : value;
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) return amount;
  }
  return 0;
}

function normalizedCurrency(payload: unknown, provider: Provider) {
  const paths = provider === "razorpay"
    ? [["payload", "payment", "entity", "currency"], ["payload", "order", "entity", "currency"]]
    : provider === "stripe"
      ? [["data", "object", "currency"]]
      : provider === "cashfree"
        ? [["data", "payment", "payment_currency"], ["data", "order", "order_currency"]]
        : provider === "shopify"
          ? [["currency"], ["presentment_currency"]]
          : [["currency"], ["data", "currency"]];
  for (const path of paths) {
    const value = readNestedValue(payload, path);
    if (typeof value === "string" && /^[a-z]{3}$/i.test(value)) return value.toUpperCase();
  }
  return null;
}

function minorToMajor(amount: number, currency: string) {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    return amount / (10 ** (digits ?? 2));
  } catch {
    return 0;
  }
}

export function amountFromPayload(payload: unknown, provider: Provider) {
  const currency = normalizedCurrency(payload, provider);
  if (!currency) return { amount: 0, currency: null };
  if (provider === "razorpay") {
    const minor = numericValue(payload, [["payload", "payment", "entity", "amount"], ["payload", "order", "entity", "amount"]]);
    return { amount: minorToMajor(minor, currency), currency };
  }
  if (provider === "stripe") {
    const minor = numericValue(payload, [["data", "object", "amount"], ["data", "object", "amount_received"], ["data", "object", "amount_paid"]]);
    return { amount: minorToMajor(minor, currency), currency };
  }
  if (provider === "cashfree") {
    return { amount: numericValue(payload, [["data", "payment", "payment_amount"], ["data", "order", "order_amount"]]), currency };
  }
  if (provider === "shopify") {
    return { amount: numericValue(payload, [["current_total_price"], ["total_price"]]), currency };
  }
  return { amount: numericValue(payload, [["amount"], ["value"], ["data", "amount"]]), currency };
}
export function safeCapturedHeaders(headers: Headers) {
  const result: Record<string, string> = {};
  for (const [name, value] of headers.entries()) {
    result[name] = /(authorization|cookie|signature|token|secret|api-key)/i.test(name) ? "[redacted]" : value.slice(0, 1000);
  }
  return result;
}