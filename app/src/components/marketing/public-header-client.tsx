"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowRight, LayoutDashboard, Menu, X } from "lucide-react";
import { Brand } from "@/components/brand";

const links = [
  { href: "/#platform", label: "Platform" },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/status", label: "Status" }
];

export function PublicHeaderClient({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return <header className="future-nav public-nav"><Brand />
    <nav aria-label="Main navigation">{links.map((link) => <Link key={link.href} className={pathname === link.href ? "active" : ""} href={link.href}>{link.label}</Link>)}</nav>
    <div className="public-nav-actions">{signedIn
      ? <Link className="button primary" href="/dashboard"><LayoutDashboard size={16} /> Dashboard</Link>
      : <><Link className="button ghost" href="/login">Sign in</Link><Link className="button primary" href="/signup">Start free <ArrowRight size={16} /></Link></>}
    </div>
    <button className="icon-button public-menu-button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Close navigation" : "Open navigation"}>{open ? <X size={20} /> : <Menu size={20} />}</button>
    {open ? <div className="public-mobile-menu">{links.map((link) => <Link key={link.href} href={link.href} onClick={close}>{link.label}</Link>)}{signedIn
      ? <Link className="button primary" href="/dashboard" onClick={close}><LayoutDashboard size={16} /> Dashboard</Link>
      : <><Link href="/login" onClick={close}>Sign in</Link><Link className="button primary" href="/signup" onClick={close}>Start free <ArrowRight size={16} /></Link></>}
    </div> : null}
  </header>;
}
