import type { ReactNode } from "react";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <main className="docs-site"><PublicHeader />{children}<PublicFooter /></main>;
}
