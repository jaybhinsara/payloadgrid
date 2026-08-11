import Link from "next/link";
import { Brand } from "@/components/brand";

const groups = [
  { title: "Product", links: [["Platform", "/#platform"], ["Pricing", "/pricing"], ["Playground", "/playground"], ["Status", "/status"]] },
  { title: "Developers", links: [["Documentation", "/docs"], ["API reference", "/api/openapi"], ["Security", "/security"]] },
  { title: "Company", links: [["About", "/about"], ["Contact", "/contact"], ["Privacy", "/privacy"], ["Terms", "/terms"]] }
] as const;

export function PublicFooter() {
  return <footer className="public-footer"><div className="public-footer-brand"><Brand /><p>Webhook infrastructure for SaaS, commerce, and developer teams worldwide.</p><span>Built for global delivery</span></div>{groups.map((group) => <nav key={group.title} aria-label={group.title}><strong>{group.title}</strong>{group.links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</nav>)}<div className="public-footer-bottom"><span>© {new Date().getFullYear()} PayloadGrid</span><span>Live system health available on the status page.</span></div></footer>;
}
