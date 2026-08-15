import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { getPlan, type PlanId } from "@/lib/plans";
import { getRazorpayClient, getRazorpayConfig, RazorpayConfigurationError, razorpayErrorDetails, razorpayErrorStatus } from "@/lib/razorpay";

export const runtime = "nodejs";
const requestSchema = z.object({
  razorpay_payment_id: z.string().trim().min(1),
  razorpay_order_id: z.string().trim().min(1),
  razorpay_signature: z.string().trim().regex(/^[a-f0-9]{64}$/i)
});

function signaturesMatch(orderId: string, paymentId: string, signature: string, secret: string) {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const body = requestSchema.parse(await request.json());
    const { keySecret } = getRazorpayConfig();

    if (!signaturesMatch(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, keySecret)) {
      return NextResponse.json({ ok: false, error: "Payment signature verification failed" }, { status: 400 });
    }

    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.fetch(body.razorpay_order_id);
    const planId = String(order.notes?.plan || "") as PlanId;
    const plan = getPlan(planId);
    const expectedAmount = Math.round(Number(plan.monthlyPriceInr) * 100);
    const expectedCurrency = (process.env.RAZORPAY_CHECKOUT_CURRENCY || "INR").trim().toUpperCase();
    if (
      (planId !== "starter" && planId !== "growth") ||
      String(order.notes?.organization_id) !== context.organization.id ||
      Number(order.amount) !== expectedAmount ||
      order.currency !== expectedCurrency
    ) {
      return NextResponse.json({ ok: false, error: "Payment order does not match this workspace or plan" }, { status: 400 });
    }

    let payment = await razorpay.payments.fetch(body.razorpay_payment_id);
    if (payment.order_id !== order.id || Number(payment.amount) !== expectedAmount || payment.currency !== expectedCurrency) {
      return NextResponse.json({ ok: false, error: "Payment details do not match the order" }, { status: 400 });
    }
    if (payment.status === "authorized") payment = await razorpay.payments.capture(payment.id, expectedAmount, expectedCurrency);
    if (payment.status !== "captured") {
      return NextResponse.json({ ok: false, error: `Payment is ${payment.status}; the plan was not activated` }, { status: 409 });
    }

    const sql = requireSql();
    const [activation] = await sql`
      with accepted as (
        insert into billing_webhook_events (provider, provider_event_id, event_type)
        values ('razorpay', ${payment.id}, 'payment.captured')
        on conflict (provider, provider_event_id) do nothing
        returning provider_event_id
      ), subscription as (
        insert into billing_subscriptions (
          organization_id, provider, provider_customer_id, provider_subscription_id, plan, status,
          current_period_start, current_period_end, cancel_at_period_end
        )
        select ${context.organization.id}, 'razorpay', ${payment.id}, ${order.id}, ${planId}, 'active', now(), now() + interval '1 month', true
        from accepted
        on conflict (organization_id) do update set
          provider = excluded.provider,
          provider_customer_id = excluded.provider_customer_id,
          provider_subscription_id = excluded.provider_subscription_id,
          plan = excluded.plan,
          status = excluded.status,
          current_period_start = excluded.current_period_start,
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          updated_at = now()
        returning organization_id
      ), organization as (
        update organizations set plan = ${planId}, updated_at = now()
        where id = ${context.organization.id} and exists (select 1 from subscription)
        returning id
      )
      select exists(select 1 from organization) as activated
    `;

    if (activation?.activated) {
      await writeAudit(context.organization.id, context.user.id, "billing.payment_verified", "organization", context.organization.id, {
        provider: "razorpay",
        orderId: order.id,
        paymentId: payment.id,
        plan: planId,
        amount: expectedAmount,
        currency: expectedCurrency
      });
    }

    return NextResponse.json({ ok: true, verified: true, activated: Boolean(activation?.activated), plan: planId });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Payment verification fields are missing or invalid" }, { status: 400 });
    if (error instanceof RazorpayConfigurationError) {
      return NextResponse.json({ ok: false, error: error.message, code: "RAZORPAY_CONFIG_INVALID" }, { status: 500 });
    }
    const auth = authErrorResponse(error);
    if (auth.status !== 500) return NextResponse.json({ ok: false, error: auth.message, code: auth.status === 401 ? "AUTH_REQUIRED" : "AUTH_FORBIDDEN" }, { status: auth.status });
    console.error("Razorpay payment verification failed", razorpayErrorDetails(error));
    const status = razorpayErrorStatus(error);
    return NextResponse.json({ ok: false, error: status === 401 ? "Razorpay authentication failed. Check the server key ID and secret." : "Unable to verify the payment", code: status === 401 ? "RAZORPAY_AUTH_FAILED" : "RAZORPAY_VERIFY_FAILED" }, { status });
  }
}
