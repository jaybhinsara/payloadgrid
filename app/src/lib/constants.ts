import { SITE_URL } from "@/lib/site";

export type Provider = "razorpay" | "stripe" | "cashfree" | "shopify" | "custom";
export type WebhookStatus = "received" | "delivered" | "failed" | "retrying";

export const providers = [
  { id: "razorpay", name: "Razorpay", category: "Payments", color: "#2563eb" },
  { id: "stripe", name: "Stripe", category: "Payments", color: "#635bff" },
  { id: "cashfree", name: "Cashfree", category: "Payments", color: "#16a34a" },
  { id: "shopify", name: "Shopify", category: "Commerce", color: "#22c55e" },
  { id: "custom", name: "Custom", category: "API", color: "#0f172a" }
] as const;

export function appUrl() {
  return SITE_URL;
}

export function eventTypeFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return "custom.event";
  const body = payload as Record<string, unknown>;
  return String(body.event || body.type || body.event_type || body.topic || "custom.event");
}

export function providerEventIdFromPayload(payload: unknown) {
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

export function amountFromPayload(payload: unknown) {
  const candidates = [
    ["amount"],
    ["amount_paid"],
    ["total"],
    ["value"],
    ["data", "amount"],
    ["payment", "amount"],
    ["order", "amount"],
    ["payload", "payment", "entity", "amount"],
    ["payload", "order", "entity", "amount"],
    ["data", "object", "amount"],
    ["data", "object", "amount_paid"]
  ];

  for (const path of candidates) {
    const value = readNestedValue(payload, path);
    const amount = typeof value === "string" ? Number(value) : value;
    if (typeof amount === "number" && Number.isFinite(amount) && amount > 0) {
      return amount >= 1000 ? Math.round(amount / 100) : Math.round(amount);
    }
  }

  return 0;
}
