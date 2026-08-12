import { SITE_URL } from "@/lib/site";

export type DocCode = { label: string; language: string; value: string };
export type DocNote = { title: string; body: string; tone?: "info" | "warning" | "success" };
export type DocSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  steps?: Array<{ title: string; body: string }>;
  code?: DocCode[];
  table?: { headers: string[]; rows: string[][] };
  note?: DocNote;
};
export type DocArticle = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  readTime: string;
  keywords: string[];
  sections: DocSection[];
};

export const DOC_GROUPS = [
  { name: "Get started", description: "Understand the model and deliver your first event." },
  { name: "Build", description: "Configure outbound, inbound, contracts, and destinations." },
  { name: "Operate", description: "Inspect, recover, replay, transform, and protect traffic." },
  { name: "Developer tools", description: "Use APIs, SDKs, the CLI, and embedded components." },
  { name: "Administration", description: "Control access, retention, health, and capacity." }
] as const;

const sendCurl = `curl -X POST ${SITE_URL}/api/v1/messages \\
  -H "Authorization: Bearer pg_live_YOUR_KEY" \\
  -H "Idempotency-Key: order_8921_completed" \\
  -H "Content-Type: application/json" \\
  -d '{
    "applicationId": "APPLICATION_UUID",
    "eventType": "order.completed",
    "payload": { "orderId": "8921", "status": "completed" }
  }'`;

