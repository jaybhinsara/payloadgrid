import { requireSql } from "@/lib/db";

export type BlogStatus = "draft" | "scheduled" | "published" | "archived";
export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_markdown: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  category: string;
  tags: string[];
  status: BlogStatus;
  is_featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  author_id: string | null;
  author_name: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  revision_count?: number;
};

export function normalizeBlogSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

export function blogReadingMinutes(markdown: string) {
  const words = markdown.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`\[\]()!-]/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export async function listPublishedPosts(limit = 100): Promise<BlogPost[]> {
  const sql = requireSql();
  const safeLimit = Math.max(1, Math.min(200, limit));
  const rows = await sql`
    select bp.*, u.name as author_name
    from blog_posts bp left join users u on u.id = bp.author_id
    where (bp.status = 'published' or bp.status = 'scheduled')
      and bp.published_at is not null and bp.published_at <= now()
    order by bp.is_featured desc, bp.published_at desc
    limit ${safeLimit}
  `;
  return rows as BlogPost[];
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  const sql = requireSql();
  const rows = await sql`
    select bp.*, u.name as author_name
    from blog_posts bp left join users u on u.id = bp.author_id
    where bp.slug = ${slug}
      and (bp.status = 'published' or bp.status = 'scheduled')
      and bp.published_at is not null and bp.published_at <= now()
    limit 1
  `;
  return (rows[0] as BlogPost | undefined) || null;
}

export async function getBlogRedirect(slug: string) {
  const sql = requireSql();
  const rows = await sql`select bp.slug from blog_slug_redirects br join blog_posts bp on bp.id=br.post_id where br.old_slug=${slug} limit 1`;
  return rows[0] ? String(rows[0].slug) : null;
}
