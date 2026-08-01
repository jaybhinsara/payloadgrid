import { createHmac, timingSafeEqual } from "node:crypto";
import type { Provider } from "@/lib/constants";
import { decryptSecret } from "@/lib/security";

function safeEqual(expected: string, received: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(received);
  return left.length === right.length && timingSafeEqual(left, right);
}

function freshTimestamp(raw: string, toleranceSeconds = 300) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return false;
  const seconds = value > 1e12 ? value / 1000 : value;
  return Math.abs(Date.now() / 1000 - seconds) <= toleranceSeconds;
}

export function verifyProviderWebhook(provider: Provider, rawBody: string, headers: Headers, encryptedSecret: string | null) {
  if (provider === "custom") return { verified: true, mode: "custom" };
  if (!encryptedSecret) return { verified: false, error: "Provider verification secret is not configured" };
  const secret = decryptSecret(encryptedSecret);

  if (provider === "razorpay") {
    const received = headers.get("x-razorpay-signature") || "";
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return { verified: safeEqual(expected, received), error: "Invalid Razorpay signature" };
  }

  if (provider === "cashfree") {
    const received = headers.get("x-webhook-signature") || "";
    const timestamp = headers.get("x-webhook-timestamp") || "";
    const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest("base64");
    return { verified: freshTimestamp(timestamp) && safeEqual(expected, received), error: "Invalid or expired Cashfree signature" };
  }

  if (provider === "shopify") {
    const received = headers.get("x-shopify-hmac-sha256") || "";
    const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
    return { verified: safeEqual(expected, received), error: "Invalid Shopify signature" };
  }

  const signatureHeader = headers.get("stripe-signature") || "";
  const values = signatureHeader.split(",").map((value) => value.trim());
  const timestamp = values.find((value) => value.startsWith("t="))?.slice(2) || "";
  const signatures = values.filter((value) => value.startsWith("v1=")).map((value) => value.slice(3));
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return { verified: freshTimestamp(timestamp) && signatures.some((signature) => safeEqual(expected, signature)), error: "Invalid or expired Stripe signature" };
}