import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
export async function GET() { const context = await getSessionContext(); return NextResponse.json({ ok: Boolean(context), context }, { status: context ? 200 : 401 }); }