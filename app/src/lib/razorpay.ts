import Razorpay from "razorpay";

export function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured");
  return { keyId, keySecret };
}

export function getRazorpayClient() {
  const { keyId, keySecret } = getRazorpayConfig();
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function razorpayErrorStatus(error: unknown) {
  const candidate = error as { statusCode?: number; status?: number; error?: { description?: string } };
  const description = candidate?.error?.description || (error instanceof Error ? error.message : "");
  if (candidate?.statusCode === 401 || candidate?.status === 401 || /authenticat|key[_ -]?(id|secret)/i.test(description)) return 401;
  return 500;
}
