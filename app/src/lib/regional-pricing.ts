import type { PricingCurrency } from "@/lib/plans";
import { REGIONAL_PLAN_PRICES } from "@/lib/plans";

const euroCountries = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE",
  "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"
]);

const countryCurrencies: Record<string, PricingCurrency> = {
  IN: "INR", GB: "GBP", CA: "CAD", AU: "AUD", JP: "JPY", SG: "SGD",
  AE: "AED", CH: "CHF", NZ: "NZD", BR: "BRL", US: "USD"
};

export function detectedCountry(headers: Headers) {
  // Only trust country signals set by the hosting edge (Vercel/Cloudflare) from
  // the connection's real IP — never a client-suppliable header, which would let
  // a request claim a cheaper region's price.
  const value = headers.get("x-vercel-ip-country") || headers.get("cf-ipcountry") || "";
  return value.trim().toUpperCase().slice(0, 2);
}

export function currencyForCountry(country: string): PricingCurrency {
  if (euroCountries.has(country)) return "EUR";
  return countryCurrencies[country] || "USD";
}

export function isPricingCurrency(value: string): value is PricingCurrency {
  return value in REGIONAL_PLAN_PRICES;
}

export function configuredCheckoutCurrency(headers: Headers): PricingCurrency | null {
  const configured = (process.env.RAZORPAY_CHECKOUT_CURRENCY || "AUTO").trim().toUpperCase();
  if (!configured || configured === "AUTO") return currencyForCountry(detectedCountry(headers));
  return isPricingCurrency(configured) ? configured : null;
}

export function formatRegionalPrice(amount: number, currency: PricingCurrency) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

export function priceInCurrencySubunits(amount: number, currency: PricingCurrency) {
  const digits = new Intl.NumberFormat("en", { style: "currency", currency })
    .resolvedOptions().maximumFractionDigits ?? 2;
  return Math.round(amount * (10 ** digits));
}
