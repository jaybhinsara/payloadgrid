import type { ReactNode } from "react";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";

export function PublicPage({ eyebrow, title, intro, children }: { eyebrow: string; title: string; intro: string; children: ReactNode }) {
  return <main className="public-shell"><PublicHeader signedIn={false} /><header className="public-page-hero"><span className="section-label">{eyebrow}</span><h1>{title}</h1><p>{intro}</p></header><div className="public-page-body">{children}</div><PublicFooter /></main>;
}

export function CodeBlock({ children }: { children: string }) { return <pre className="docs-code"><code>{children}</code></pre>; }
