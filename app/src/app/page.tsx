import { Radio } from "lucide-react";
import { MarketingHero } from "@/components/marketing/hero";
import { MarketingMotion } from "@/components/marketing/motion";
import { PlatformSection, ProblemSection } from "@/components/marketing/platform";
import { DeveloperSection, FinalCta, LocalDevelopmentSection, ProductionSection, SecuritySection, UseCasesSection } from "@/components/marketing/growth";
import { MarketingFaq, OutcomeSection, SolutionDirectory, marketingFaqStructuredData } from "@/components/marketing/seo-sections";
import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicHeader } from "@/components/marketing/public-header";
import { SITE_URL } from "@/lib/site";
import { hasSessionCookie } from "@/lib/auth";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({
  title: "Webhook Service, Gateway and Delivery Platform",
  description: "Send, receive, test, retry, replay, and monitor webhooks with PayloadGrid. One webhook service for inbound gateways, outbound delivery, local testing, and failure recovery.",
  path: "/"
});

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "PayloadGrid", url: SITE_URL, logo: `${SITE_URL}/icon.svg` },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, name: "PayloadGrid", url: SITE_URL, publisher: { "@id": `${SITE_URL}/#organization` } },
    { "@type": "Service", "@id": `${SITE_URL}/#webhook-service`, name: "PayloadGrid webhook infrastructure", serviceType: "Webhook delivery, receiving, testing, and operations", provider: { "@id": `${SITE_URL}/#organization` }, areaServed: "Worldwide", url: SITE_URL },
    {
      "@type": "WebApplication", "@id": `${SITE_URL}/#application`, name: "PayloadGrid", url: SITE_URL,
      applicationCategory: "DeveloperApplication", operatingSystem: "Any", browserRequirements: "Requires a modern web browser",
      description: "Global webhook infrastructure for SaaS and developer teams to send, receive, sign, retry, replay, and monitor events.",
      featureList: ["Inbound and outbound webhooks", "Transactional webhook intake", "Bounded batch ingestion", "Automatic webhook retries", "Webhook replay and delivery logs", "Provider signature verification", "Rotating HMAC request signatures", "Scoped API keys", "Embedded customer delivery history", "Multi-tenant organizations and projects"],
      provider: { "@id": `${SITE_URL}/#organization` }, offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free plan with 10,000 accepted events per month" }
    },
    { "@type": "FAQPage", mainEntity: marketingFaqStructuredData }
  ]
};

export default async function Home() {
  const signedIn = await hasSessionCookie();
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><main className="marketing-v2">
    <MarketingMotion /><PublicHeader signedIn={signedIn} /><MarketingHero signedIn={signedIn} />
    <section className="proof-rail" aria-label="Supported webhook ecosystems"><span><Radio size={13} /> BUILT FOR</span><div><strong>SAAS PLATFORMS</strong><strong>PAYMENT APIS</strong><strong>COMMERCE</strong><strong>INTERNAL SYSTEMS</strong><strong>CUSTOM EVENTS</strong></div></section>
    <OutcomeSection /><SolutionDirectory /><ProblemSection /><PlatformSection /><ProductionSection /><LocalDevelopmentSection /><SecuritySection /><UseCasesSection /><DeveloperSection /><MarketingFaq /><FinalCta signedIn={signedIn} /><PublicFooter />
  </main></>;
}
