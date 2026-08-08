"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Building2, Check, Code2, Database, Fingerprint, KeyRound, LockKeyhole, Network, CircleDollarSign, ShieldCheck, TerminalSquare, Users, Workflow } from "lucide-react";

export function UseCasesSection() {
  return <section className="use-cases" id="use-cases">
    <div className="use-cases-head" data-reveal><span className="section-label">Where PayloadGrid fits</span><h2>Built for products that move events between companies.</h2><p>Use the same delivery layer whether your product publishes events to customers, depends on third-party callbacks, or needs both directions at once.</p></div>
    <div className="use-case-list">
      <article data-reveal><span className="case-number">01</span><i><Building2 size={22} /></i><div><h3>SaaS and API platforms</h3><p>Give every customer isolated applications, destinations, subscriptions, signing secrets, and delivery records.</p></div><ul><li>Customer event fan-out</li><li>Endpoint-level subscriptions</li><li>Tenant-safe operations</li></ul></article>
      <article data-reveal><span className="case-number">02</span><i><CircleDollarSign size={22} /></i><div><h3>Payments and commerce</h3><p>Receive payment and order callbacks through stable routes, then see failures before they become support issues.</p></div><ul><li>Stripe, Shopify, Razorpay, Cashfree</li><li>Payment and commerce event forwarding</li><li>Revenue-at-risk tracking</li></ul></article>
      <article data-reveal><span className="case-number">03</span><i><Workflow size={22} /></i><div><h3>Internal platform teams</h3><p>Replace duplicated retry code and delivery logs across services with one shared operational system.</p></div><ul><li>Central event catalog</li><li>Unified audit history</li><li>Reusable delivery policy</li></ul></article>
    </div>
  </section>;
}

export function SecuritySection() {
  return <section className="security-section" id="security">
    <div className="security-copy" data-reveal><span className="section-label light">Security model</span><h2>Trust needs more than a green status badge.</h2><p>PayloadGrid’s ownership model follows the data. Users enter organizations, organizations own projects, and projects own every application, endpoint, key, message, and delivery record.</p><div className="security-points"><div><Fingerprint size={18} /><span><strong>Signed payloads</strong><small>Timestamped HMAC signatures per endpoint</small></span></div><div><KeyRound size={18} /><span><strong>One-way API keys</strong><small>Only secure hashes are stored in Postgres</small></span></div><div><Users size={18} /><span><strong>Role boundaries</strong><small>Owner, admin, developer, and viewer access</small></span></div><div><Database size={18} /><span><strong>Audit evidence</strong><small>Organization changes recorded with actor and time</small></span></div></div></div>
    <div className="security-terminal" data-reveal><div className="terminal-head"><span><LockKeyhole size={15} /> SIGNATURE VERIFICATION</span><em>HMAC-SHA256</em></div><div className="terminal-request"><span>payloadgrid-id</span><code>event_01JHF8Q9</code><span>payloadgrid-timestamp</span><code>1784299737</code><span>payloadgrid-signature</span><code>v1,pxj8wC...kP2</code></div><div className="terminal-check"><ShieldCheck size={18} /><span><strong>Signature verified</strong><small>Request timestamp is inside the accepted window</small></span><Check size={17} /></div><div className="tenant-map"><span>ORGANIZATION</span><i /><span>PROJECT</span><i /><span>APPLICATION</span><i /><span>ENDPOINT</span></div></div>
  </section>;
}

const apiExamples = {
  curl: `curl -X POST /api/v1/messages \\
  -H "Authorization: Bearer pg_live_..." \\
  -H "Idempotency-Key: order_8921_completed" \\
  -H "Content-Type: application/json" \\
  -d '{
    "applicationId": "APPLICATION_UUID",
    "eventType": "order.completed",
    "payload": {
      "orderId": "8921",
      "status": "completed"
    }
  }'`,
  node: `const response = await fetch(
  "/api/v1/messages",
  {
    method: "POST",
    headers: {
      Authorization: "Bearer pg_live_...",
      "Idempotency-Key": "order_8921_completed",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      applicationId: "APPLICATION_UUID",
      eventType: "order.completed",
      payload: { orderId: "8921", status: "completed" }
    })
  }
);

const message = await response.json();`,
  python: `import requests

response = requests.post(
    "/api/v1/messages",
    headers={
        "Authorization": "Bearer pg_live_...",
        "Idempotency-Key": "order_8921_completed",
    },
    json={
        "applicationId": "APPLICATION_UUID",
        "eventType": "order.completed",
        "payload": {
            "orderId": "8921",
            "status": "completed",
        },
    },
)

message = response.json()`
} as const;

const frameworkExamples = {
  "Next.js": `await fetch(process.env.PAYLOADGRID_URL + "/api/v1/messages", {\n  method: "POST", headers: { Authorization: \`Bearer \${process.env.PAYLOADGRID_KEY}\`,\n  "Content-Type": "application/json" }, body: JSON.stringify(message)\n});`,
  Remix: `return fetch(env.PAYLOADGRID_URL + "/api/v1/messages", {\n  method: "POST", headers: { Authorization: \`Bearer \${env.PAYLOADGRID_KEY}\`,\n  "Content-Type": "application/json" }, body: JSON.stringify(message)\n});`,
  Django: `requests.post(settings.PAYLOADGRID_URL + "/api/v1/messages",\n    headers={"Authorization": f"Bearer {settings.PAYLOADGRID_KEY}"},\n    json=message, timeout=5)`,
  Laravel: `Http::withToken(config('services.payloadgrid.key'))\n    ->post(config('services.payloadgrid.url').'/api/v1/messages', $message);`,
  Go: `body, _ := json.Marshal(message)\nreq, _ := http.NewRequest("POST", payloadGridURL+"/api/v1/messages", bytes.NewReader(body))\nreq.Header.Set("Authorization", "Bearer "+payloadGridKey)\nclient.Do(req)`
} as const;

