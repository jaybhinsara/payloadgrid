import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { CodeBlock, PublicPage } from "@/components/marketing/public-page";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Webhook API Documentation", description: "Integrate PayloadGrid outbound and inbound webhooks, signatures, retries, and provider verification." };
const curlExample = `curl -X POST ${SITE_URL}/api/v1/messages \\
  -H "Authorization: Bearer pg_live_YOUR_KEY" \\
  -H "Idempotency-Key: order_8921_completed" \\
  -H "Content-Type: application/json" \\
  -d '{
    "applicationId": "APPLICATION_UUID",
    "eventType": "order.completed",
    "payload": { "orderId": "8921", "status": "completed" }
  }'`;
const nodeExample = `npm install @payloadgrid/sdk

import { PayloadGrid } from "@payloadgrid/sdk";

const payloadgrid = new PayloadGrid({ apiKey: process.env.PAYLOADGRID_API_KEY });
const accepted = await payloadgrid.send({
  applicationId: process.env.PAYLOADGRID_APPLICATION_ID,
  eventType: "order.completed",
  payload: { orderId: "8921", status: "completed" }
}, { idempotencyKey: "order_8921_completed" });`;
const pythonExample = `pip install payloadgrid

from payloadgrid import PayloadGrid

client = PayloadGrid("pg_live_YOUR_KEY")
accepted = client.send(
    "APPLICATION_UUID",
    "order.completed",
    {"orderId": "8921", "status": "completed"},
    "order_8921_completed",
)`;
const batchExample = `curl -X POST ${SITE_URL}/api/v1/messages/batch \\
  -H "Authorization: Bearer pg_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "events": [
    { "applicationId": "APPLICATION_UUID", "eventType": "order.completed", "idempotencyKey": "order_8921", "payload": { "orderId": "8921" } },
    { "applicationId": "APPLICATION_UUID", "eventType": "order.completed", "idempotencyKey": "order_8922", "payload": { "orderId": "8922" } }
  ] }'`;
const relayExample = `npm install -g payloadgrid-cli
pg login --api-key pg_live_RELAY_KEY
pg listen --endpoint ENDPOINT_UUID \\
  --forward http://localhost:3000/webhooks`;

