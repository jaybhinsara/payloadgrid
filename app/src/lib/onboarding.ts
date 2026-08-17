export type OnboardingTemplate = {
  provider: "custom" | "razorpay" | "stripe" | "cashfree" | "shopify";
  name: string;
  description: string;
  endpointName: string;
  eventTypes: string[];
  revenueTracking: boolean;
};

export const ONBOARDING_TEMPLATES: OnboardingTemplate[] = [
  { provider: "custom", name: "Generic API", description: "Deliver signed events to any HTTPS handler.", endpointName: "Production webhook handler", eventTypes: ["order.completed"], revenueTracking: false },
  { provider: "razorpay", name: "Razorpay", description: "Receive verified payment and order callbacks.", endpointName: "Razorpay payment handler", eventTypes: ["payment.captured", "payment.failed", "order.paid"], revenueTracking: true },
  { provider: "stripe", name: "Stripe", description: "Route verified billing and subscription events.", endpointName: "Stripe billing handler", eventTypes: ["payment_intent.succeeded", "invoice.payment_failed", "customer.subscription.updated"], revenueTracking: true },
  { provider: "cashfree", name: "Cashfree", description: "Handle payment success and failure notifications.", endpointName: "Cashfree payment handler", eventTypes: ["PAYMENT_SUCCESS_WEBHOOK", "PAYMENT_FAILED_WEBHOOK"], revenueTracking: true },
  { provider: "shopify", name: "Shopify", description: "Forward order and fulfillment lifecycle events.", endpointName: "Shopify order handler", eventTypes: ["orders/create", "orders/paid", "fulfillments/create"], revenueTracking: true }
];

export function onboardingTemplate(provider: string) {
  return ONBOARDING_TEMPLATES.find((template) => template.provider === provider) || ONBOARDING_TEMPLATES[0];
}
