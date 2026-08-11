import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requirePlatformOperator } from "@/lib/operator";

export const runtime = "nodejs";
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  try {
    const context = await requireSession(); requirePlatformOperator(context);
    if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ ok: false, error: "Vercel Blob is not configured" }, { status: 503 });
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose an image to upload" }, { status: 400 });
    if (!allowed.has(file.type)) return NextResponse.json({ ok: false, error: "Use a JPEG, PNG, WebP, or GIF image" }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Images must be 4 MB or smaller" }, { status: 400 });
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(-100) || "cover-image";
    const blob = await put(`blog/${crypto.randomUUID()}-${safeName}`, file, { access: "public", addRandomSuffix: false, contentType: file.type });
    return NextResponse.json({ ok: true, url: blob.url, pathname: blob.pathname }, { status: 201 });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status }); }
}
