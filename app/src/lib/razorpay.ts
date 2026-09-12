import Razorpay from "razorpay";
import { authErrorResponse } from "@/lib/auth";

export class RazorpayConfigurationError extends Error {}

export function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  const publicKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID?.trim();
  if (!keyId || !keySecret) throw new RazorpayConfigurationError("Razorpay server credentials are missing");
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) {
    throw new RazorpayConfigurationError("RAZORPAY_KEY_ID must contain only the key value, beginning with rzp_test_ or rzp_live_");
  }
  if (!/^\S{16,}$/.test(keySecret)) {
    throw new RazorpayConfigurationError("RAZORPAY_KEY_SECRET contains whitespace or is incomplete");
  }
  if (publicKeyId && publicKeyId !== keyId) {
    throw new RazorpayConfigurationError("NEXT_PUBLIC_RAZORPAY_KEY_ID does not match the server RAZORPAY_KEY_ID");
  }
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

export function razorpayErrorDetails(error: unknown) {
  const candidate = error as {
    statusCode?: number;
    status?: number;
    error?: { code?: string; description?: string; source?: string; step?: string; reason?: string; field?: string };
  };
  return {
    status: candidate?.statusCode || candidate?.status || null,
    code: candidate?.error?.code || null,
    description: candidate?.error?.description || (error instanceof Error ? error.message : "Unknown Razorpay error"),
    source: candidate?.error?.source || null,
    step: candidate?.error?.step || null,
    reason: candidate?.error?.reason || null,
    field: candidate?.error?.field || null
  };
}

/**
 * Shared tail for Razorpay route catch blocks, once the route has already
 * handled its own request-validation (ZodError) case. Covers configuration
 * errors, session/role errors, and generic Razorpay API failures.
 */
export function razorpayFailureResponse(error: unknown, action: { logContext: string; failureMessage: string; failureCode: string }) {
  if (error instanceof RazorpayConfigurationError) {
    return { body: { ok: false, error: error.message, code: "RAZORPAY_CONFIG_INVALID" }, status: 500 };
  }
  const auth = authErrorResponse(error);
  if (auth.status !== 500) {
    return { body: { ok: false, error: auth.message, code: auth.status === 401 ? "AUTH_REQUIRED" : "AUTH_FORBIDDEN" }, status: auth.status };
  }
  console.error(action.logContext, razorpayErrorDetails(error));
  const status = razorpayErrorStatus(error);
  return {
    body: {
      ok: false,
      error: status === 401 ? "Razorpay authentication failed. Check the server key ID and secret." : action.failureMessage,
      code: status === 401 ? "RAZORPAY_AUTH_FAILED" : action.failureCode
    },
    status
  };
}
