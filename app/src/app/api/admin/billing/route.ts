import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["all", "captured", "partially_refunded", "refunded", "disputed"]).default("all"),
  limit: z.coerce.number().int().min(25).max(100).default(50)
});

export async function GET(request: Request) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const params = new URL(request.url).searchParams;
    const input = querySchema.parse({ q: params.get("q") || "", status: params.get("status") || "all", limit: params.get("limit") || 50 });
    const sql = requireSql();
    const search = `%${input.q}%`;
    const [summary, transactions] = await Promise.all([
      sql`
        select count(*)::int as total,
          coalesce(sum(amount) filter (where status='captured'), 0)::bigint as captured_amount,
          count(*) filter (where status in ('partially_refunded','refunded'))::int as refunds,
          count(*) filter (where status='disputed')::int as disputes
        from billing_transactions
      `,
      sql`
        select t.id, t.organization_id, o.name as workspace_name, o.slug as workspace_slug,
          t.provider, t.provider_order_id, t.provider_payment_id, t.plan, t.amount,
          t.currency, t.status, t.paid_at, t.refunded_amount, t.refunded_at, t.created_at,
          s.status as entitlement_status, s.current_period_end
        from billing_transactions t
        join organizations o on o.id=t.organization_id
        left join billing_subscriptions s on s.organization_id=t.organization_id
        where (${input.status}='all' or t.status=${input.status})
          and (${input.q}='' or o.name ilike ${search} or o.slug ilike ${search}
            or t.provider_order_id ilike ${search} or t.provider_payment_id ilike ${search})
        order by t.paid_at desc
        limit ${input.limit}
      `
    ]);
    return NextResponse.json({ ok: true, summary: summary[0], transactions }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Billing filters are invalid" }, { status: 400 });
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status, headers: { "cache-control": "no-store" } });
  }
}