export const DOC_ARTICLES: DocArticle[] = [
  {
    slug: "quickstart", category: "Get started", title: "Quickstart", readTime: "6 min",
    summary: "Create the minimum production path: application, endpoint, scoped key, accepted message, and verified delivery.",
    keywords: ["first event", "setup", "send", "202", "application", "endpoint"],
    sections: [
      { id: "before-you-start", title: "Before you start", paragraphs: ["You need a PayloadGrid account and an HTTPS destination that accepts POST requests. Use a separate workspace project for development traffic so test deliveries cannot affect production metrics."], bullets: ["Keep API keys on your server, never in browser code.", "Use one application for each customer or product context that requires isolated endpoints.", "Use an idempotency key for every logical outbound event."] },
      { id: "dashboard-setup", title: "Create the delivery path", steps: [
        { title: "Create an application", body: "Open Applications and create the customer, account, or product context that owns the destination." },
        { title: "Add an endpoint", body: "Open Endpoints, select the application, enter an HTTPS destination, and choose subscribed event types. Store the signing secret when it is shown." },
        { title: "Generate a scoped key", body: "Open API keys and create a key with messages:write. The complete key is shown once." },
        { title: "Send a message", body: "Call the public API from your backend. PayloadGrid records the message and creates one delivery per matching endpoint." }
      ], code: [{ label: "cURL", language: "bash", value: sendCurl }] },
      { id: "read-the-result", title: "Read the result correctly", paragraphs: ["A 202 response means PayloadGrid durably accepted the message for asynchronous processing. It does not mean the customer endpoint has responded successfully. Use Messages for acceptance and Deliveries for endpoint-level outcomes."], table: { headers: ["Signal", "Meaning", "Next check"], rows: [["202 Accepted", "Message and fan-out intent recorded", "Open Messages"], ["queued / processing", "Destination work is active", "Open Deliveries"], ["delivered", "Destination returned a successful response", "Inspect the final attempt"], ["retrying", "A later attempt is scheduled", "Review response and next retry"], ["dead_letter", "Automatic recovery ended", "Replay, simulate, or resolve"]] }, note: { tone: "success", title: "Production path complete", body: "Verify one signed request at your destination before increasing traffic." } }
    ]
  },
  {
    slug: "core-concepts", category: "Get started", title: "Core concepts", readTime: "7 min",
    summary: "Learn how workspaces, projects, applications, messages, deliveries, and attempts fit together.",
    keywords: ["data model", "tenant", "workspace", "project", "application", "message", "delivery"],
    sections: [
      { id: "ownership", title: "Ownership hierarchy", table: { headers: ["Resource", "Purpose", "Isolation boundary"], rows: [["Workspace", "Organization, members, roles, and audit history", "Organization"], ["Project", "Production, staging, or development resources", "Project"], ["Application", "Customer, account, or product context", "Application"], ["Endpoint", "Destination, subscriptions, credentials, and signing secret", "Project and application"]] } },
      { id: "event-model", title: "Message, delivery, and attempt", paragraphs: ["One outbound API request creates one message. PayloadGrid fans that message out into one delivery for each active endpoint whose application and subscriptions match. Every network request for that delivery is an attempt."], bullets: ["Message answers: did PayloadGrid accept the producer event?", "Delivery answers: what happened for one destination?", "Attempt answers: what exact request and response occurred at one point in time?"] },
      { id: "inbound-model", title: "Inbound uses the same evidence model", paragraphs: ["Provider callbacks enter through an endpoint inbound URL. PayloadGrid verifies and records the original request, then forwards it asynchronously. Inbound and outbound deliveries therefore share inspection, retry, replay, simulation, alerting, and audit workflows."], note: { title: "Scope every integration", body: "API and dashboard operations are project scoped. Switching workspaces or projects changes the data visible in every dashboard view." } }
    ]
  },
  {
    slug: "dashboard", category: "Get started", title: "Dashboard guide", readTime: "14 min",
    summary: "A complete map of every PayloadGrid dashboard view, its controls, and the operational question it answers.",
    keywords: ["overview", "dashboard", "applications", "endpoints", "messages", "deliveries", "usage", "automations"],
    sections: [
      { id: "navigation", title: "Workspace and project context", paragraphs: ["The workspace switcher changes the organization boundary. The active project appears in the top bar and controls which applications, endpoints, messages, deliveries, API keys, and automations are queried."], bullets: ["Use Workspace to create and switch environment projects.", "Check the environment badge before sending, replaying, or deleting.", "The refresh button updates live metrics without replacing the page with a loading screen."] },
      { id: "workspace-views", title: "Workspace views", table: { headers: ["View", "Use it for", "Primary actions"], rows: [["Overview", "Current delivery health and onboarding", "Send event, inspect recent delivery"], ["Applications", "Customer or product contexts", "Create application, issue embed access"], ["Endpoints", "Inbound URLs and outbound destinations", "Create, test, pause, configure, rotate"], ["Messages", "Producer-level outbound acceptance", "Send a test event, inspect message status"], ["Deliveries", "Endpoint-level operations", "Search, inspect, replay, cancel, simulate"], ["Event types", "Versioned payload contracts", "Publish schema version, open generated catalog"]] } },
      { id: "management-views", title: "Management views", table: { headers: ["View", "Use it for", "Access"], rows: [["Workspace", "Projects, names, ownership, deletion", "Owner and admin actions"], ["System health", "Private queue, database, and delivery diagnostics", "Owner or admin"], ["API keys", "Server credentials and scopes", "Authorized workspace roles"], ["Team", "Invitations, roles, removal", "Owner and admin"], ["Usage", "Monthly accepted events and plan capacity", "Workspace members"], ["Automations", "Transformations, alerts, and circuit protection", "Role dependent"]] } },
      { id: "delivery-drawer", title: "The delivery drawer", paragraphs: ["Open any delivery to see its immutable identity, provider, direction, payload, captured headers, contract warnings, and complete attempt timeline. Operational actions are state aware: retrying events can be cancelled, terminal events can be replayed, any retained payload can be simulated, and unresolved dead letters can be resolved with a note."], note: { tone: "warning", title: "Simulation is separate", body: "A simulation creates a test delivery excluded from production health metrics. Replay continues the production delivery history." } }
    ]
  },
  {
    slug: "outbound-webhooks", category: "Build", title: "Send outbound webhooks", readTime: "10 min",
    summary: "Accept producer events, fan them out asynchronously, deduplicate requests, and track final delivery.",
    keywords: ["outbound", "send", "message API", "idempotency", "fan-out", "batch"],
    sections: [
      { id: "flow", title: "Outbound flow", steps: [{ title: "Accept", body: "The API authenticates the key, validates limits, and records the message." }, { title: "Fan out", body: "Subscriptions select active endpoints in the same application." }, { title: "Dispatch", body: "Transactional outbox rows are handed to the durable queue." }, { title: "Deliver", body: "PayloadGrid signs each request and records every attempt." }], code: [{ label: "Create a message", language: "bash", value: sendCurl }] },
      { id: "idempotency", title: "Prevent duplicate producer requests", paragraphs: ["Send Idempotency-Key as a header or idempotencyKey in the JSON body. Reusing the same key in one project returns the existing message instead of creating another fan-out."], note: { title: "Choose stable keys", body: "Use a business operation identifier such as order_8921_completed, not a random value generated on every retry." } },
      { id: "batch", title: "Bounded batch ingestion", paragraphs: ["POST /api/v1/messages/batch accepts up to 100 independently idempotent events and a complete request size of 4 MB. Each item returns its own result, so one duplicate or invalid item does not hide the outcome of the others."], bullets: ["Use batch ingestion to reduce producer network overhead.", "Do not use a batch as an ordering guarantee.", "Inspect per-item results before discarding producer state."] }
    ]
  },
  {
    slug: "inbound-webhooks", category: "Build", title: "Receive inbound webhooks", readTime: "11 min",
    summary: "Verify third-party callbacks, preserve non-JSON bodies, deduplicate provider events, and forward asynchronously.",
    keywords: ["inbound", "provider", "Razorpay", "Stripe", "Cashfree", "Shopify", "XML", "form"],
    sections: [
      { id: "configure", title: "Configure a provider callback", steps: [{ title: "Create an endpoint", body: "Choose the provider and enter the same verification secret configured in the provider dashboard." }, { title: "Copy the inbound URL", body: `Use ${SITE_URL}/in/ENDPOINT_UUID in the provider's webhook settings.` }, { title: "Select subscriptions", body: "Limit forwarding to event types needed by the application." }, { title: "Send a provider test", body: "Confirm verification and inspect the recorded request before enabling production traffic." }] },
      { id: "verification", title: "Signature verification", table: { headers: ["Provider", "Header", "Verification input"], rows: [["Razorpay", "X-Razorpay-Signature", "Untouched raw body"], ["Cashfree", "x-webhook-signature", "Timestamp plus raw body"], ["Stripe", "Stripe-Signature", "Timestamped signed payload"], ["Shopify", "X-Shopify-Hmac-SHA256", "Untouched raw body"], ["Custom", "Provider-defined", "No provider verification unless configured"]] } },
      { id: "content-types", title: "Preserved request formats", paragraphs: ["PayloadGrid does not force every inbound callback into JSON. It preserves the original body and content type for JSON, form-encoded data, XML, and text payloads, then forwards the same representation."], bullets: ["application/json", "application/x-www-form-urlencoded", "text/xml and application/xml", "text/* and bounded unknown text formats"] },
      { id: "acknowledgement", title: "Acknowledge before destination recovery", paragraphs: ["After verification and durable recording, provider acknowledgement is separate from downstream forwarding. A temporary customer destination failure therefore moves through PayloadGrid retries without requiring the provider to resend the callback."], note: { tone: "warning", title: "Verification failures are rejected", body: "A bad provider signature is not stored as trusted traffic and is never forwarded." } }
    ]
  },
  {
    slug: "applications-endpoints", category: "Build", title: "Applications and endpoints", readTime: "9 min",
    summary: "Model customers, configure destinations, subscribe event types, and rotate credentials safely.",
    keywords: ["application", "endpoint", "subscription", "secret", "headers", "pause"],
    sections: [
      { id: "applications", title: "Choose application boundaries", paragraphs: ["An application is the customer-facing isolation unit inside a project. Endpoints, contracts, catalogs, and embedded portal sessions bind to one application."], bullets: ["Use one application per SaaS customer when customers manage their own endpoints.", "Use separate applications for products with independent contracts.", "Do not use applications as production and staging environments; use projects for that."] },
      { id: "endpoint-settings", title: "Endpoint settings", table: { headers: ["Setting", "Behavior"], rows: [["Destination URL", "HTTPS target for forwarded or outbound delivery"], ["Provider", "Selects inbound signature verification adapter"], ["Subscriptions", "Empty receives all event types; otherwise exact matches only"], ["Revenue tracking", "Optional inbound amount extraction; disabled, automatic provider detection, or custom JSON paths"], ["Delivery headers", "Encrypted authorization or routing headers added at send time"], ["Signing secret", "Signs every PayloadGrid delivery"], ["Rate limit", "Controls destination throughput"], ["Active state", "Paused endpoints do not receive new attempts"]] } },
      { id: "revenue-tracking", title: "Optional revenue-at-risk tracking", paragraphs: ["Revenue tracking is disabled by default and is unnecessary for authentication, logistics, CRM, deployment, messaging, and other non-payment events. Enable it only on endpoints carrying monetary payloads."], bullets: ["Automatic mode recognizes supported provider payloads and common custom fields.", "Custom mode accepts dot-notation amount and currency paths.", "Choose major units when 99.99 means 99.99; choose minor units when 9999 means 99.99.", "A fixed ISO currency can replace a missing payload currency or act as an automatic-mode fallback.", "PayloadGrid groups risk by ISO currency and does not perform exchange-rate conversion."], note: { title: "Symbols are display aids", body: "The dashboard shows choices such as $ USD, € EUR, £ GBP, and ₹ INR. PayloadGrid stores the ISO code because symbols such as $ are shared by multiple currencies." } },
      { id: "rotation", title: "Rotate without downtime", paragraphs: ["When a signing secret rotates, PayloadGrid retains the previous secret for 24 hours and emits both signatures. Update the consumer during that overlap, verify new signatures, and then allow the old secret to expire."], note: { tone: "success", title: "Test before production", body: "Use the endpoint Test action after changing URLs, subscriptions, or authorization headers." } }
    ]
  },
  {
    slug: "event-contracts", category: "Build", title: "Versioned event contracts", readTime: "12 min",
    summary: "Publish JSON Schema 2020-12 contracts, check compatibility, warn on invalid payloads, and generate application catalogs.",
    keywords: ["JSON Schema", "contract", "version", "compatibility", "catalog", "validation"],
    sections: [
      { id: "publish", title: "Publish a contract version", paragraphs: ["Open Event types, select an application, name the event, and provide a standard JSON Schema plus an example payload. Use Manage versions on an existing contract to inspect history, preview compatibility, and publish its next immutable version. Examples must satisfy the schema before a version can be published."], code: [{ label: "JSON Schema 2020-12", language: "json", value: `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "orderId": { "type": "string" },
    "total": { "type": "number", "minimum": 0 }
  },
  "required": ["orderId", "total"]
}` }] },
      { id: "compatibility", title: "Compatibility checks", paragraphs: ["Backward compatibility warnings identify removed accepted values, narrowed types and enums, newly required fields, stricter numeric or length constraints, changed formats, and stricter additional-property rules. Preview the next version before publishing; a warned version can still be published after explicit confirmation."], note: { title: "Validation never blocks delivery", body: "Payloads that do not match the current contract are still delivered. PayloadGrid records the contract version and validation warnings as operational evidence." } },
      { id: "catalog", title: "Generated event documentation", paragraphs: ["Every application has a hosted catalog at /catalog/APPLICATION_UID. Visitors can search events, select any published contract version, download its JSON Schema, and copy accurate cURL, TypeScript, or Python examples."], bullets: ["The version changelog displays recorded compatibility warnings.", "Authorized project members can edit an example and send a signed simulation without affecting production health metrics or alerts.", "Descriptions should explain when the event fires.", "Examples should resemble real payloads but contain no customer data.", "Publish contract updates in the same change as producer code."] }
    ]
  },
  {
    slug: "delivery-lifecycle", category: "Operate", title: "Delivery lifecycle", readTime: "9 min",
    summary: "Understand every delivery state, permitted transition, and action available to an operator.",
    keywords: ["status", "queued", "retrying", "dead letter", "cancelled", "delivered"],
    sections: [
      { id: "states", title: "State reference", table: { headers: ["State", "Meaning", "Operator action"], rows: [["received", "Inbound event recorded", "Wait or inspect"], ["buffered", "Circuit breaker is holding traffic", "Resume protected route"], ["queued", "Dispatch work exists", "Wait or cancel"], ["processing", "A worker has claimed the event", "Inspect after completion"], ["retrying", "Previous attempt failed and another is due", "Wait or cancel"], ["delivered", "Destination succeeded", "Replay or simulate"], ["dead_letter", "Automatic attempts ended", "Replay, simulate, resolve"], ["cancelled", "Future attempts are disabled", "Replay if needed"], ["resolved", "Dead letter acknowledged manually", "Review retained evidence"]] } },
      { id: "identity", title: "Stable delivery identity", paragraphs: ["Retries and manual replay preserve the event identity and append attempts. Simulations create a separate child event so experiments cannot rewrite production evidence."], bullets: ["Attempt number increases for every destination request.", "Response status, latency, safe response headers, body excerpt, and error are retained per attempt.", "Message status is derived from all endpoint deliveries created by that message."] }
    ]
  },
  {
    slug: "search-inspection", category: "Operate", title: "Search and inspect deliveries", readTime: "10 min",
    summary: "Find exact delivery sets using operational, header, and payload filters, then inspect complete request and response evidence.",
    keywords: ["search", "filter", "payload path", "header", "attempt", "inspect"],
    sections: [
      { id: "filters", title: "Structured filters", table: { headers: ["Filter", "Example", "Use"], rows: [["Status", "retrying", "Find active recovery work"], ["Direction", "outbound", "Separate producer sends from provider callbacks"], ["Endpoint", "Billing processor", "Limit one destination"], ["Event type", "invoice.paid", "Limit one contract"], ["Header", "x-request-id", "Trace an upstream request"], ["Payload path", "data.order.id", "Locate a nested JSON field"], ["Payload value", "ord_8921", "Match exact scalar text"]] } },
      { id: "inspection", title: "Inspect one delivery", paragraphs: ["The drawer combines context that usually requires multiple systems: event identity, raw payload, captured headers, contract version and warnings, attempt chronology, destination responses, and recovery controls."], bullets: ["Copy request or response evidence before redaction expires.", "Use the attempt timeline to distinguish connection errors from HTTP failures.", "Check direction and simulation state before interpreting health metrics."] },
      { id: "scale", title: "Use cursor pagination", paragraphs: ["Delivery results use a received-time and event-ID cursor rather than page offsets. This keeps navigation stable while new events arrive and avoids increasingly expensive database offsets."], note: { title: "Payload search requires retained content", body: "After standard retention expires or transient retention scrubs a terminal event, metadata remains searchable but raw payload fields are no longer available." } }
    ]
  },
  {
    slug: "retries-dead-letter", category: "Operate", title: "Retries and dead-letter recovery", readTime: "11 min",
    summary: "Interpret retry schedules, recover terminal failures, and preserve evidence when no technical replay is appropriate.",
    keywords: ["retry", "backoff", "DLQ", "dead letter", "resolve", "archive"],
    sections: [
      { id: "automatic-recovery", title: "Automatic recovery", paragraphs: ["A non-successful destination response moves the event to retrying while attempts remain. Backoff intervals increase through 1, 5, 30, 120, 360, and 720 minutes, truncated by the event's configured maximum attempts."], bullets: ["The next retry time is stored on the event.", "The durable queue callback is safe to receive more than once because the worker claims only eligible states.", "Successful recovery clears revenue at risk and closes active delivery work."] },
      { id: "dead-letter", title: "After automatic retries end", steps: [{ title: "Inspect", body: "Read every attempt and confirm whether the destination, payload, or credentials caused the failure." }, { title: "Simulate", body: "Edit a copy and test a proposed fix without changing production metrics." }, { title: "Replay", body: "Use the original event when the destination is ready." }, { title: "Resolve", body: "If replay is inappropriate, add a note and remove the item from the active dead-letter queue while retaining history." }] },
      { id: "resolution", title: "Resolution is not deletion", paragraphs: ["Resolve and archive records the operator, time, and optional note. Payload and attempts remain available according to project retention. Use it for accepted duplicates, retired destinations, or work completed outside PayloadGrid."], note: { tone: "warning", title: "Do not resolve an unexplained failure", body: "Resolution changes operational queues, not the destination outcome. Add enough evidence for another operator to understand the decision." } }
    ]
  },
  {
    slug: "bulk-operations", category: "Operate", title: "Controlled bulk operations", readTime: "9 min",
    summary: "Replay terminal delivery sets at a safe rate or cancel thousands of pending retries using the same structured filters.",
    keywords: ["bulk replay", "bulk cancel", "rate", "dedupe", "progress"],
    sections: [
      { id: "bulk-replay", title: "Controlled replay", paragraphs: ["Filter terminal deliveries, choose a maximum and rate per minute, then start replay. PayloadGrid deduplicates provider event identities, creates a tracked replay batch, schedules work over time, and reports delivered, failed, and pending counts."], bullets: ["Maximum 500 deliveries per replay operation.", "Select rows for a precise set or replay the current structured filters.", "Cancel a running batch to stop work that has not started."] },
      { id: "bulk-cancel", title: "Cancel pending recovery", paragraphs: ["Filter Status to queued, received, or retrying. Optionally choose outbound direction, endpoint, type, headers, or payload values, then select Cancel matching."], bullets: ["Maximum 5,000 cancellations per action to bound database locks.", "Run the action again if the safety limit is reached.", "Queue callbacks already in transit become no-ops because cancelled events cannot be claimed.", "Processing requests are not falsely cancelled because they may already be on the network."] },
      { id: "safety", title: "Operational checklist", steps: [{ title: "Preview the filter", body: "Confirm the visible result set and active project." }, { title: "Set a destination-safe rate", body: "Use a lower rate after an outage to prevent another overload." }, { title: "Watch progress", body: "Keep the batch status visible until pending reaches zero." }, { title: "Inspect failures", body: "Do not repeatedly replay a deterministic 4xx response without changing the cause." }] }
    ]
  },
  {
    slug: "simulation", category: "Operate", title: "Replay sandbox simulations", readTime: "7 min",
    summary: "Duplicate a retained event, edit payload and headers, and test a destination without contaminating production metrics.",
    keywords: ["simulate", "sandbox", "edit payload", "test delivery"],
    sections: [
      { id: "when", title: "When to simulate", bullets: ["Confirm a destination fix before replaying the original.", "Test how a consumer handles a missing or changed field.", "Reproduce a provider payload without creating a real payment or order.", "Validate replacement authorization headers."] },
      { id: "workflow", title: "Run a simulation", steps: [{ title: "Open a delivery", body: "Select the eye icon in Deliveries." }, { title: "Choose Simulate", body: "PayloadGrid opens editable copies of retained JSON and request headers." }, { title: "Edit and run", body: "The destination receives a separate signed test delivery." }, { title: "Inspect the child event", body: "Compare response status, latency, and body without changing the parent event." }], note: { tone: "success", title: "Metrics stay clean", body: "Simulation events are excluded from production delivery health, incident counts, and revenue-at-risk calculations." } }
    ]
  },
  {
    slug: "automations", category: "Operate", title: "Transformations and alerts", readTime: "10 min",
    summary: "Normalize payloads before delivery and notify operators when endpoint failures cross a defined threshold.",
    keywords: ["automation", "transformation", "mapping", "alert", "Slack", "webhook"],
    sections: [
      { id: "transform", title: "Visual schema mapping", paragraphs: ["Transformations run before outbound fan-out. Map nested source fields to destination fields, add constant values, and remove fields that should not leave the control plane."], code: [{ label: "Mapping example", language: "text", value: `data.order_id  -> order.id
data.total     -> order.amount
+ provider     = "shopify"
- internal_note` }], note: { title: "Keep contracts aligned", body: "Publish the post-transformation payload shape as the event contract consumed by destinations." } },
      { id: "alerts", title: "Failure alerts", paragraphs: ["Alert rules define a failure threshold and time window, then notify email, Slack, or a custom webhook destination. Notification history records response state and errors."], steps: [{ title: "Choose the signal", body: "Select a threshold that indicates sustained impact rather than one transient failure." }, { title: "Test the destination", body: "Send a test before relying on the rule." }, { title: "Review history", body: "Confirm whether PayloadGrid delivered the alert and how the notification endpoint responded." }] }
    ]
  },
  {
    slug: "circuit-breakers", category: "Operate", title: "Anomaly circuit breakers", readTime: "8 min",
    summary: "Buffer anomalous inbound traffic before a spike overwhelms a downstream service.",
    keywords: ["circuit breaker", "spike", "buffer", "traffic protection", "anomaly"],
    sections: [
      { id: "behavior", title: "How protection works", paragraphs: ["Each endpoint can define a per-minute spike floor and enable automatic buffering. PayloadGrid compares inbound traffic with both that floor and the route's recent deviation. When protection opens, new work moves to buffered instead of immediately reaching the destination."], bullets: ["The endpoint remains visible and auditable.", "Buffered events retain their original event identity.", "An operator must resume the route after checking the cause."] },
      { id: "configure", title: "Choose a threshold", paragraphs: ["Start above expected peak traffic, not average traffic. A threshold that is too low creates avoidable pauses; one far above infrastructure capacity offers no protection."], note: { tone: "warning", title: "This is not a billing limit", body: "Circuit protection controls delivery pressure. Plan request limits and endpoint rate limits are separate controls." } }
    ]
  },
  {
    slug: "api-keys", category: "Developer tools", title: "API keys and scopes", readTime: "8 min",
    summary: "Create least-privilege server credentials, store them safely, rotate access, and understand every scope.",
    keywords: ["API key", "scope", "authentication", "secret", "revoke"],
    sections: [
      { id: "scopes", title: "Available scopes", table: { headers: ["Scope", "Allows", "Typical service"], rows: [["messages:write", "Single and batch outbound message ingestion", "Production backend"], ["events:read", "Relay polling, inspection, and contract reads", "Developer CLI"], ["embeds:write", "Short-lived application portal sessions", "Customer-facing backend"]] } },
      { id: "storage", title: "Secret handling", paragraphs: ["PayloadGrid displays a key once and stores only its one-way hash and prefix. Put the complete key in your deployment environment or secret manager."], bullets: ["Never commit pg_live_ values.", "Never send a server API key to a browser.", "Create separate keys for services and environments.", "Revoke a key immediately when ownership or exposure changes."] },
      { id: "auth", title: "Authenticate requests", code: [{ label: "Bearer authentication", language: "http", value: `Authorization: Bearer pg_live_YOUR_KEY` }], note: { title: "Scope failures", body: "A valid key without the required scope receives an authorization error. Add a dedicated key rather than broadening unrelated production credentials." } }
    ]
  },
  {
    slug: "sdks-api", category: "Developer tools", title: "SDKs and API reference", readTime: "12 min",
    summary: "Integrate with TypeScript, Python, raw HTTP, batch ingestion, signature verification, and the OpenAPI contract.",
    keywords: ["TypeScript", "Python", "SDK", "API", "OpenAPI", "install"],
    sections: [
      { id: "typescript", title: "TypeScript SDK", code: [{ label: "Install", language: "bash", value: `npm install @payloadgrid/sdk` }, { label: "Send", language: "typescript", value: `import { PayloadGrid } from "@payloadgrid/sdk";

const client = new PayloadGrid({ apiKey: process.env.PAYLOADGRID_API_KEY });
await client.send({
  applicationId: process.env.PAYLOADGRID_APPLICATION_ID,
  eventType: "order.completed",
  payload: { orderId: "8921" }
}, { idempotencyKey: "order_8921_completed" });` }] },
      { id: "python", title: "Python SDK", code: [{ label: "Install", language: "bash", value: `pip install payloadgrid` }, { label: "Send", language: "python", value: `from payloadgrid import PayloadGrid

client = PayloadGrid("pg_live_YOUR_KEY")
client.send(
    "APPLICATION_UUID",
    "order.completed",
    {"orderId": "8921"},
    "order_8921_completed",
)` }] },
      { id: "references", title: "Machine-readable reference", paragraphs: ["The current OpenAPI 3.1 document is available at /api/openapi. It documents public server APIs, authentication, accepted message semantics, batch limits, relay filters, contracts, embed tokens, inbound callbacks, and health."], bullets: ["Use the OpenAPI document for client generation and contract tests.", "Treat dashboard-only operational routes as private implementation APIs.", "Pin SDK versions in production and review release notes before upgrades."] }
    ]
  },
  {
    slug: "cli-local-development", category: "Developer tools", title: "CLI and local development", readTime: "10 min",
    summary: "Authenticate locally, forward retained traffic, tail live events, inspect payloads, and generate language types.",
    keywords: ["CLI", "localhost", "relay", "tail", "inspect", "types"],
    sections: [
      { id: "install", title: "Install and authenticate", code: [{ label: "Terminal", language: "bash", value: `npm install -g payloadgrid-cli
pg login --api-key pg_live_RELAY_KEY` }], note: { title: "Use a restricted key", body: "Create a dedicated events:read key. The CLI stores credentials in the current user's PayloadGrid config directory." } },
      { id: "commands", title: "Command reference", table: { headers: ["Command", "Purpose"], rows: [["pg listen", "Poll one endpoint and forward retained traffic to localhost"], ["pg tail", "Print filtered live or historical events without forwarding"], ["pg inspect", "Fetch one retained event and its details"], ["pg types", "Generate TypeScript or Python types from current contracts"]] }, code: [{ label: "Examples", language: "bash", value: `pg listen --endpoint ENDPOINT_UUID --forward http://localhost:3000/webhooks
pg tail --endpoint ENDPOINT_UUID --event-type payment.captured --history
pg inspect --endpoint ENDPOINT_UUID --event-id EVENT_UUID
pg types --application APPLICATION_UUID --language typescript --out events.ts` }] },
      { id: "workflow", title: "Debug with production-shaped traffic", paragraphs: ["The relay reads traffic already retained by PayloadGrid and forwards it to your local server. This avoids exposing a permanent public tunnel and lets multiple developers inspect the same source history independently."], bullets: ["Use --history when you need retained events before the command started.", "Filter by event type or direction to reduce noise.", "Redacted payloads cannot be forwarded after retention removes their body."] }
    ]
  },
  {
    slug: "embedded-portal", category: "Developer tools", title: "Embedded customer portal", readTime: "12 min",
    summary: "Let customers inspect deliveries and manage endpoints inside your product using short-lived, permission-scoped React components.",
    keywords: ["React", "embed", "portal", "endpoint manager", "customer", "iframe"],
    sections: [
      { id: "token", title: "Issue access from your server", paragraphs: ["Create an API key with embeds:write. Your backend exchanges that key for a signed URL bound to one project application and an explicit permission list."], code: [{ label: "Create embed session", language: "typescript", value: `const response = await fetch("${SITE_URL}/api/v1/embed-token", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.PAYLOADGRID_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    applicationId: customer.payloadgridApplicationId,
    permissions: ["deliveries:read", "endpoints:read", "subscriptions:write"],
    expiresInMinutes: 30
  })
});` }] },
      { id: "react", title: "Render a scoped component", code: [{ label: "React", language: "tsx", value: `import { PayloadGridPortal } from "@payloadgrid/react";

<PayloadGridPortal url={signedEmbedUrl} />` }] },
      { id: "permissions", title: "Permission model", table: { headers: ["Permission", "Capability"], rows: [["deliveries:read", "View application delivery history"], ["deliveries:replay", "Replay eligible deliveries"], ["endpoints:read", "List application endpoints"], ["endpoints:write", "Create endpoints"], ["subscriptions:write", "Change event subscriptions"], ["secrets:rotate", "Rotate signing secrets with overlap"]] }, note: { tone: "warning", title: "Never trust a browser application ID", body: "Resolve the customer to its PayloadGrid application on your server, then issue the token. Do not accept an arbitrary application ID from client input." } }
    ]
  },
  {
    slug: "workspaces-team", category: "Administration", title: "Workspaces, projects, and team access", readTime: "10 min",
    summary: "Separate environments, switch safely, invite teammates, assign roles, and transfer workspace ownership.",
    keywords: ["workspace", "project", "team", "role", "owner", "invite"],
    sections: [
      { id: "environments", title: "Projects are environment boundaries", paragraphs: ["A workspace can contain production, staging, and development projects. Each project has isolated applications, endpoints, deliveries, keys, automations, usage, and payload-retention mode."], note: { title: "Always check the top bar", body: "A project switch changes every dashboard query. Data that appears missing is often stored in another workspace or project." } },
      { id: "roles", title: "Role reference", table: { headers: ["Role", "Typical responsibility", "Administrative power"], rows: [["Owner", "Workspace accountability", "Full access, ownership transfer, deletion"], ["Admin", "Operations and team administration", "Manage most workspace resources"], ["Developer", "Integration and delivery operation", "Build and recover within allowed routes"], ["Viewer", "Read-only support or audit", "No secret or mutation access"]] } },
      { id: "ownership", title: "Ownership safety", paragraphs: ["Ownership can transfer only to an eligible existing member. Owners cannot remove their protected membership accidentally, and users cannot leave their only workspace without first joining or creating another."], bullets: ["Review the new owner's email and role before transfer.", "Keep at least two trusted administrators for operational continuity.", "Use audit history to confirm membership and ownership changes."] }
    ]
  },
  {
    slug: "security-signatures", category: "Administration", title: "Security and signature verification", readTime: "13 min",
    summary: "Verify signed deliveries, protect secrets, understand encrypted headers, and configure provider authentication.",
    keywords: ["security", "HMAC", "signature", "rotation", "encryption", "SSRF"],
    sections: [
      { id: "delivery-signatures", title: "Verify every PayloadGrid delivery", paragraphs: ["PayloadGrid sends payloadgrid-id, payloadgrid-timestamp, and payloadgrid-signature. Compute HMAC-SHA256 over the exact delivery ID, timestamp, and raw body joined by periods, then compare in constant time."], code: [{ label: "Signed content", language: "text", value: `${"${payloadgrid-id}"}.${"${payloadgrid-timestamp}"}.${"${rawBody}"}` }], bullets: ["Read the raw body before JSON parsing.", "Reject timestamps outside your accepted replay window.", "Accept either v1 signature during the 24-hour rotation overlap."] },
      { id: "stored-secrets", title: "Stored secret boundaries", table: { headers: ["Secret", "Storage behavior"], rows: [["API key", "One-way hash; full value shown once"], ["Provider verification secret", "Encrypted at rest; hint only in dashboard"], ["Destination authorization headers", "Encrypted at rest; names remain visible"], ["Signing secret", "Available to authorized operators and rotation workflow"]] } },
      { id: "destination-safety", title: "Destination validation", paragraphs: ["PayloadGrid validates destination URLs before creation and again before delivery to reduce server-side request forgery risk. Production destinations should use HTTPS and must not target private infrastructure addresses through untrusted customer input."], note: { tone: "warning", title: "Platform controls do not replace consumer verification", body: "Every destination must verify PayloadGrid signatures and enforce its own authorization and idempotency." } }
    ]
  },
  {
    slug: "health-usage", category: "Administration", title: "System health, usage, and audit history", readTime: "10 min",
    summary: "Separate public platform status from private project diagnostics, capacity metrics, and security history.",
    keywords: ["health", "status", "usage", "audit", "monitoring", "incident"],
    sections: [
      { id: "health-layers", title: "Two health layers", table: { headers: ["View", "Audience", "Shows"], rows: [["/status", "Customers and public visitors", "Customer-facing component state and incidents"], ["Dashboard System health", "Workspace owners and admins", "Project queue, database, delivery, and private diagnostics"]] } },
      { id: "overview-metrics", title: "Interpret overview metrics", bullets: ["Delivery rate measures terminal success, not API acceptance.", "Pending queue combines work still waiting or processing.", "Retrying counts scheduled recovery.", "Dead letter counts unresolved terminal failures.", "Average latency uses the latest attempt for project events.", "Revenue at risk is shown as Not enabled until at least one endpoint opts in; enabled endpoints contribute unresolved non-delivered events with recognized amount and currency metadata."] },
      { id: "usage", title: "Plan capacity", paragraphs: ["Usage tracks accepted outbound messages plus inbound events for the active project and current month. It is separate from internal queue consumption and storage usage."], note: { title: "Audit evidence", body: "Security history records organization-scoped mutations with actor, resource, metadata, and time. Use its 25, 50, 75, or 100 row controls for bounded review." } }
    ]
  },
  {
    slug: "retention-limits", category: "Administration", title: "Payload retention and platform limits", readTime: "9 min",
    summary: "Choose standard or transient payload handling and understand the boundaries enforced by the current plan.",
    keywords: ["retention", "redaction", "limit", "quota", "payload", "free plan"],
    sections: [
      { id: "retention", title: "Retention modes", table: { headers: ["Mode", "Payload behavior", "Use when"], rows: [["Standard", "Payload remains for the plan diagnostic window, then maintenance redacts it", "Operators need short-term inspection and replay"], ["Transient", "Terminal event and message bodies are scrubbed immediately", "Minimize stored customer content"]] } },
      { id: "limits", title: "Current free-plan boundaries", table: { headers: ["Resource", "Limit"], rows: [["Accepted events", "10,000 per project per month"], ["Endpoints", "10 per project"], ["Team members", "5 per workspace"], ["API requests", "300 per minute"], ["Inbound requests", "300 per endpoint per minute"], ["Payload", "256 KB per event"], ["Batch API", "100 events and 4 MB per request"], ["Standard payload retention", "3 days"]] } },
      { id: "metadata", title: "What remains after redaction", paragraphs: ["Operational metadata, status, attempt timing, response status, IDs, and audit evidence can remain after payload content is scrubbed. Payload-field search, simulation, and replay that require the original body are no longer possible once content is redacted."], note: { tone: "warning", title: "Retention is not regional residency", body: "Retention controls how long content remains. Regional data residency requires independent regional deployments and databases." } }
    ]
  }
];

export const DOC_SEARCH_INDEX = DOC_ARTICLES.map((article) => ({
  slug: article.slug,
  category: article.category,
  title: article.title,
  summary: article.summary,
  terms: [article.title, article.summary, ...article.keywords, ...article.sections.map((section) => section.title)].join(" ").toLowerCase()
}));

export function getDoc(slug: string) { return DOC_ARTICLES.find((article) => article.slug === slug); }
export function docsInGroup(group: string) { return DOC_ARTICLES.filter((article) => article.category === group); }
