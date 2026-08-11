import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { normalizeBlogSlug } from "@/lib/blog";
import { blogPostInput } from "@/lib/blog-input";
import { requireSql } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/operator";
import { writePlatformAudit } from "@/lib/platform-audit";

const idSchema = z.string().uuid();
type Params = { params: Promise<{ postId: string }> };

function toIsoTimestamp(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Article publication timestamp is invalid");
  return date.toISOString();
}

export async function GET(_: Request, { params }: Params) {
  try {
    const context = await requireSession(); requirePlatformOperator(context);
    const postId = idSchema.parse((await params).postId); const sql = requireSql();
    const [post] = await sql`select bp.*, u.name as author_name from blog_posts bp left join users u on u.id=bp.author_id where bp.id=${postId} limit 1`;
    if (!post) return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
    return NextResponse.json({ ok: true, post }, { headers: { "cache-control": "no-store" } });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status }); }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const context = await requireSession(); requirePlatformOperator(context);
    const postId = idSchema.parse((await params).postId); const body = blogPostInput.parse(await request.json()); const sql = requireSql();
    const [current] = await sql`select * from blog_posts where id=${postId} limit 1`;
    if (!current) return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
    const slug = normalizeBlogSlug(body.slug || body.title);
    const currentPublishedAt = toIsoTimestamp(current.published_at);
    const publishedAt = body.status === "published" ? body.publishedAt || currentPublishedAt || new Date().toISOString() : body.publishedAt || null;
    if (String(current.slug) !== slug && ["published", "scheduled"].includes(String(current.status))) {
      await sql`insert into blog_slug_redirects (old_slug, post_id) values (${String(current.slug)}, ${postId}) on conflict (old_slug) do update set post_id=excluded.post_id`;
    }
    const [post] = await sql`
      update blog_posts set slug=${slug}, title=${body.title}, excerpt=${body.excerpt}, content_markdown=${body.contentMarkdown}, cover_image_url=${body.coverImageUrl || null}, cover_image_alt=${body.coverImageAlt || null}, category=${body.category}, tags=${body.tags}, status=${body.status}, is_featured=${body.isFeatured}, seo_title=${body.seoTitle || null}, seo_description=${body.seoDescription || null}, published_at=${publishedAt}, updated_at=now()
      where id=${postId} returning *
    `;
    await writePlatformAudit(context.user.id, "blog_post.updated", "blog_post", postId, { slug, status: body.status });
    return NextResponse.json({ ok: true, post });
  } catch (error) {
    const result = authErrorResponse(error); const duplicate = error instanceof Error && /unique|duplicate/i.test(error.message);
    return NextResponse.json({ ok: false, error: duplicate ? "That article slug is already in use" : result.message }, { status: error instanceof z.ZodError || duplicate ? 400 : result.status });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const context = await requireSession(); requirePlatformOperator(context); const postId = idSchema.parse((await params).postId); const sql = requireSql();
    const [post] = await sql`delete from blog_posts where id=${postId} returning id, slug`;
    if (!post) return NextResponse.json({ ok: false, error: "Article not found" }, { status: 404 });
    await writePlatformAudit(context.user.id, "blog_post.deleted", "blog_post", postId, { slug: post.slug });
    return NextResponse.json({ ok: true });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status }); }
}
