import Link from "next/link";
import { ArrowRight, Clock3, Rss } from "lucide-react";
import { blogReadingMinutes, listPublishedPosts } from "@/lib/blog";
import { publicMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = publicMetadata({ title: "Webhook Engineering Blog", description: "Technical guides from PayloadGrid about webhook architecture, retries, signatures, delivery operations, inbound callbacks, and scalable event infrastructure.", path: "/blog" });

export default async function BlogPage() {
  const posts = await listPublishedPosts();
  const featured = posts.find((post) => post.is_featured) || posts[0];
  const remaining = featured ? posts.filter((post) => post.id !== featured.id) : [];
  return <>
    <header className="blog-index-hero"><span className="section-label">PayloadGrid engineering</span><h1>Practical webhook engineering.</h1><p>Architecture, delivery operations, security, and lessons from building reliable inbound and outbound event paths.</p><a className="blog-rss-button" href="/blog/rss.xml"><Rss size={15} /> RSS feed</a></header>
    {featured ? <section className="blog-featured"><div className="blog-featured-media">{featured.cover_image_url ? <img src={featured.cover_image_url} alt={featured.cover_image_alt || ""} /> : <span>PAYLOADGRID / {featured.category.toUpperCase()}</span>}</div><div><span className="section-label">Featured · {featured.category}</span><h2>{featured.title}</h2><p>{featured.excerpt}</p><div className="blog-meta"><span>{featured.author_name || "PayloadGrid"}</span><span><Clock3 size={13} /> {blogReadingMinutes(featured.content_markdown)} min read</span><time>{featured.published_at ? new Date(featured.published_at).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" }) : ""}</time></div><Link className="text-link" href={`/blog/${featured.slug}`}>Read article <ArrowRight size={15} /></Link></div></section> : <section className="blog-empty"><h2>No articles have been published yet.</h2><p>Check back soon for webhook engineering guides, architecture notes, and product updates.</p></section>}
    {remaining.length ? <section className="blog-index-grid">{remaining.map((post) => <article key={post.id}><Link className="blog-card-media" href={`/blog/${post.slug}`}>{post.cover_image_url ? <img src={post.cover_image_url} alt={post.cover_image_alt || ""} /> : <span>{post.category}</span>}</Link><div><span>{post.category}</span><h2><Link href={`/blog/${post.slug}`}>{post.title}</Link></h2><p>{post.excerpt}</p><footer><time>{post.published_at ? new Date(post.published_at).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" }) : ""}</time><span>{blogReadingMinutes(post.content_markdown)} min</span></footer></div></article>)}</section> : null}
  </>;
}
