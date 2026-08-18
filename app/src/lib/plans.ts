export type PlanId = "free" | "starter" | "growth" | "enterprise";

export type PlanLimits = {
  messagesPerMonth: number;
  apiRequestsPerMinute: number;
  inboundRequestsPerMinute: number;
  endpoints: number;
  teamMembers: number;
  payloadRetentionDays: number;
};

export type PlanDefinition = {
  id: PlanId;
  name: string;
  monthlyPriceInr: number | null;
  monthlyPriceUsd: number | null;
  description: string;
  limits: PlanLimits;
  features: string[];
};

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceInr: 0,
    monthlyPriceUsd: 0,
    description: "Build, test, and run small production integrations.",
    limits: { messagesPerMonth: 10_000, apiRequestsPerMinute: 300, inboundRequestsPerMinute: 300, endpoints: 10, teamMembers: 5, payloadRetentionDays: 3 },
    features: ["Inbound and outbound webhooks", "Retries, replay, contracts, and analytics", "Signed delivery, embeds, and audit history"]
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPriceInr: 2499,
    monthlyPriceUsd: 29,
    description: "For shipping SaaS products and growing webhook traffic.",
    limits: { messagesPerMonth: 100_000, apiRequestsPerMinute: 1_000, inboundRequestsPerMinute: 1_000, endpoints: 30, teamMembers: 10, payloadRetentionDays: 14 },
    features: ["Everything in Free", "10× accepted-event capacity", "Higher endpoint and member limits", "Longer diagnostic retention"]
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyPriceInr: 12499,
    monthlyPriceUsd: 149,
    description: "For teams operating high-volume, customer-facing delivery.",
    limits: { messagesPerMonth: 1_000_000, apiRequestsPerMinute: 5_000, inboundRequestsPerMinute: 5_000, endpoints: 100, teamMembers: 30, payloadRetentionDays: 30 },
    features: ["Everything in Starter", "10× Starter event capacity", "Higher request throughput", "Priority support"]
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyPriceInr: null,
    monthlyPriceUsd: null,
    description: "Capacity, retention, support, and contractual terms agreed for your workload.",
    limits: { messagesPerMonth: 10_000_000, apiRequestsPerMinute: 20_000, inboundRequestsPerMinute: 20_000, endpoints: 1_000, teamMembers: 250, payloadRetentionDays: 90 },
    features: ["Custom capacity planning", "Contractual support options", "Security and procurement review", "Migration assistance"]
  }
};

export const REGIONAL_PLAN_PRICES = {
  USD: { starter: 29, growth: 149 },
  EUR: { starter: 27, growth: 139 },
  GBP: { starter: 23, growth: 119 },
  INR: { starter: 2499, growth: 12499 },
  CAD: { starter: 39, growth: 199 },
  AUD: { starter: 45, growth: 229 },
  JPY: { starter: 4500, growth: 23000 },
  SGD: { starter: 39, growth: 199 },
  AED: { starter: 109, growth: 549 },
  CHF: { starter: 26, growth: 135 },
  NZD: { starter: 49, growth: 249 },
  BRL: { starter: 149, growth: 749 }
} as const;

export type PricingCurrency = keyof typeof REGIONAL_PLAN_PRICES;

export function normalizePlan(value: string | null | undefined): PlanId {
  return value === "starter" || value === "growth" || value === "enterprise" ? value : "free";
}

export function getPlan(value: string | null | undefined) {
  return PLAN_CATALOG[normalizePlan(value)];
}

export function planMonthlyPrice(plan: PlanDefinition, currency: string) {
  if (plan.id === "free") return 0;
  if (plan.id === "enterprise" || !(currency in REGIONAL_PLAN_PRICES)) return null;
  return REGIONAL_PLAN_PRICES[currency as PricingCurrency][plan.id];
}
