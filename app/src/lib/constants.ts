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
  return process.env.HOOKIN_APP_URL || "http://localhost:3200";
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
