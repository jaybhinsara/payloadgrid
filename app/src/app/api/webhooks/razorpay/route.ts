import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { getPlan, planMonthlyPrice, type PlanId } from "@/lib/plans";
import { getRazorpayClient } from "@/lib/razorpay";
import { isPricingCurrency, priceInCurrencySubunits } from "@/lib/regional-pricing";
import { constantTimeEquals } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifySignature(rawBody: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return constantTimeEquals(expected, signature);
}

/**
 * Reconciles a captured payment the same way the client-triggered
 * /api/verify-payment call does, so plan activation does not depend solely on the
 * customer's browser completing that follow-up request after checkout (the order's
 * own notes are trusted here, since the order was created server-side by our own
 * /api/create-order route from a valid session, not supplied by this request).
 */
async function activateCapturedPayment(paymentId: string) {
  const razorpay = getRazorpayClient();
  let payment = await razorpay.payments.fetch(paymentId);
  const order = await razorpay.orders.fetch(String(payment.order_id));
  const planId = String(order.notes?.plan || "") as PlanId;
  const plan = getPlan(planId);
  const expectedCurrency = String(order.currency || "").trim().toUpperCase();
  const expectedPrice = planMonthlyPrice(plan, expectedCurrency);
  const expectedAmount = expectedPrice && isPricingCurrency(expectedCurrency) ? priceInCurrencySubunits(expectedPrice, expectedCurrency) : 0;
  const organizationId = String(order.notes?.organization_id || "");

  if (
    !organizationId ||
    (planId !== "starter" && planId !== "growth") ||
    !isPricingCurrency(expectedCurrency) ||
    !expectedPrice ||
    String(order.notes?.pricing_currency || "") !== expectedCurrency ||
    Number(order.amount) !== expectedAmount ||
    order.currency !== expectedCurrency ||
    payment.order_id !== order.id ||
    Number(payment.amount) !== expectedAmount ||
    payment.currency !== expectedCurrency
  ) {
    console.error("Razorpay webhook: payment does not match an expected order, workspace, or plan", { paymentId, orderId: order.id });
    return { activated: false };
  }

  if (payment.status === "authorized") payment = await razorpay.payments.capture(payment.id, expectedAmount, expectedCurrency);
  if (payment.status !== "captured") return { activated: false };

  const sql = requireSql();
  const [activation] = await sql`
    with accepted as (
      insert into billing_webhook_events (provider, provider_event_id, event_type)
      values ('razorpay', ${payment.id}, 'payment.captured')
      on conflict (provider, provider_event_id) do nothing
      returning provider_event_id
    ), payment_record as (
      insert into billing_transactions (
        organization_id, provider, provider_order_id, provider_payment_id, plan,
        amount, currency, status, paid_at, metadata
      )
      select ${organizationId}, 'razorpay', ${order.id}, ${payment.id}, ${planId},
        ${expectedAmount}, ${expectedCurrency}, 'captured', now(),
        ${JSON.stringify({ source: "webhook_reconciliation", billingPeriod: "one_month" })}::jsonb
      from accepted
      on conflict (provider, provider_payment_id) do nothing
      returning organization_id
    ), subscription as (
      insert into billing_subscriptions (
        organization_id, provider, provider_customer_id, provider_subscription_id, plan, status,
        current_period_start, current_period_end, cancel_at_period_end
      )
      select ${organizationId}, 'razorpay', ${payment.id}, ${order.id}, ${planId}, 'active', now(), now() + interval '1 month', true
      from payment_record
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
      where id = ${organizationId} and exists (select 1 from subscription)
      returning id
    )
    select exists(select 1 from organization) as activated
  `;

  if (activation?.activated) {
    await writeAudit(organizationId, null, "billing.payment_verified", "organization", organizationId, {
      provider: "razorpay", orderId: order.id, paymentId: payment.id, plan: planId,
      amount: expectedAmount, currency: expectedCurrency, source: "webhook"
    });
  }
  return { activated: Boolean(activation?.activated) };
}

/** Refunds are otherwise never recorded anywhere -- the ledger would show a
 * refunded payment as permanently 'captured' with no way to detect it. */
async function reconcileRefund(refund: { payment_id?: string; amount?: number }) {
  if (!refund?.payment_id) return;
  const sql = requireSql();
  await sql`
    with target as (
      select id, amount, refunded_amount from billing_transactions
      where provider = 'razorpay' and provider_payment_id = ${refund.payment_id}
      limit 1
    )
    update billing_transactions bt set
      refunded_amount = least(target.amount, target.refunded_amount + ${Number(refund.amount) || 0}),
      refunded_at = now(),
      status = case
        when least(target.amount, target.refunded_amount + ${Number(refund.amount) || 0}) >= target.amount then 'refunded'
        else 'partially_refunded'
      end,
      updated_at = now()
    from target
    where bt.id = target.id
  `;
}

async function markDisputed(paymentId: string) {
  const sql = requireSql();
  await sql`update billing_transactions set status = 'disputed', updated_at = now() where provider = 'razorpay' and provider_payment_id = ${paymentId}`;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature" }, { status: 401 });
  }

  let event: { event?: string; payload?: Record<string, { entity?: Record<string, unknown> }> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    switch (event.event) {
      case "payment.captured": {
        const paymentId = event.payload?.payment?.entity?.id;
        if (typeof paymentId === "string") await activateCapturedPayment(paymentId);
        break;
      }
      case "refund.created":
      case "refund.processed": {
        const refund = event.payload?.refund?.entity as { payment_id?: string; amount?: number } | undefined;
        if (refund) await reconcileRefund(refund);
        break;
      }
      case "payment.dispute.created": {
        const paymentId = event.payload?.payment?.entity?.id;
        if (typeof paymentId === "string") await markDisputed(paymentId);
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Razorpay webhook processing failed", event.event, error);
    return NextResponse.json({ ok: false, error: "Webhook processing failed" }, { status: 500 });
  }
}
