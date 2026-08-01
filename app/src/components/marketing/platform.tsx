import { Activity, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, BellRing, Braces, Check, Clock3, Copy, Fingerprint, GitBranch, KeyRound, RefreshCw, Route, ShieldCheck, Users } from "lucide-react";

const capabilities = [
  { icon: RefreshCw, title: "Automatic recovery", copy: "Increasing retry intervals, manual replay, and complete attempt history." },
  { icon: Fingerprint, title: "Signed delivery", copy: "Independent HMAC secrets and timestamped signatures for every endpoint." },
  { icon: GitBranch, title: "Event subscriptions", copy: "Send only the event types each destination has chosen to receive." },
  { icon: Braces, title: "Payload control", copy: "Add, remove, or rename fields before messages leave the control plane." },
  { icon: BellRing, title: "Failure alerts", copy: "Notify operations through email, Slack, or a custom webhook destination." },
  { icon: Users, title: "Tenant isolation", copy: "Separate organizations, projects, applications, keys, and delivery records." }
];

export function ProblemSection() {
  return <section className="problem-section" id="why-payloadgrid">
    <div className="problem-intro" data-reveal><span className="section-label">Why PayloadGrid</span><h2>A POST request is easy.<br />Operating it is not.</h2><p>The first webhook can ship in an afternoon. Production brings failing endpoints, duplicate events, signature rotation, support tickets, and a retry queue your team has to own forever.</p></div>
    <div className="problem-ledger" data-reveal>
      <div><span>01</span><AlertTriangle size={18} /><strong>Customer endpoints fail</strong><p>Timeouts, expired certificates, deployments, and rate limits become your incident.</p></div>
      <div><span>02</span><Clock3 size={18} /><strong>Retries become infrastructure</strong><p>Schedules, dead letters, idempotency, and replay need durable state and careful operations.</p></div>
      <div><span>03</span><KeyRound size={18} /><strong>Security is easy to get wrong</strong><p>Unsigned payloads and replayable requests expose both your product and your customers.</p></div>
      <div><span>04</span><Activity size={18} /><strong>Support needs evidence</strong><p>Without payloads, attempts, responses, and latency, every failure becomes guesswork.</p></div>
    </div>
  </section>;
}

export function PlatformSection() {
  return <section className="unified-platform" id="platform">
    <div className="platform-heading" data-reveal><span className="section-label">One control plane</span><h2>Inbound and outbound events,<br />finally in one system.</h2><p>PayloadGrid sits between the systems producing events and the endpoints consuming them. Your application keeps one simple integration while PayloadGrid operates the delivery lifecycle.</p></div>
    <div className="platform-mode outbound-mode" data-reveal>
      <div className="mode-copy"><span className="mode-index">01 / OUTBOUND</span><i><ArrowUpFromLine size={21} /></i><h3>Ship customer-facing webhooks without building a delivery platform.</h3><p>Call one authenticated API. PayloadGrid fans the message out to subscribed endpoints, signs each request, records the response, and recovers failures.</p><ul><li><Check size={15} /> API-key authentication</li><li><Check size={15} /> Idempotent message creation</li><li><Check size={15} /> Per-customer event subscriptions</li></ul></div>
      <div className="mode-visual outbound-visual"><div className="visual-toolbar"><span>MESSAGE ROUTER</span><em><i /> LIVE</em></div><div className="message-source"><code>order.completed</code><span>1 message</span></div><div className="fanout-line"><i /><i /><i /></div><div className="fanout-targets"><article><span>AC</span><div><strong>Acme API</strong><small>200 · 184ms</small></div><em>delivered</em></article><article><span>NO</span><div><strong>Northstar</strong><small>503 · retry in 5m</small></div><em className="retry">retrying</em></article><article><span>PL</span><div><strong>Pixel Labs</strong><small>200 · 312ms</small></div><em>delivered</em></article></div></div>
    </div>
    <div className="platform-mode inbound-mode" data-reveal>
      <div className="mode-visual inbound-visual"><div className="visual-toolbar"><span>INBOUND SOURCE</span><em><i /> LISTENING</em></div><div className="provider-row"><span>Razorpay</span><span>Stripe</span><span>Shopify</span><span>Custom</span></div><div className="inbound-route"><div><ArrowDownToLine size={18} /><strong>payment.captured</strong><small>signature received</small></div><i><span /></i><div><img src="/icon.svg" alt="" /><strong>PayloadGrid gateway</strong><small>stored · routed · observed</small></div><i><span /></i><div><Route size={18} /><strong>Your handler</strong><small>HTTP 200 · 241ms</small></div></div><div className="payload-line"><code>{'{ "paymentId": "pay_8921", "amount": 9999 }'}</code><button aria-label="Copy payload"><Copy size={14} /></button></div></div>
      <div className="mode-copy"><span className="mode-index">02 / INBOUND</span><i><ArrowDownToLine size={21} /></i><h3>Put a reliable gateway in front of every provider callback.</h3><p>Give payment, commerce, and custom providers a stable PayloadGrid URL. Every callback is stored, forwarded, measured, and recoverable from the same console.</p><ul><li><Check size={15} /> Raw-body provider verification</li><li><Check size={15} /> Redacted diagnostics and payload capture</li><li><Check size={15} /> Provider-aware payment visibility</li></ul></div>
    </div>
    <div className="capability-grid" data-reveal>{capabilities.map(({ icon: Icon, title, copy }, index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><Icon size={20} /><h3>{title}</h3><p>{copy}</p></article>)}</div>
  </section>;
}