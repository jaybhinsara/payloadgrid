import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";
import { notFound, permanentRedirect } from "next/navigation";
import { MarkdownContent } from "@/components/blog/markdown-content";
import { blogReadingMinutes, getBlogRedirect, getPublishedPost } from "@/lib/blog";
import { publicMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug);
  if (!post) return { title: "Article not found", robots: { index: false, follow: false } };
  const title = post.seo_title || post.title; const description = post.seo_description || post.excerpt; const path = `/blog/${post.slug}`;
  const base = publicMetadata({ title, description, path });
  return { ...base, openGraph: { type: "article", url: path, siteName: "PayloadGrid", title, description, publishedTime: post.published_at || undefined, modifiedTime: post.updated_at, images: post.cover_image_url ? [{ url: post.cover_image_url, alt: post.cover_image_alt || post.title }] : undefined }, twitter: { card: "summary_large_image", title, description, images: post.cover_image_url ? [post.cover_image_url] : undefined } };
}

export default async function BlogArticlePage({ params }: Params) {
  const slug = (await params).slug; const post = await getPublishedPost(slug);
  if (!post) { const redirect = await getBlogRedirect(slug); if (redirect) permanentRedirect(`/blog/${redirect}`); notFound(); }
  const url = `${SITE_URL}/blog/${post.slug}`;
  const structuredData = { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", headline: post.title, description: post.excerpt, image: post.cover_image_url || undefined, datePublished: post.published_at, dateModified: post.updated_at, author: { "@type": "Person", name: post.author_name || "PayloadGrid" }, publisher: { "@type": "Organization", name: "PayloadGrid", url: SITE_URL, logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.svg` } }, mainEntityOfPage: url },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "PayloadGrid", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` }, { "@type": "ListItem", position: 3, name: post.title, item: url }] }
  ] };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><article className="blog-article"><Link className="blog-back" href="/blog"><ArrowLeft size={14} /> All articles</Link><header><span className="section-label">{post.category}</span><h1>{post.title}</h1><p>{post.excerpt}</p><div className="blog-meta"><span>{post.author_name || "PayloadGrid"}</span><span><Clock3 size={13} /> {blogReadingMinutes(post.content_markdown)} min read</span><time>{post.published_at ? new Date(post.published_at).toLocaleDateString("en", { year: "numeric", month: "long", day: "numeric" }) : ""}</time></div>{post.tags.length ? <div className="blog-tags">{post.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}</header>{post.cover_image_url ? <figure><img src={post.cover_image_url} alt={post.cover_image_alt || ""} /></figure> : null}<MarkdownContent content={post.content_markdown} /><footer className="blog-article-cta"><span className="section-label">Operate the path</span><h2>Move webhook delivery out of your application request.</h2><p>PayloadGrid handles inbound and outbound delivery, retries, signatures, replay, and evidence through one control plane.</p><Link className="button primary" href="/signup">Start building free</Link></footer></article></>;
}
