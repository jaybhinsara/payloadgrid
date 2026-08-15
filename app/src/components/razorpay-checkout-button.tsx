"use client";

import Script from "next/script";
import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { PlanId } from "@/lib/plans";

type CheckoutResult = { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string };
type RazorpayFailure = { error?: { description?: string; reason?: string } };
type RazorpayInstance = { open(): void; on(event: "payment.failed", callback: (failure: RazorpayFailure) => void): void };

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

async function responseBody(response: Response) {
  const data = await response.json().catch(() => ({})) as { error?: string; code?: string };
  if (!response.ok) throw Object.assign(new Error(data.error || "Payment request failed"), { status: response.status, code: data.code });
  return data;
}

export function RazorpayCheckoutButton({ plan, planName }: { plan: Extract<PlanId, "starter" | "growth">; planName: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scriptReady, setScriptReady] = useState(false);

  async function beginCheckout() {
    setMessage("");
    if (!scriptReady || !window.Razorpay) return setMessage("Secure checkout is still loading. Try again in a moment.");
    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!key) return setMessage("Razorpay checkout is not configured.");
    setBusy(true);
    try {
      const createResponse = await fetch("/api/create-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan })
      });
      const order = await responseBody(createResponse) as { order_id: string; amount: number; currency: string };
      const checkout = new window.Razorpay({
        key,
        order_id: order.order_id,
        amount: order.amount,
        currency: order.currency,
        name: "PayloadGrid",
        description: `${planName} plan · one month`,
        prefill: {},
        theme: { color: "#f45b49" },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setMessage("Checkout was cancelled. No charge was completed.");
          }
        },
        handler: async (result: CheckoutResult) => {
          try {
            const verifyResponse = await fetch("/api/verify-payment", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(result)
            });
            await responseBody(verifyResponse);
            setMessage(`${planName} is active for this workspace for one month.`);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Payment verification failed.");
          } finally {
            setBusy(false);
          }
        }
      });
      checkout.on("payment.failed", (failure) => {
        setBusy(false);
        setMessage(failure.error?.description || failure.error?.reason || "Payment failed. Your plan was not changed.");
      });
      checkout.open();
    } catch (error) {
      const code = (error as Error & { code?: string }).code;
      if (code === "AUTH_REQUIRED") window.location.assign(`/login?next=${encodeURIComponent("/pricing")}`);
      else setMessage(error instanceof Error ? error.message : "Unable to start checkout.");
      setBusy(false);
    }
  }

  return <div className="checkout-action">
    <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" onLoad={() => setScriptReady(true)} onReady={() => setScriptReady(true)} onError={() => setMessage("Secure checkout could not be loaded.")} />
    <button className="button primary" type="button" onClick={beginCheckout} disabled={busy}>
      {busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}
      {busy ? "Opening checkout" : `Buy ${planName}`}
    </button>
    {message ? <p className="checkout-message" role="status">{message}</p> : null}
  </div>;
}
