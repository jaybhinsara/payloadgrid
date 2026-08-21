import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, getSessionContext } from "@/lib/auth";
import { requireSql } from "@/lib/db";

const optionalUrl = z.union([z.literal(""), z.string().trim().url().max(300)]);
const schema = z.object({
  name: z.string().trim().min(2).max(80),
  accountType: z.enum(["individual", "company"]),
  organizationName: z.string().trim().min(2).max(100),
  legalName: z.string().trim().max(160),
  website: optionalUrl,
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter country code"),
  acceptTerms: z.literal(true)
}).superRefine((value, context) => {
  if (value.accountType === "company" && value.legalName.length < 2) context.addIssue({ code: "custom", path: ["legalName"], message: "Registered company name is required" });
});

export async function GET() {
  const context = await getSessionContext();
  if (!context) return NextResponse.json({ ok: false, error: "Please sign in to continue" }, { status: 401 });
  const sql = requireSql();
  const [organization] = await sql`select name, customer_type, legal_name, website, country_code from organizations where id = ${context.organization.id}`;
  return NextResponse.json({ ok: true, user: context.user, organization });
}

export async function PUT(request: Request) {
  try {
    const context = await getSessionContext();
    if (!context) return NextResponse.json({ ok: false, error: "Please sign in to continue" }, { status: 401 });
    const body = schema.parse(await request.json());
    const sql = requireSql();
    await sql`
      update users set name = ${body.name}, account_type = ${body.accountType},
        profile_completed_at = now(), terms_accepted_at = coalesce(terms_accepted_at, now()),
        privacy_accepted_at = coalesce(privacy_accepted_at, now()), updated_at = now()
      where id = ${context.user.id}
    `;
    if (context.organization.role === "owner") {
      await sql`
        update organizations set name = ${body.organizationName}, customer_type = ${body.accountType},
          legal_name = ${body.legalName || null}, website = ${body.website || null}, country_code = ${body.countryCode}, updated_at = now()
        where id = ${context.organization.id}
      `;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const detail = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: detail.message }, { status: detail.status === 500 ? 400 : detail.status });
  }
}
