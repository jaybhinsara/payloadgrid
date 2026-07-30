import Link from "next/link";
import { ArrowRight, Braces, Check, CircleCheck, CloudCog, Code2, Globe2, KeyRound, RefreshCw, Route, ShieldCheck, TerminalSquare, Webhook } from "lucide-react";
import { Brand } from "@/components/brand";

const features = [
  { icon: Route, title: "Outbound delivery", copy: "Send once and fan out to every subscribed customer endpoint with idempotency and durable retries." },
  { icon: Webhook, title: "Inbound gateway", copy: "Receive Razorpay, Stripe, Cashfree, Shopify, and custom callbacks through one observable route." },
  { icon: ShieldCheck, title: "Signed by default", copy: "Every endpoint gets an independent HMAC secret and verifiable delivery headers." },
  { icon: RefreshCw, title: "Recovery built in", copy: "Inspect attempts, responses, latency, scheduled retries, and replay any event on demand." },
  { icon: Braces, title: "Payload control", copy: "Subscribe endpoints by event type and transform fields before delivery without changing your app." },
  { icon: Globe2, title: "One global API", copy: "Use the REST API from any language. Start with curl, then move to your preferred SDK." }
];

export default function Home() {
  return (
    <main className="marketing">
      <header className="site-nav">
        <Brand />
        <nav aria-label="Main navigation"><a href="#platform">Platform</a><a href="#developers">Developers</a><a href="#pricing">Pricing</a></nav>
        <div className="nav-actions"><Link className="button ghost" href="/login">Sign in</Link><Link className="button primary" href="/signup">Start free <ArrowRight size={16} /></Link></div>
      </header>

      <section className="hero-band">
        <div className="hero-copy">
          <span className="signal-label"><i /> Webhook infrastructure for product teams</span>
          <h1>Webhook delivery infrastructure</h1>
          <p>Send, receive, secure, monitor, and recover webhooks from one control plane. HookIn handles the unreliable parts between your API and every customer endpoint.</p>
          <div className="hero-actions"><Link className="button primary large" href="/signup">Build with HookIn <ArrowRight size={18} /></Link><a className="button secondary large" href="#developers"><Code2 size={18} /> View API</a></div>
          <div className="trust-line"><span><Check size={15} /> No card required</span><span><Check size={15} /> Multi-tenant from day one</span><span><Check size={15} /> Built on Postgres</span></div>
        </div>
        <div className="hero-console" aria-label="HookIn delivery console preview">
          <div className="console-bar"><span><i /><i /><i /></span><code>hookin / production</code><span className="live-pill"><i /> LIVE</span></div>
          <div className="console-body">
            <div className="console-side"><strong>H</strong><i /><i /><i /><i /></div>
            <div className="console-main">
              <div className="console-title"><div><span>DELIVERY</span><strong>order.completed</strong></div><span className="success-badge"><CircleCheck size={13} /> Delivered</span></div>
              <div className="route-line"><span className="route-node"><CloudCog size={17} /> Your API</span><i><ArrowRight size={14} /></i><span className="route-node active"><Webhook size={17} /> HookIn</span><i><ArrowRight size={14} /></i><span className="route-node"><Globe2 size={17} /> Customer</span></div>
              <div className="attempt-list"><div><span className="attempt-number">03</span><span><strong>200 OK</strong><small>Recovered automatically</small></span><code>184ms</code></div><div><span className="attempt-number muted">02</span><span><strong>503 Service unavailable</strong><small>Retried after 5 minutes</small></span><code>912ms</code></div><div><span className="attempt-number muted">01</span><span><strong>Timeout</strong><small>Connection exceeded 15s</small></span><code>15.0s</code></div></div>
              <div className="signature-row"><KeyRound size={15} /><code>hookin-signature: v1,pxj8...kP2</code><ShieldCheck size={16} /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="proof-strip"><span>RAZORPAY</span><span>STRIPE</span><span>CASHFREE</span><span>SHOPIFY</span><span>CUSTOM APIs</span></section>

      <section className="platform-section" id="platform">
        <div className="section-intro"><span className="section-label">The control plane</span><h2>One reliable path for every event</h2><p>HookIn combines outbound webhook infrastructure and an inbound event gateway, so your team has one operational model instead of scattered queues and logs.</p></div>
        <div className="feature-grid">{features.map(({ icon: Icon, title, copy }) => <article key={title}><Icon size={21} /><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section className="developer-band" id="developers">
        <div><span className="section-label light">Developer first</span><h2>One request. Every endpoint.</h2><p>Create an application, add customer endpoints, then send a message with one authenticated API call. HookIn handles filtering, signing, attempts, and recovery.</p><ul><li><Check size={16} /> API keys are stored as one-way hashes</li><li><Check size={16} /> Idempotency keys prevent duplicate messages</li><li><Check size={16} /> Endpoint-specific HMAC signatures</li></ul></div>
        <div className="code-window"><div><TerminalSquare size={16} /> Send an event <span>curl</span></div><pre><code>{`curl -X POST https://hookin.vercel.app/api/v1/messages \\
  -H "Authorization: Bearer hkin_live_..." \\
  -H "Idempotency-Key: order_8921" \\
  -H "Content-Type: application/json" \\
  -d '{
    "applicationId": "app-id",
    "eventType": "order.completed",
    "payload": { "orderId": "8921" }
  }'`}</code></pre></div>
      </section>

      <section className="pricing-section" id="pricing"><div><span className="section-label">Simple start</span><h2>Build before you pay</h2><p>The free workspace includes the full product foundation for development. Usage billing can be connected when HookIn is ready for public customers.</p></div><Link className="button primary large" href="/signup">Create free workspace <ArrowRight size={18} /></Link></section>
      <footer className="site-footer"><Brand /><p>Reliable webhook infrastructure, built for teams everywhere.</p><span>HookIn</span></footer>
    </main>
  );
}