export default function DocsPage() {
  return <PublicPage eyebrow="Developer documentation" title="Integrate webhooks without guessing." intro="Start with one authenticated request, then use the same delivery records, signatures, retries, and provider routes in production.">
    <div className="docs-layout"><aside className="docs-nav"><strong>GET STARTED</strong><a href="#quickstart">Quickstart</a><a href="#model">Data model</a><a href="#outbound">Send webhooks</a><a href="#batch">Batch ingestion</a><a href="#inbound">Receive webhooks</a><a href="#relay">Local relay</a><a href="#signatures">Verify signatures</a><a href="#providers">Provider setup</a><a href="#retries">Retries</a><a href="#operations">Operational controls</a><a href="#limits">Plan limits</a><a href="#api-reference">API reference</a></aside>
      <article className="docs-content">
        <section id="quickstart"><span className="section-label">01 / Quickstart</span><h2>Send a message in four steps</h2><ol className="docs-steps"><li><span>1</span><div><strong>Create a workspace</strong><p>Sign up, then use the default production project.</p></div></li><li><span>2</span><div><strong>Create an application</strong><p>An application represents a customer, account, or product context.</p></div></li><li><span>3</span><div><strong>Add an endpoint and event subscriptions</strong><p>PayloadGrid creates a signing secret for the destination.</p></div></li><li><span>4</span><div><strong>Generate an API key and send</strong><p>The secret is shown once and stored only as a one-way hash.</p></div></li></ol><CodeBlock>{curlExample}</CodeBlock><div className="docs-response"><strong>202 Accepted</strong><code>{'{ "messageId": "…", "status": "accepted", "queuedDeliveries": 1 }'}</code></div></section>
        <section id="model"><span className="section-label">02 / Data model</span><h2>Keep customer traffic isolated</h2><div className="docs-grid"><div><strong>Organization</strong><p>Owns members, roles, projects, and audit history.</p></div><div><strong>Project</strong><p>Separates production, staging, or development resources.</p></div><div><strong>Application</strong><p>Represents the customer or account receiving events.</p></div><div><strong>Endpoint</strong><p>Stores a destination, provider configuration, subscriptions, and signing secret.</p></div><div><strong>Message</strong><p>One accepted outbound event before endpoint fan-out.</p></div><div><strong>Delivery</strong><p>One endpoint-specific lifecycle with every attempt recorded.</p></div></div></section>
        <section id="outbound"><span className="section-label">03 / Outbound</span><h2>Send from any backend</h2><p>Use a unique idempotency key for each logical event. Repeating the same key returns the existing message instead of creating another delivery.</p><h3>Node.js</h3><CodeBlock>{nodeExample}</CodeBlock><h3>Python</h3><CodeBlock>{pythonExample}</CodeBlock><div className="docs-callout"><Check size={18} /><p><strong>Accepted is not delivered.</strong> A `202` response means the message is durably recorded and queued. Final delivery appears in the dashboard and delivery API.</p></div></section>
        <section id="batch"><span className="section-label">04 / Batch API</span><h2>Accept bounded batches</h2><p>Submit up to 100 independently idempotent events in one request. Every item receives its own result. Individual payloads remain limited to 256 KB and the complete request is limited to 4 MB.</p><CodeBlock>{batchExample}</CodeBlock></section>
        <section id="inbound"><span className="section-label">05 / Inbound</span><h2>Receive provider callbacks</h2><p>Every endpoint exposes an inbound URL in the form below. Configure that URL in Razorpay, Cashfree, Stripe, Shopify, or your custom producer.</p><CodeBlock>{`${SITE_URL}/in/ENDPOINT_UUID`}</CodeBlock><p>PayloadGrid verifies configured provider signatures against the untouched request body, stores a redacted diagnostic header set, deduplicates supported provider event IDs, acknowledges the provider, and processes forwarding asynchronously.</p><h3>Accepted body formats</h3><p>Inbound routes preserve and forward the original body and content type for `application/json`, `application/x-www-form-urlencoded`, `text/xml`, `application/xml`, and `text/*`. Unknown media types are retained as raw text when they fit the plan payload limit.</p></section>
        <section id="relay"><span className="section-label">06 / Local relay</span><h2>Mirror retained events to localhost</h2><p>Create an API key with `events:read`, then poll through the CLI. The relay starts from new events by default; add `--history` to forward recently retained events.</p><CodeBlock>{relayExample}</CodeBlock></section>
        <section id="signatures"><span className="section-label">07 / Delivery signatures</span><h2>Authenticate PayloadGrid deliveries</h2><p>Signed deliveries include `payloadgrid-id`, `payloadgrid-timestamp`, and `payloadgrid-signature`. Compute HMAC-SHA256 over the exact string below, encode it as base64, and compare it in constant time.</p><CodeBlock>{'${payloadgrid-id}.${payloadgrid-timestamp}.${rawBody}'}</CodeBlock><p>Reject timestamps outside your accepted window to prevent replay attacks. During secret rotation the signature header contains signatures from both the new and previous secret for 24 hours.</p></section>
        <section id="providers"><span className="section-label">08 / Provider verification</span><h2>Use the secret from the provider dashboard</h2><div className="provider-docs"><div><strong>Razorpay</strong><p>Set a webhook secret in Razorpay and enter the same value when creating the PayloadGrid endpoint. PayloadGrid validates `X-Razorpay-Signature`.</p></div><div><strong>Cashfree</strong><p>Enter the applicable Cashfree secret. PayloadGrid validates the timestamp plus raw body against `x-webhook-signature`.</p></div><div><strong>Stripe</strong><p>Use the endpoint signing secret beginning with `whsec_`. PayloadGrid validates `Stripe-Signature` with a five-minute tolerance.</p></div><div><strong>Shopify</strong><p>Use the app client secret. PayloadGrid validates `X-Shopify-Hmac-SHA256`.</p></div></div></section>
        <section id="retries"><span className="section-label">09 / Recovery</span><h2>Retry without creating duplicates</h2><p>Failed destinations move through increasing delays of 1, 5, 30, 120, and 360 minutes. After six total unsuccessful attempts, the delivery enters the dead-letter queue. Manual replay creates another attempt on the same delivery record. The event ID and signature identity stay stable across attempts.</p></section>
        <section id="operations"><span className="section-label">10 / Operational controls</span><h2>Protect, transform, simulate, and embed</h2><div className="docs-grid"><div><strong>Transactional outbox</strong><p>Message fan-out and dispatch records commit together. Recovery schedules republish rows that never reached the queue.</p></div><div><strong>Schema mapper</strong><p>Map nested source paths such as `data.order_id` into delivery paths such as `order.id` before outbound fan-out.</p></div><div><strong>Circuit breaker</strong><p>Enable an endpoint traffic floor. An anomalous inbound minute opens the circuit and buffers new traffic until an operator resumes it.</p></div><div><strong>Replay sandbox</strong><p>Open any delivery, choose Simulate, edit a copy of the JSON and headers, and create an isolated test delivery excluded from production health.</p></div><div><strong>Embedded history</strong><p>Create a short-lived, permission-scoped application view. Read-only and replay-enabled tokens are separate capabilities.</p></div><div><strong>Encrypted headers</strong><p>Store destination authorization headers encrypted and deliver them without exposing values again in the console.</p></div><div><strong>Transient retention</strong><p>Select transient retention in Project settings to scrub message and event bodies immediately after terminal delivery.</p></div><div><strong>Standard retention</strong><p>Standard projects retain payloads for the plan diagnostic window and redact them through scheduled maintenance.</p></div></div></section>
        <section id="limits"><span className="section-label">11 / Free plan limits</span><h2>Predictable limits for every project</h2><ul className="check-list-public"><li><Check size={16} /> 10,000 accepted events per project each month</li><li><Check size={16} /> 10 endpoints per project</li><li><Check size={16} /> 300 API or inbound requests per minute</li><li><Check size={16} /> 256 KB payloads</li><li><Check size={16} /> 3-day payload retention</li><li><Check size={16} /> Live service health at /status</li></ul><Link className="text-link" href="/pricing">Read pricing <ArrowRight size={15} /></Link></section>
        <section id="api-reference"><span className="section-label">12 / API reference</span><h2>Current public endpoints</h2><div className="api-reference"><div><code>POST</code><strong>/api/v1/messages</strong><p>Accept one outbound message.</p></div><div><code>POST</code><strong>/api/v1/messages/batch</strong><p>Accept up to 100 outbound messages.</p></div><div><code>GET</code><strong>/api/v1/relay/events</strong><p>Read a project-scoped local relay feed.</p></div><div><code>POST</code><strong>/in/:endpointId</strong><p>Accept and verify an inbound provider callback.</p></div><div><code>GET</code><strong>/api/health</strong><p>Return customer-facing component health.</p></div></div><Link className="button secondary" href="/api/openapi" target="_blank">OpenAPI JSON <ExternalLink size={15} /></Link></section>
      </article>
    </div>
  </PublicPage>;
}
