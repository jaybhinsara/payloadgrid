import Link from "next/link";
import { Activity, ArrowRight, BookOpen, Braces, RadioTower, Send, ShieldCheck, TerminalSquare } from "lucide-react";
import { DocsSearch } from "@/components/docs/docs-search";
import { DOC_ARTICLES, DOC_GROUPS, DOC_SEARCH_INDEX, docsInGroup } from "@/lib/docs";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({
  title: "Webhook Documentation",
  description: "PayloadGrid documentation for outbound and inbound webhooks, delivery operations, event contracts, SDKs, embedded portals, security, and administration.",
  path: "/docs"
});

const groupIcons = [BookOpen, RadioTower, Activity, TerminalSquare, ShieldCheck];

export default function DocsHome() {
  return <>
    <header className="docs-home-hero"><div><span className="section-label">PayloadGrid documentation</span><h1>Build and operate every webhook path.</h1><p>Task-oriented guidance for outbound delivery, inbound callbacks, customer portals, contracts, local development, failure recovery, and production administration.</p><DocsSearch items={DOC_SEARCH_INDEX} large /></div><aside><strong>Start with a workflow</strong><Link href="/docs/quickstart"><Send size={17} /><span><b>Send your first event</b><small>Application to signed delivery</small></span><ArrowRight size={15} /></Link><Link href="/docs/inbound-webhooks"><RadioTower size={17} /><span><b>Receive provider callbacks</b><small>Verify, retain, and forward</small></span><ArrowRight size={15} /></Link><Link href="/docs/dashboard"><Activity size={17} /><span><b>Learn the dashboard</b><small>Every view and operator action</small></span><ArrowRight size={15} /></Link></aside></header>

    <section className="docs-home-strip" aria-label="Documentation coverage"><span><b>{DOC_ARTICLES.length}</b> focused guides</span><span><b>2</b> event directions</span><span><b>4</b> published developer packages</span><span><b>1</b> unified operations model</span></section>

    <div className="docs-home-groups">{DOC_GROUPS.map((group, groupIndex) => { const Icon = groupIcons[groupIndex]; return <section key={group.name}><header><Icon size={20} /><div><h2>{group.name}</h2><p>{group.description}</p></div></header><div>{docsInGroup(group.name).map((article) => <Link key={article.slug} href={`/docs/${article.slug}`}><span><strong>{article.title}</strong><small>{article.summary}</small></span><ArrowRight size={15} /></Link>)}</div></section>; })}</div>

    <section className="docs-dashboard-band"><div><span className="section-label">Console reference</span><h2>The dashboard is documented as an operating system, not a screenshot.</h2><p>Understand what every metric means, which resource owns each record, what each state permits, and what an operator should do next.</p><Link className="button primary" href="/docs/dashboard">Open dashboard guide <ArrowRight size={15} /></Link></div><div className="docs-dashboard-map"><span><Braces size={16} /> Configure applications, endpoints, and contracts</span><span><Send size={16} /> Accept messages and provider callbacks</span><span><Activity size={16} /> Search, inspect, replay, cancel, and resolve</span><span><ShieldCheck size={16} /> Manage keys, roles, retention, and health</span></div></section>

    <section className="docs-reference-row"><div><span className="section-label">Machine readable</span><h2>Build from the same contracts.</h2><p>Use the OpenAPI 3.1 document for public API generation and the application contract endpoint for event-specific types.</p></div><nav><Link href="/api/openapi" target="_blank">OpenAPI JSON <ArrowRight size={14} /></Link><Link href="/docs/sdks-api">SDK reference <ArrowRight size={14} /></Link><Link href="/docs/cli-local-development">CLI reference <ArrowRight size={14} /></Link></nav></section>
  </>;
}
