import type { MetadataRoute } from "next";
import { DOC_ARTICLES } from "@/lib/docs";
import { listPublishedPosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
const pages = ["", "/webhook-service", "/webhook-delivery", "/webhook-gateway", "/webhook-testing", "/webhook-retries", "/docs", ...DOC_ARTICLES.map((article) => `/docs/${article.slug}`), "/blog", "/pricing", "/playground", "/security", "/status", "/about", "/contact", "/privacy", "/terms"];
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = pages.map((path, index) => ({ url: `${SITE_URL}${path}`, changeFrequency: path === "/status" ? "daily" : "weekly", priority: index === 0 ? 1 : path === "/docs" || path === "/blog" ? 0.9 : 0.7 }));
  try {
    const posts = await listPublishedPosts(200);
    return [...staticPages, ...posts.map((post) => ({ url: `${SITE_URL}/blog/${post.slug}`, lastModified: post.updated_at, changeFrequency: "monthly" as const, priority: post.is_featured ? 0.85 : 0.75 }))];
  } catch { return staticPages; }
}
