import { ArrowDownToLine, ArrowUpFromLine, BellRing, Braces, Check, Copy, Database, Fingerprint, Layers3, RefreshCw, Route, ShieldCheck, Users } from "lucide-react";

const capabilities = [
  { icon: Layers3, title: "Transactional intake", copy: "Commit each message, endpoint fan-out, and dispatch record together before returning 202." },
  { icon: Fingerprint, title: "Provider verification", copy: "Verify raw provider requests and sign outbound delivery with rotating secrets." },
  { icon: Braces, title: "Visual schema mapping", copy: "Map nested fields and carry JSON, form, XML, or text bodies without format loss." },
  { icon: BellRing, title: "Traffic circuit breakers", copy: "Buffer anomalous spikes and notify operations before a destination is overwhelmed." },
  { icon: RefreshCw, title: "Recoverable delivery", copy: "Operate backoff, replay, dead letters, and complete attempt history from one lifecycle." },
  { icon: Users, title: "Customer-native evidence", copy: "Embed a signed, permission-scoped delivery-history view inside your own product." }
];

export function ProblemSection() {
  return <section className="problem-section operations-journey" id="why-payloadgrid">
    <div className="problem-intro" data-reveal><span className="section-label">Operating model</span><h2>One event.<br />Five operational guarantees.</h2><p>A webhook should follow one visible path from acceptance to recovery. PayloadGrid keeps every stage durable, inspectable, and controlled from the same workspace.</p></div>
    <div className="problem-ledger" data-reveal>
      <div><span>01</span><Database size={18} /><strong>Accept</strong><p>Commit the message and delivery intent before acknowledging the request.</p></div>
      <div><span>02</span><Route size={18} /><strong>Route</strong><p>Resolve the application, subscriptions, destinations, and payload policy.</p></div>
      <div><span>03</span><ShieldCheck size={18} /><strong>Protect</strong><p>Verify providers, transform safely, and buffer traffic anomalies.</p></div>
      <div><span>04</span><ArrowUpFromLine size={18} /><strong>Deliver</strong><p>Sign every request and retain its response, timing, and attempt evidence.</p></div>
      <div><span>05</span><RefreshCw size={18} /><strong>Recover</strong><p>Retry with backoff, replay deliberately, or resolve the dead letter with history intact.</p></div>
    </div>
  </section>;
}

export function PlatformSection() {
  return <section className="unified-platform" id="platform">
    <div className="platform-heading" data-reveal><span className="section-label">One control plane</span><h2>Two directions.<br />One delivery lifecycle.</h2><p>PayloadGrid sits between the systems producing events and the endpoints consuming them. Inbound callbacks and outbound customer events follow the same observable path without forcing your team to operate two vendors.</p></div>
    <div className="platform-mode outbound-mode" data-reveal>
      <div className="mode-copy"><span className="mode-index">01 / OUTBOUND</span><i><ArrowUpFromLine size={21} /></i><h3>Ship customer-facing webhooks without building a delivery platform.</h3><p>Call one authenticated API or submit a bounded batch. PayloadGrid commits fan-out intent before responding, then signs each request, records the response, and recovers failures.</p><ul><li><Check size={15} /> Scoped API-key authentication</li><li><Check size={15} /> Idempotent single and batch intake</li><li><Check size={15} /> Per-customer event subscriptions</li></ul></div>
      <div className="mode-visual outbound-visual"><div className="visual-toolbar"><span>MESSAGE ROUTER</span><em><i /> LIVE</em></div><div className="message-source"><code>order.completed</code><span>1 message</span></div><div className="fanout-line"><i /><i /><i /></div><div className="fanout-targets"><article><span>AC</span><div><strong>Acme API</strong><small>200 · 184ms</small></div><em>delivered</em></article><article><span>NO</span><div><strong>Northstar</strong><small>503 · retry in 5m</small></div><em className="retry">retrying</em></article><article><span>PL</span><div><strong>Pixel Labs</strong><small>200 · 312ms</small></div><em>delivered</em></article></div></div>
    </div>
    <div className="platform-mode inbound-mode" data-reveal>
      <div className="mode-visual inbound-visual"><div className="visual-toolbar"><span>INBOUND SOURCE</span><em><i /> LISTENING</em></div><div className="provider-row"><span>Razorpay</span><span>Stripe</span><span>Shopify</span><span>Custom</span></div><div className="inbound-route"><div><ArrowDownToLine size={18} /><strong>payment.captured</strong><small>signature received</small></div><i><span /></i><div><img src="/icon.svg" alt="" /><strong>PayloadGrid gateway</strong><small>stored · routed · observed</small></div><i><span /></i><div><Route size={18} /><strong>Your handler</strong><small>HTTP 200 · 241ms</small></div></div><div className="payload-line"><code>{'{ "paymentId": "pay_8921", "amount": 9999 }'}</code><button aria-label="Copy payload"><Copy size={14} /></button></div></div>
      <div className="mode-copy"><span className="mode-index">02 / INBOUND</span><i><ArrowDownToLine size={21} /></i><h3>Put a reliable gateway in front of every provider callback.</h3><p>Give payment, commerce, and custom providers a stable PayloadGrid URL. Every callback is stored, forwarded, measured, and recoverable from the same console.</p><ul><li><Check size={15} /> Raw-body provider verification</li><li><Check size={15} /> Redacted diagnostics and payload capture</li><li><Check size={15} /> Provider-aware payment visibility</li></ul></div>
    </div>
    <div className="capability-grid" data-reveal>{capabilities.map(({ icon: Icon, title, copy }, index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><Icon size={20} /><h3>{title}</h3><p>{copy}</p></article>)}</div>
  </section>;
}
