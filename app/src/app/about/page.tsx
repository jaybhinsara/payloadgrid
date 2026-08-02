import type { Metadata } from "next";
import { PublicPage } from "@/components/marketing/public-page";

export const metadata: Metadata = { title: "About", description: "Why PayloadGrid is building webhook infrastructure for teams operating global software products." };

export default function AboutPage() {
  return <PublicPage eyebrow="About PayloadGrid" title="Webhook operations for globally distributed products." intro="PayloadGrid gives SaaS, commerce, fintech, and platform teams one control plane for inbound callbacks and customer-facing event delivery.">
    <section className="public-section"><span className="section-label">Why this exists</span><h2>Webhook traffic deserves the same operational care as application APIs.</h2><p>Modern products connect payment APIs, commerce platforms, customer endpoints, and internal systems. Each integration brings different signatures, identifiers, payloads, retries, and failure behavior. PayloadGrid puts those events into one understandable delivery system.</p></section>
    <section className="public-section"><span className="section-label">How we operate</span><h2>Operational clarity by default.</h2><p>Complete delivery records, transparent plan limits, short payload retention, and visible service health make the platform easier to evaluate and operate. Reliability numbers, certifications, testimonials, and case studies are published only when backed by verifiable evidence.</p></section>
    <section className="boundary-table"><div><strong>Platform focus</strong><p>Inbound and outbound webhooks, automatic retries, manual replay, signatures, tenant isolation, transformations, alerts, and delivery evidence.</p></div><div><strong>Operating principles</strong><p>Clear failure states, explicit limits, secure defaults, portable integrations, and no unsupported reliability or compliance claims.</p></div></section>
  </PublicPage>;
}
