import Link from "next/link";
import { ArrowRight, Check, Code2, Search, ShieldCheck } from "lucide-react";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";

export type SolutionContent = {
  eyebrow: string; title: string; intro: string; definition: string;
  outcomes: Array<{ title: string; copy: string }>;
  workflow: Array<{ title: string; copy: string }>;
  features: string[]; docsHref: string; docsLabel: string;
  related: Array<{ href: string; label: string; copy: string }>;
  faq: Array<[string, string]>;
};

export function SolutionPage({ content, signedIn = false }: { content: SolutionContent; signedIn?: boolean }) {
  const faqJson = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: content.faq.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })) };
  return <main className="solution-page"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJson).replace(/</g, "\\u003c") }} /><PublicHeader signedIn={signedIn} />
    <header className="solution-hero"><div><span className="section-label">{content.eyebrow}</span><h1>{content.title}</h1><p>{content.intro}</p><div className="hero-actions">{signedIn ? <Link className="button primary large" href="/dashboard">Open dashboard <ArrowRight size={17} /></Link> : <Link className="button primary large" href="/signup">Start free <ArrowRight size={17} /></Link>}<Link className="button secondary large" href={content.docsHref}><Code2 size={17} /> {content.docsLabel}</Link></div></div><aside><span>THE SHORT ANSWER</span><p>{content.definition}</p><Link href="/playground">Try the interactive playground <ArrowRight size={14} /></Link></aside></header>
    <section className="solution-outcomes"><header><span className="section-label">Why teams use it</span><h2>Move from webhook code to webhook operations.</h2></header><div>{content.outcomes.map((item, index) => <article key={item.title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{item.title}</h3><p>{item.copy}</p></article>)}</div></section>
    <section className="solution-workflow"><header><span className="section-label light">How it works</span><h2>A visible path from event to evidence.</h2></header><div>{content.workflow.map((item, index) => <article key={item.title}><i>{index + 1}</i><div><h3>{item.title}</h3><p>{item.copy}</p></div>{index < content.workflow.length - 1 ? <ArrowRight size={18} /> : <Check size={18} />}</article>)}</div></section>
    <section className="solution-capabilities"><div><span className="section-label">Included capabilities</span><h2>The controls production webhook traffic needs.</h2><p>Start with one workflow and keep the same organization, project, application, endpoint, delivery, and attempt model as usage expands.</p><Link className="text-button" href={content.docsHref}>{content.docsLabel} <ArrowRight size={14} /></Link></div><ul>{content.features.map((feature) => <li key={feature}><ShieldCheck size={16} /> {feature}</li>)}</ul></section>
    <section className="solution-related"><header><span className="section-label">Explore the platform</span><h2>Related webhook workflows</h2></header><div>{content.related.map((item) => <Link href={item.href} key={item.href}><Search size={17} /><span><strong>{item.label}</strong><small>{item.copy}</small></span><ArrowRight size={16} /></Link>)}</div></section>
    <section className="marketing-faq solution-faq"><header><span className="section-label">Frequently asked</span><h2>Technical questions, answered directly.</h2></header><div>{content.faq.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>
    <section className="solution-cta"><span className="section-label light">Build with PayloadGrid</span><h2>Make the next webhook an integration, not another infrastructure project.</h2><p>Start with the free plan, send a real event, and inspect the complete delivery lifecycle.</p><Link className="button primary large" href={signedIn ? "/dashboard" : "/signup"}>{signedIn ? "Open dashboard" : "Start building free"} <ArrowRight size={17} /></Link></section><PublicFooter />
  </main>;
}