export function LocalDevelopmentSection() {
  const [framework, setFramework] = useState<keyof typeof frameworkExamples>("Next.js");
  return <><section className="local-relay" data-reveal><div><span className="section-label">Local development</span><h2>Debug production-shaped events on localhost.</h2><p>The local relay CLI is in private preview. It is designed to authenticate a terminal session, subscribe to an endpoint, and forward captured events into a local server without a permanent public tunnel.</p><span className="preview-badge">CLI · PRIVATE PREVIEW</span></div><div className="relay-terminal"><header><i /><i /><i /><span>payloadgrid relay</span></header><pre><code><em>$</em> npm i -g payloadgrid-cli{"\n"}<em>$</em> pg login{"\n"}<strong>✓ authenticated · production</strong>{"\n"}<em>$</em> pg listen --port 3000{"\n"}<strong>✓ forwarding payment.captured → localhost:3000</strong>{"\n"}<span>200 POST /webhooks · 184ms</span></code></pre></div></section><section className="framework-recipes" data-reveal><div><span className="section-label">Framework recipes</span><h2>Use the HTTP client your backend already trusts.</h2><p>No package lock-in. Start with a native request and preserve authentication, idempotency, and tenant routing across modern stacks.</p></div><div className="api-studio"><div className="studio-tabs" role="tablist" aria-label="Framework recipe">{(Object.keys(frameworkExamples) as Array<keyof typeof frameworkExamples>).map((name) => <button key={name} role="tab" aria-selected={framework === name} className={framework === name ? "active" : ""} onClick={() => setFramework(name)}>{name}</button>)}</div><pre><code>{frameworkExamples[framework]}</code></pre><div className="studio-response"><span>202 ACCEPTED</span><code>{'{ "status": "accepted", "queuedDeliveries": 3 }'}</code></div></div></section><section className="debt-proof" data-reveal><span className="section-label">Engineering debt avoided</span><h2>Skip weeks of queue plumbing. Integrate the delivery API in minutes.</h2><p>Keep Redis dead-letter queues, exponential backoff workers, signature rotation scripts, and delivery evidence out of your product backlog.</p></section></>;
}

export function DeveloperSection() {
  const [language, setLanguage] = useState<keyof typeof apiExamples>("curl");
  return <section className="developer-section" id="developers">
    <div className="developer-intro" data-reveal><span className="section-label">Developer adoption</span><h2>One API call between your product and every destination.</h2><p>PayloadGrid uses ordinary HTTPS and JSON, so any backend language can send events. Start in the console, generate a key, then move the exact same workflow into production code.</p><div className="integration-steps"><div><span>1</span><strong>Create an application</strong><small>Represent the customer or product context.</small></div><div><span>2</span><strong>Add destinations</strong><small>Choose subscriptions and copy signing secrets.</small></div><div><span>3</span><strong>Send a message</strong><small>PayloadGrid fans out and operates delivery.</small></div></div></div>
    <div className="api-studio" data-reveal><div className="studio-tabs" role="tablist" aria-label="API example language"><button role="tab" aria-selected={language === "curl"} className={language === "curl" ? "active" : ""} onClick={() => setLanguage("curl")}><TerminalSquare size={15} /> cURL</button><button role="tab" aria-selected={language === "node"} className={language === "node" ? "active" : ""} onClick={() => setLanguage("node")}>Node.js</button><button role="tab" aria-selected={language === "python"} className={language === "python" ? "active" : ""} onClick={() => setLanguage("python")}>Python</button><em>POST /api/v1/messages</em></div><pre><code>{apiExamples[language]}</code></pre><div className="studio-response"><span>202 ACCEPTED</span><code>{'{ "status": "accepted", "queuedDeliveries": 3 }'}</code></div></div>
  </section>;
}

export function FinalCta() {
  return <><section className="build-choice" data-reveal><div><span className="section-label">Build versus operate</span><h2>Keep the webhook feature.<br />Stop owning the webhook infrastructure.</h2></div><div className="choice-table"><div><span>YOUR TEAM OWNS</span><strong>Event payloads</strong><strong>Product behavior</strong><strong>Customer experience</strong></div><i><ArrowRight size={18} /></i><div><span>PAYLOADGRID OPERATES</span><strong>Routing and signatures</strong><strong>Retries and replay</strong><strong>Delivery evidence</strong></div></div></section><section className="final-cta"><div className="cta-network" aria-hidden="true"><Network size={80} /><i /><i /><i /></div><div data-reveal><span className="section-label light">Start with real events</span><h2>Send webhooks without building the infrastructure behind them.</h2><p>PayloadGrid handles delivery, signatures, retries, replay, and monitoring so your team can focus on the product.</p><Link className="button primary large" href="/signup">Start building free <ArrowRight size={18} /></Link></div></section></>;
}
