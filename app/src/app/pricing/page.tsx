import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { PublicPage } from "@/components/marketing/public-page";
import { PLAN_LIMITS } from "@/lib/limits";

export const metadata: Metadata = { title: "Pricing", description: "Start free with PayloadGrid webhook infrastructure and contact us for higher-volume capacity." };

export default function PricingPage() {
  return <PublicPage eyebrow="Simple pricing" title="Start free. Scale with your traffic." intro="Use the Free plan for development and production workloads within the included limits. No credit card is required.">
    <section className="pricing-plan"><div><span>FREE</span><h2>$0</h2><p>per month</p><Link className="button primary large" href="/signup">Create a workspace <ArrowRight size={17} /></Link></div><ul><li><Check size={17} /> {PLAN_LIMITS.messagesPerMonth.toLocaleString()} events per project / month</li><li><Check size={17} /> {PLAN_LIMITS.endpoints} endpoints per project</li><li><Check size={17} /> {PLAN_LIMITS.teamMembers} team members</li><li><Check size={17} /> {PLAN_LIMITS.payloadRetentionDays}-day payload retention</li><li><Check size={17} /> Automatic retries and manual replay</li><li><Check size={17} /> Provider signature verification</li><li><Check size={17} /> Delivery logs and audit history</li></ul></section>
    <section className="public-section"><span className="section-label">Custom capacity</span><h2>Plan around your real workload.</h2><p>For higher event volume, throughput, retention, or support requirements, contact PayloadGrid with your architecture and expected traffic. Capacity and service commitments are agreed explicitly before limits change.</p><Link className="text-link" href="/contact">Discuss capacity <ArrowRight size={15} /></Link></section>
    <section className="public-faq"><h2>Plan questions</h2><details><summary>Can I use the Free plan in production?</summary><p>Yes, within the published limits. For business-critical systems, keep an independent recovery path and review the current service status and terms. A contractual SLA applies only when agreed in writing.</p></details><details><summary>Are retries counted again?</summary><p>No. Usage counts accepted source events, not individual retry attempts.</p></details><details><summary>Can limits be increased?</summary><p>Contact us with the expected provider, monthly volume, throughput, and retention needs. We will review capacity before raising a limit.</p></details></section>
  </PublicPage>;
}
