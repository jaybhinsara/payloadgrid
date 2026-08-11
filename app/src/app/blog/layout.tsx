import type { ReactNode } from "react";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";

export default function BlogLayout({ children }: { children: ReactNode }) {
  return <main className="blog-site"><PublicHeader />{children}<PublicFooter /></main>;
}
