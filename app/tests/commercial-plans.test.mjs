import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("commercial plans are centralized and enforced by organization plan", async () => {
  const [plans, regionalPricing, limits, dashboard, pricing, payments, createOrder, verifyPayment, env, schema] = await Promise.all([
    read("../src/lib/plans.ts"),
    read("../src/lib/regional-pricing.ts"),
    read("../src/lib/limits.ts"),
    read("../src/app/api/dashboard/route.ts"),
    read("../src/app/pricing/page.tsx"),
    read("../src/lib/payments.ts"),
    read("../src/app/api/create-order/route.ts"),
    read("../src/app/api/verify-payment/route.ts"),
    read("../.env.example"),
    read("../db/schema.sql")
  ]);
  assert.match(plans, /monthlyPriceInr: 2499/);
  assert.match(plans, /monthlyPriceUsd: 29/);
  assert.match(plans, /messagesPerMonth: 100_000/);
  assert.match(plans, /monthlyPriceInr: 12499/);
  assert.match(plans, /monthlyPriceUsd: 149/);
  assert.match(plans, /planMonthlyPrice/);
  assert.match(regionalPricing, /x-vercel-ip-country/);
  assert.match(regionalPricing, /return countryCurrencies\[country\] \|\| "USD"/);
  assert.match(regionalPricing, /priceInCurrencySubunits/);
  assert.match(plans, /messagesPerMonth: 1_000_000/);
  assert.match(limits, /planLimits\(String\(account\?\.plan \|\| "free"\)\)/);
  assert.match(limits, /organization_usage_month_buckets/);
  assert.match(limits, /context\?\.messagesPerMonth/);
  assert.match(dashboard, /planLimits\(plan\.id\)/);
  assert.match(pricing, /RazorpayCheckoutButton/);
  assert.match(pricing, /Payments temporarily unavailable/);
  assert.match(payments, /PAYMENTS_ENABLED/);
  assert.match(createOrder, /PAYMENTS_DISABLED/);
  assert.match(createOrder, /configuredCheckoutCurrency\(request\.headers\)/);
  assert.match(verifyPayment, /order\.notes\?\.pricing_currency/);
  assert.match(verifyPayment, /PAYMENTS_DISABLED/);
  assert.match(env, /PAYMENTS_ENABLED=false/);
  assert.match(env, /RAZORPAY_CHECKOUT_CURRENCY=AUTO/);
  assert.match(pricing, /does not renew automatically/);
  assert.match(schema, /create table if not exists billing_subscriptions/);
  assert.match(schema, /provider_event_id text not null/);
});

test("legal pages describe paid billing and privacy controls without claiming certification", async () => {
  const [terms, privacy] = await Promise.all([
    read("../src/app/terms/page.tsx"),
    read("../src/app/privacy/page.tsx")
  ]);
  assert.match(terms, /Paid plans/);
  assert.match(terms, /does not renew automatically/);
  assert.match(terms, /does not limit liability that law prohibits limiting/);
  assert.match(privacy, /controller or data fiduciary/);
  assert.match(privacy, /Indian data-protection requests/);
  assert.doesNotMatch(`${terms}\n${privacy}`, /SOC 2 certified|GDPR compliant|DPDP certified/i);
});
