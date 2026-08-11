import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { normalizeBlogSlug } from "@/lib/blog";
import { blogPostInput } from "@/lib/blog-input";
import { requireSql } from "@/lib/db";
import { requirePlatformOperator } from "@/lib/operator";
import { writePlatformAudit } from "@/lib/platform-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await requireSession(); requirePlatformOperator(context);
    const sql = requireSql();
    const posts = await sql`
      select bp.*, u.name as author_name,
        (select count(*)::int from blog_post_revisions br where br.post_id=bp.id) as revision_count
      from blog_posts bp left join users u on u.id=bp.author_id
      order by coalesce(bp.published_at, bp.updated_at) desc
    `;
    return NextResponse.json({ ok: true, posts }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireSession(); requirePlatformOperator(context);
    const body = blogPostInput.parse(await request.json());
    const slug = normalizeBlogSlug(body.slug || body.title);
    if (slug.length < 3) return NextResponse.json({ ok: false, error: "Enter a usable article slug" }, { status: 400 });
    const publishedAt = body.status === "published" ? body.publishedAt || new Date().toISOString() : body.publishedAt || null;
    const sql = requireSql();
    const [post] = await sql`
      insert into blog_posts (slug, title, excerpt, content_markdown, cover_image_url, cover_image_alt, category, tags, status, is_featured, seo_title, seo_description, author_id, published_at)
      values (${slug}, ${body.title}, ${body.excerpt}, ${body.contentMarkdown}, ${body.coverImageUrl || null}, ${body.coverImageAlt || null}, ${body.category}, ${body.tags}, ${body.status}, ${body.isFeatured}, ${body.seoTitle || null}, ${body.seoDescription || null}, ${context.user.id}, ${publishedAt})
      returning *
    `;
    await sql`
      insert into blog_post_revisions (post_id, title, excerpt, content_markdown, cover_image_url, cover_image_alt, category, tags, status, is_featured, seo_title, seo_description, published_at, created_by)
      values (${post.id}, ${body.title}, ${body.excerpt}, ${body.contentMarkdown}, ${body.coverImageUrl || null}, ${body.coverImageAlt || null}, ${body.category}, ${body.tags}, ${body.status}, ${body.isFeatured}, ${body.seoTitle || null}, ${body.seoDescription || null}, ${publishedAt}, ${context.user.id})
    `;
    await writePlatformAudit(context.user.id, "blog_post.created", "blog_post", String(post.id), { slug, status: body.status });
    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    const result = authErrorResponse(error);
    const duplicate = error instanceof Error && /unique|duplicate/i.test(error.message);
    return NextResponse.json({ ok: false, error: duplicate ? "That article slug is already in use" : result.message }, { status: error instanceof z.ZodError || duplicate ? 400 : result.status });
  }
}
