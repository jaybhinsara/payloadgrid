import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { CodeSample } from "@/components/docs/code-sample";
import { DocsSearch } from "@/components/docs/docs-search";
import { DOC_ARTICLES, DOC_GROUPS, DOC_SEARCH_INDEX, type DocArticle } from "@/lib/docs";

function DocsNavigation({ current }: { current: string }) {
  return <nav className="docs-side-nav" aria-label="Documentation navigation"><DocsSearch items={DOC_SEARCH_INDEX} />{DOC_GROUPS.map((group) => <section key={group.name}><strong>{group.name}</strong>{DOC_ARTICLES.filter((article) => article.category === group.name).map((article) => <Link key={article.slug} href={`/docs/${article.slug}`} className={article.slug === current ? "active" : ""}>{article.title}</Link>)}</section>)}</nav>;
}

function Note({ note }: { note: NonNullable<DocArticle["sections"][number]["note"]> }) {
  const Icon = note.tone === "warning" ? TriangleAlert : note.tone === "success" ? CheckCircle2 : Info;
  return <aside className={`docs-note ${note.tone || "info"}`}><Icon size={18} /><div><strong>{note.title}</strong><p>{note.body}</p></div></aside>;
}

export function DocsArticlePage({ article }: { article: DocArticle }) {
  const index = DOC_ARTICLES.findIndex((item) => item.slug === article.slug);
  const previous = index > 0 ? DOC_ARTICLES[index - 1] : null;
  const next = index < DOC_ARTICLES.length - 1 ? DOC_ARTICLES[index + 1] : null;
  return <div className="docs-reader">
    <aside className="docs-reader-sidebar"><Link className="docs-home-link" href="/docs"><ArrowLeft size={14} /> Documentation home</Link><details className="docs-mobile-index"><summary>Browse documentation</summary><DocsNavigation current={article.slug} /></details><div className="docs-desktop-index"><DocsNavigation current={article.slug} /></div></aside>
    <article className="docs-article">
      <header><nav aria-label="Breadcrumb"><Link href="/docs">Docs</Link><span>/</span><span>{article.category}</span></nav><span className="section-label">{article.category}</span><h1>{article.title}</h1><p>{article.summary}</p><small>{article.readTime} read · Updated with the current dashboard</small></header>
      {article.sections.map((section) => <section id={section.id} key={section.id}><h2>{section.title}</h2>{section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.steps ? <ol className="docs-task-steps">{section.steps.map((step, stepIndex) => <li key={step.title}><span>{stepIndex + 1}</span><div><strong>{step.title}</strong><p>{step.body}</p></div></li>)}</ol> : null}{section.bullets ? <ul className="docs-bullets">{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}{section.table ? <div className="docs-table-wrap"><table><thead><tr>{section.table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row, rowIndex) => <tr key={`${section.id}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div> : null}{section.code?.map((sample) => <CodeSample key={`${section.id}-${sample.label}`} {...sample} />)}{section.note ? <Note note={section.note} /> : null}</section>)}
      <footer className="docs-article-pagination">{previous ? <Link href={`/docs/${previous.slug}`}><ArrowLeft size={15} /><span><small>Previous</small><strong>{previous.title}</strong></span></Link> : <span />}{next ? <Link href={`/docs/${next.slug}`}><span><small>Next</small><strong>{next.title}</strong></span><ArrowRight size={15} /></Link> : null}</footer>
    </article>
    <aside className="docs-on-page"><strong>On this page</strong>{article.sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}<Link href="/api/openapi">OpenAPI JSON <ArrowRight size={12} /></Link></aside>
  </div>;
}
