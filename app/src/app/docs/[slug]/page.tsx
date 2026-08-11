import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticlePage } from "@/components/docs/docs-article";
import { DOC_ARTICLES, getDoc } from "@/lib/docs";
import { publicMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export function generateStaticParams() { return DOC_ARTICLES.map((article) => ({ slug: article.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const article = getDoc((await params).slug);
  if (!article) return {};
  return publicMetadata({ title: article.title, description: article.summary, path: `/docs/${article.slug}` });
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const article = getDoc((await params).slug);
  if (!article) notFound();
  const url = `${SITE_URL}/docs/${article.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: article.title,
        description: article.summary,
        url,
        mainEntityOfPage: url,
        author: { "@type": "Organization", name: "PayloadGrid", url: SITE_URL },
        publisher: { "@type": "Organization", name: "PayloadGrid", url: SITE_URL }
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "PayloadGrid", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Documentation", item: `${SITE_URL}/docs` },
          { "@type": "ListItem", position: 3, name: article.title, item: url }
        ]
      }
    ]
  };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><DocsArticlePage article={article} /></>;
}
