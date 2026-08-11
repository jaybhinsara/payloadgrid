import { Mail, MessageSquareText, ShieldAlert } from "lucide-react";
import { PublicPage } from "@/components/marketing/public-page";
import { SUPPORT_EMAIL } from "@/lib/site";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Contact PayloadGrid", description: "Contact PayloadGrid about webhook infrastructure, technical support, event-volume capacity planning, or private security reports.", path: "/contact" });

export default function ContactPage() {
  const subject = encodeURIComponent("PayloadGrid product question");
  return <PublicPage eyebrow="Contact" title="Talk to PayloadGrid." intro="Send your expected event volume, architecture, and operational requirements. Specific context helps us give you a useful answer faster.">
    <section className="contact-grid"><a href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}><Mail size={22} /><h2>Product and capacity</h2><p>{SUPPORT_EMAIL}</p><span>Include monthly events, peak throughput, providers, and required regions.</span></a><a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("PayloadGrid support request")}`}><MessageSquareText size={22} /><h2>Technical support</h2><p>Describe the event ID and observed behavior.</p><span>Never email API keys, provider secrets, or complete payment payloads.</span></a><a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("PayloadGrid security report")}`}><ShieldAlert size={22} /><h2>Security report</h2><p>Request a private disclosure channel.</p><span>Do not include exploit details or customer data in the first message.</span></a></section>
  </PublicPage>;
}
