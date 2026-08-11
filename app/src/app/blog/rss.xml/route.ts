import { listPublishedPosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
const xml = (value: string) => value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] || character);

export async function GET() {
  const posts = await listPublishedPosts(50);
  const items = posts.map((post) => `<item><title>${xml(post.title)}</title><link>${SITE_URL}/blog/${xml(post.slug)}</link><guid isPermaLink="true">${SITE_URL}/blog/${xml(post.slug)}</guid><description>${xml(post.excerpt)}</description><pubDate>${new Date(post.published_at || post.created_at).toUTCString()}</pubDate></item>`).join("");
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>PayloadGrid Engineering</title><link>${SITE_URL}/blog</link><description>Webhook architecture, reliability, security, and delivery operations.</description><language>en</language>${items}</channel></rss>`;
  return new Response(body, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" } });
}
