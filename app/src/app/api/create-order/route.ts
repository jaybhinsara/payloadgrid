import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole, requireSession } from "@/lib/auth";
import { getPlan, planMonthlyPrice } from "@/lib/plans";
import { paymentsEnabled } from "@/lib/payments";
import { configuredCheckoutCurrency, priceInCurrencySubunits } from "@/lib/regional-pricing";
import { getRazorpayClient, razorpayFailureResponse } from "@/lib/razorpay";

export const runtime = "nodejs";
const requestSchema = z.object({ plan: z.enum(["starter", "growth"]) });

export async function POST(request: Request) {
  if (!paymentsEnabled()) {
    return NextResponse.json({ ok: false, error: "Paid checkout is temporarily unavailable", code: "PAYMENTS_DISABLED" }, { status: 503 });
  }
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const { plan: planId } = requestSchema.parse(await request.json());
    const plan = getPlan(planId);
    const currency = configuredCheckoutCurrency(request.headers);
    const monthlyPrice = currency ? planMonthlyPrice(plan, currency) : null;
    const amount = currency && monthlyPrice ? priceInCurrencySubunits(monthlyPrice, currency) : 0;
    if (!Number.isSafeInteger(amount) || amount < 100) {
      return NextResponse.json({ ok: false, error: "Order amount must be at least 100 currency subunits" }, { status: 400 });
    }

    if (!currency || !monthlyPrice) {
      return NextResponse.json({ ok: false, error: "Razorpay checkout currency is unsupported" }, { status: 500 });
    }

    const order = await getRazorpayClient().orders.create({
      amount,
      currency,
      receipt: `pg_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
      notes: {
        organization_id: context.organization.id,
        user_id: context.user.id,
        plan: planId,
        pricing_currency: currency,
        billing_period: "one_month"
      }
    });

    return NextResponse.json({ ok: true, order_id: order.id, amount: Number(order.amount), currency: order.currency });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Choose a supported paid plan" }, { status: 400 });
    const failure = razorpayFailureResponse(error, {
      logContext: "Razorpay order creation failed",
      failureMessage: "Unable to create the Razorpay order",
      failureCode: "RAZORPAY_ORDER_FAILED"
    });
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
