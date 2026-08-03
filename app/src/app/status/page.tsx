import type { Metadata } from "next";
import { CheckCircle2, Gauge, LayoutDashboard, RotateCcw, Send, Server, TriangleAlert, Webhook, XCircle } from "lucide-react";
import { PublicPage } from "@/components/marketing/public-page";
import { readPublicHealth, type PublicHealth, type ServiceState } from "@/lib/health";

export const metadata: Metadata = { title: "Service Status", description: "Live availability for PayloadGrid APIs, dashboard, webhook ingestion, delivery, and retries." };
export const dynamic = "force-dynamic";

function unavailableHealth(): PublicHealth {
  return {
    status: "outage",
    services: { api: "outage", dashboard: "outage", inboundWebhooks: "outage", outboundDelivery: "outage", scheduledRetries: "outage" },
    checkedAt: new Date().toISOString()
  };
}

const services = [
  { key: "api", title: "Public API", copy: "Message acceptance, authentication, and API responses.", icon: Server },
  { key: "dashboard", title: "Dashboard", copy: "Workspace configuration and delivery visibility.", icon: LayoutDashboard },
  { key: "inboundWebhooks", title: "Inbound webhooks", copy: "Provider callback acceptance and verification.", icon: Webhook },
  { key: "outboundDelivery", title: "Outbound delivery", copy: "Signed delivery to customer destinations.", icon: Send },
  { key: "scheduledRetries", title: "Scheduled retries", copy: "Automatic recovery for unsuccessful deliveries.", icon: RotateCcw }
] as const;

function statusCopy(status: ServiceState) {
  if (status === "operational") return "Operational";
  if (status === "degraded") return "Degraded performance";
  return "Outage";
}

export default async function StatusPage() {
  let health = unavailableHealth();
  try { health = await readPublicHealth(); } catch { health = unavailableHealth(); }
  const Icon = health.status === "operational" ? CheckCircle2 : health.status === "degraded" ? TriangleAlert : XCircle;
  const title = health.status === "operational" ? "All monitored services operational." : health.status === "degraded" ? "Some services are experiencing delays." : "Service interruption detected.";
  return <PublicPage eyebrow="Live service status" title={title} intro="Current availability for the PayloadGrid services customers depend on.">
    <section className={`status-summary ${health.status}`}><Icon size={26} /><div><strong>{statusCopy(health.status)}</strong><span>Checked {new Date(health.checkedAt).toLocaleString("en-US")}</span></div></section>
    <section className="status-components">{services.map(({ key, title: serviceTitle, copy, icon: ServiceIcon }) => { const state = health.services[key]; return <article key={key}><ServiceIcon size={20} /><div><strong>{serviceTitle}</strong><p>{copy}</p></div><span className={state === "operational" ? "ok" : state === "degraded" ? "warn" : "down"}>{statusCopy(state)}</span></article>; })}</section>
    <section className="public-section status-methodology"><span className="section-label">Status methodology</span><h2>Customer impact, not internal configuration.</h2><p><Gauge size={17} aria-hidden="true" /> Service states are calculated from live platform connectivity and delivery backlog signals. Internal infrastructure and project-level queue diagnostics remain available only to authorized workspace operators.</p></section>
  </PublicPage>;
}
