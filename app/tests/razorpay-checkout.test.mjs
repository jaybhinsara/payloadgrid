import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Razorpay checkout keeps pricing and verification on the server", async () => {
  const [createOrder, verifyPayment, checkout, razorpay, env, gitignore, schema] = await Promise.all([
    read("../src/app/api/create-order/route.ts"),
    read("../src/app/api/verify-payment/route.ts"),
    read("../src/components/razorpay-checkout-button.tsx"),
    read("../src/lib/razorpay.ts"),
    read("../.env.example"),
    read("../.gitignore"),
    read("../db/schema.sql")
  ]);

  assert.match(createOrder, /requireRole\(context, \["owner", "admin"\]\)/);
  assert.match(createOrder, /getPlan\(planId\)/);
  assert.match(createOrder, /amount < 100/);
  assert.match(createOrder, /Razorpay order creation failed/);
  assert.doesNotMatch(createOrder, /RAZORPAY_KEY_SECRET\s*=/);
  assert.match(verifyPayment, /createHmac\("sha256"/);
  assert.match(verifyPayment, /timingSafeEqual/);
  assert.match(verifyPayment, /payment\.status !== "captured"/);
  assert.match(verifyPayment, /on conflict \(provider, provider_event_id\) do nothing/);
  assert.match(checkout, /checkout\.razorpay\.com\/v1\/checkout\.js/);
  assert.match(checkout, /payment\.failed/);
  assert.match(checkout, /ondismiss/);
  assert.match(checkout, /code === "AUTH_REQUIRED"/);
  assert.doesNotMatch(checkout, /status === 401/);
  assert.doesNotMatch(checkout, /RAZORPAY_KEY_SECRET/);
  assert.match(razorpay, /\.trim\(\)/);
  assert.match(razorpay, /NEXT_PUBLIC_RAZORPAY_KEY_ID does not match/);
  assert.match(razorpay, /razorpayErrorDetails/);
  assert.match(env, /NEXT_PUBLIC_RAZORPAY_KEY_ID=/);
  assert.match(gitignore, /^\.env$/m);
  assert.match(schema, /'razorpay'/);
});
