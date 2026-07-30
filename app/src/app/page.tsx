import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
import { Brand } from "@/components/brand";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingMotion } from "@/components/marketing/motion";
import { PlatformSection, ProblemSection } from "@/components/marketing/platform";
import { DeveloperSection, FinalCta, SecuritySection, UseCasesSection } from "@/components/marketing/growth";
import { SITE_URL } from "@/lib/site";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "PayloadGrid",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "PayloadGrid",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` }
    },
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#application`,
      name: "PayloadGrid",
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      browserRequirements: "Requires a modern web browser",
      description: "Webhook infrastructure for sending, receiving, signing, retrying, replaying, and monitoring webhook events.",
      featureList: [
        "Inbound and outbound webhooks",
        "Automatic webhook retries",
        "Webhook replay and delivery logs",
        "HMAC request signatures",
        "Event subscriptions and payload transformations",
        "Multi-tenant organizations and projects"
      ],
      provider: { "@id": `${SITE_URL}/#organization` }
    }
  ]
};

export default function Home() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><main className="marketing-v2">
    <MarketingMotion />
    <header className="future-nav"><Brand /><nav aria-label="Main navigation"><a href="#platform">Platform</a><a href="#use-cases">Use cases</a><a href="#security">Security</a><a href="#developers">Developers</a></nav><div><Link className="button ghost" href="/login">Sign in</Link><Link className="button primary" href="/signup">Start free <ArrowRight size={16} /></Link></div></header>
    <MarketingHero />
    <section className="proof-rail" aria-label="Supported webhook ecosystems"><span><Radio size={13} /> ONE CONTROL PLANE FOR</span><div><strong>SAAS APIs</strong><strong>RAZORPAY</strong><strong>STRIPE</strong><strong>CASHFREE</strong><strong>SHOPIFY</strong><strong>CUSTOM EVENTS</strong></div></section>
    <ProblemSection />
    <PlatformSection />
    <UseCasesSection />
    <SecuritySection />
    <DeveloperSection />
    <FinalCta />
    <footer className="future-footer"><Brand /><p>Reliable inbound and outbound webhook infrastructure for product teams.</p><nav><a href="#platform">Platform</a><a href="#security">Security</a><Link href="/login">Console</Link></nav><span>PayloadGrid</span></footer>
  </main></>;
}
