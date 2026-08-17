import Link from "next/link";
import { ArrowRight, Check, Clock3 } from "lucide-react";
import { PublicPage } from "@/components/marketing/public-page";
import { RazorpayCheckoutButton } from "@/components/razorpay-checkout-button";
import { paymentsEnabled } from "@/lib/payments";
import { PLAN_CATALOG, type PlanId } from "@/lib/plans";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Webhook Infrastructure Pricing", description: "PayloadGrid pricing for reliable inbound and outbound webhooks, retries, replay, signatures, analytics, and delivery evidence.", path: "/pricing" });

const order: PlanId[] = ["free", "starter", "growth", "enterprise"];

export default function PricingPage() {
  const checkoutEnabled = paymentsEnabled();
  return <PublicPage eyebrow="Simple, bounded pricing" title="Start free. Pay when traffic grows." intro="Every plan includes the complete delivery path. Higher tiers increase accepted events, throughput, retention, endpoints, and team capacity without charging again for retry attempts.">
    <section className="pricing-grid">
      {order.map((id) => { const plan = PLAN_CATALOG[id]; return <article className={id === "starter" ? "featured" : ""} key={id}>
        <header><span>{id === "starter" ? "RECOMMENDED" : plan.name.toUpperCase()}</span><h2>{plan.monthlyPriceInr === null ? "Custom" : `₹${plan.monthlyPriceInr.toLocaleString("en-IN")}`}</h2><p>{plan.monthlyPriceInr === null ? "capacity agreement" : "per workspace / month"}</p></header>
        <p>{plan.description}</p>
        <ul><li><Check size={16} /> {plan.limits.messagesPerMonth.toLocaleString()} accepted events / month</li><li><Check size={16} /> {plan.limits.endpoints.toLocaleString()} endpoints / project</li><li><Check size={16} /> {plan.limits.teamMembers.toLocaleString()} team members</li><li><Check size={16} /> {plan.limits.payloadRetentionDays}-day payload retention</li>{plan.features.map((feature) => <li key={feature}><Check size={16} /> {feature}</li>)}</ul>
        {id === "starter" || id === "growth" ? checkoutEnabled
          ? <RazorpayCheckoutButton plan={id} planName={plan.name} />
          : <div className="checkout-action"><button className="button primary" type="button" disabled><Clock3 size={16} /> Payments temporarily unavailable</button><p className="checkout-message" role="status">Paid checkout is paused while we complete a payment-provider update.</p></div>
          : <Link className="button secondary" href={id === "enterprise" ? `/contact?plan=${id}` : "/signup"}>{id === "enterprise" ? "Contact sales" : "Start free"} <ArrowRight size={16} /></Link>}
      </article>; })}
    </section>
    <section className="public-section"><span className="section-label">Commercial guardrails</span><h2>Predictable capacity without unlimited-usage surprises.</h2><p>Accepted inbound and outbound source events count toward monthly usage. Retries, filtered events with no matching destination, simulations, and delivery attempts do not create additional accepted-event charges. When paid checkout is available, each purchase activates one month of Starter or Growth capacity and does not renew automatically.</p></section>
    <section className="public-faq"><h2>Plan questions</h2><details><summary>Can I use the Free plan in production?</summary><p>Yes, within its published limits. Maintain an independent recovery path for critical operations. A contractual SLA applies only when agreed in writing.</p></details><details><summary>What happens at a limit?</summary><p>PayloadGrid rejects new accepted events with a clear limit response rather than silently creating overage charges. Contact support before a planned traffic increase.</p></details><details><summary>Are taxes included?</summary><p>Displayed prices exclude taxes unless checkout states otherwise. The merchant shown at checkout calculates applicable sales tax, VAT, GST, or similar charges based on the transaction and billing location.</p></details><details><summary>Does checkout renew automatically?</summary><p>No. Razorpay Standard Checkout activates one monthly period. Purchase the next period manually before the current period ends, or contact sales for a written recurring arrangement.</p></details></section>
  </PublicPage>;
}
