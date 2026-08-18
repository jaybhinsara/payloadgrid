import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Braces, Bug, Check, Code2, KeyRound, ListFilter, RefreshCw, ShieldCheck, Workflow } from "lucide-react";

const solutions = [
  { href: "/webhook-service", icon: Workflow, eyebrow: "Webhook as a service", title: "Replace queue plumbing with one operated delivery layer.", copy: "Accept messages, fan out by customer and subscription, sign requests, retain attempts, and recover failures without maintaining another internal platform.", terms: ["Webhook API", "Event fan-out", "Embedded portal"] },
  { href: "/webhook-delivery", icon: ArrowUpFromLine, eyebrow: "Outbound webhooks", title: "Deliver product events your customers can inspect and trust.", copy: "Publish one message, route it to matching destinations, and keep the response, latency, retry, and replay history attached to each delivery.", terms: ["Automatic retries", "HMAC signatures", "Dead letters"] },
  { href: "/webhook-gateway", icon: ArrowDownToLine, eyebrow: "Inbound webhooks", title: "Put a durable gateway in front of provider callbacks.", copy: "Accept JSON, form, XML, and text requests, verify supported providers, preserve useful evidence, and forward events asynchronously to your handler.", terms: ["Provider verification", "Stable inbound URLs", "Traffic protection"] },
  { href: "/webhook-testing", icon: Bug, eyebrow: "Webhook testing", title: "Inspect, edit, simulate, replay, and forward to localhost.", copy: "Debug an integration from the original request through every delivery attempt. Re-run retained events without creating another real payment or order.", terms: ["Local relay CLI", "Editable simulation", "Request inspection"] },
  { href: "/webhook-retries", icon: RefreshCw, eyebrow: "Failure recovery", title: "Turn endpoint failures into a controlled recovery workflow.", copy: "Schedule backoff, inspect every response, cancel unwanted retries, replay in bulk, and resolve dead letters without erasing operational history.", terms: ["Backoff", "Bulk replay", "Resolution history"] }
] as const;

export function OutcomeSection() {
  return <section className="outcome-section" aria-labelledby="outcome-heading">
    <div className="outcome-heading" data-reveal><span className="section-label">From integration to operations</span><h2 id="outcome-heading">A webhook tool for the first test and the thousandth failure.</h2><p>Most webhook products solve one moment. PayloadGrid connects development, delivery, customer configuration, and incident recovery in one product model.</p></div>
    <div className="outcome-grid">
      <article data-reveal><span>01</span><Code2 size={20} /><h3>Integrate without a custom protocol</h3><p>Use HTTPS, cURL, Node.js, Python, batch APIs, and generated event documentation.</p><Link href="/docs/quickstart">Read the quickstart <ArrowRight size={14} /></Link></article>
      <article data-reveal><span>02</span><ListFilter size={20} /><h3>Keep growing delivery histories searchable</h3><p>Search by event, endpoint, status, identifiers, headers, and structured payload fields.</p><Link href="/webhook-delivery">Explore delivery operations <ArrowRight size={14} /></Link></article>
      <article data-reveal><span>03</span><KeyRound size={20} /><h3>Keep customer controls inside your app</h3><p>Embed permission-scoped delivery history, endpoint management, subscriptions, and secret rotation.</p><Link href="/docs/embedded-portal">See the embedded portal <ArrowRight size={14} /></Link></article>
      <article data-reveal><span>04</span><Braces size={20} /><h3>Make event contracts discoverable</h3><p>Version JSON Schema contracts and publish a hosted catalog with examples and test delivery.</p><Link href="/docs/event-contracts">Open event contracts <ArrowRight size={14} /></Link></article>
    </div>
  </section>;
}

export function SolutionDirectory() {
  return <section className="solution-directory" aria-labelledby="solutions-heading">
    <header data-reveal><div><span className="section-label light">Choose your starting point</span><h2 id="solutions-heading">One webhook platform. Five jobs teams search for.</h2></div><p>Start with the problem in front of you. The same workspace and delivery model remain available as your integration grows.</p></header>
    <div>{solutions.map(({ href, icon: Icon, eyebrow, title, copy, terms }, index) => <Link href={href} className="solution-row" key={href} data-reveal><span>{String(index + 1).padStart(2, "0")}</span><i><Icon size={21} /></i><div><small>{eyebrow}</small><h3>{title}</h3><p>{copy}</p><em>{terms.map((term) => <b key={term}><Check size={12} /> {term}</b>)}</em></div><ArrowRight size={20} /></Link>)}</div>
  </section>;
}

const questions = [
  ["What is a webhook service?", "A webhook service accepts events from your application and operates delivery to customer endpoints. It typically handles fan-out, signatures, retries, logs, replay, and endpoint management so each product team does not build those systems independently."],
  ["Can PayloadGrid both receive and send webhooks?", "Yes. Inbound routes receive and forward third-party callbacks. The outbound message API delivers your product events to customer destinations. Both directions use the same delivery, attempt, search, replay, and audit model."],
  ["How does webhook retry work?", "A failed or timed-out delivery moves through scheduled backoff attempts. Operators can inspect responses, replay immediately, cancel retrying deliveries, run controlled bulk replay, or resolve exhausted dead letters while preserving history."],
  ["Can I test webhooks on localhost?", "Yes. The published PayloadGrid CLI can follow retained endpoint events and forward them to a local HTTP handler. The dashboard also supports editable simulations and replay of retained events."],
  ["Does PayloadGrid only support JSON?", "No. Inbound routes can accept JSON, form-encoded, XML, and text bodies. JSON event contracts and visual field mapping apply when the payload is structured JSON."],
  ["Do retries count as new billable events?", "No. Monthly usage counts accepted source events. Delivery attempts, automatic retries, simulations, and filtered events without a matching destination do not add another accepted-event charge."]
] as const;

export function MarketingFaq() {
  return <section className="marketing-faq" aria-labelledby="faq-heading"><header><span className="section-label">Webhook infrastructure FAQ</span><h2 id="faq-heading">Questions teams ask before they trust a webhook platform.</h2></header><div>{questions.map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div><aside><ShieldCheck size={19} /><p>Need implementation details instead of marketing copy?</p><Link href="/docs">Read the technical documentation <ArrowRight size={14} /></Link></aside></section>;
}

export const marketingFaqStructuredData = questions.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } }));
