import { listPublishedPosts } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
const xml = (value: string) => value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] || character);

export async function GET() {
  const posts = await listPublishedPosts(50);
  const items = posts.map((post) => `<item><title>${xml(post.title)}</title><link>${SITE_URL}/blog/${xml(post.slug)}</link><guid isPermaLink="true">${SITE_URL}/blog/${xml(post.slug)}</guid><description>${xml(post.excerpt)}</description><category>${xml(post.category)}</category><pubDate>${new Date(post.published_at || post.created_at).toUTCString()}</pubDate></item>`).join("");
  const lastBuildDate = new Date(posts[0]?.updated_at || Date.now()).toUTCString();
  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>PayloadGrid Engineering</title><link>${SITE_URL}/blog</link><atom:link href="${SITE_URL}/blog/rss.xml" rel="self" type="application/rss+xml"/><description>Webhook architecture, reliability, security, and delivery operations.</description><language>en</language><lastBuildDate>${lastBuildDate}</lastBuildDate>${items}</channel></rss>`;
  return new Response(body, { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" } });
}
