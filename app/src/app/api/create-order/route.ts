import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { getPlan, planMonthlyPrice } from "@/lib/plans";
import { paymentsEnabled } from "@/lib/payments";
import { configuredCheckoutCurrency, priceInCurrencySubunits } from "@/lib/regional-pricing";
import { getRazorpayClient, RazorpayConfigurationError, razorpayErrorDetails, razorpayErrorStatus } from "@/lib/razorpay";

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
    if (error instanceof RazorpayConfigurationError) {
      return NextResponse.json({ ok: false, error: error.message, code: "RAZORPAY_CONFIG_INVALID" }, { status: 500 });
    }
    const auth = authErrorResponse(error);
    if (auth.status !== 500) return NextResponse.json({ ok: false, error: auth.message, code: auth.status === 401 ? "AUTH_REQUIRED" : "AUTH_FORBIDDEN" }, { status: auth.status });
    console.error("Razorpay order creation failed", razorpayErrorDetails(error));
    const status = razorpayErrorStatus(error);
    return NextResponse.json({ ok: false, error: status === 401 ? "Razorpay authentication failed. Check the server key ID and secret." : "Unable to create the Razorpay order", code: status === 401 ? "RAZORPAY_AUTH_FAILED" : "RAZORPAY_ORDER_FAILED" }, { status });
  }
}
