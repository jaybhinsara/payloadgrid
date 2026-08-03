import type { Metadata } from "next";
import { CheckCircle2, Gauge, LayoutDashboard, RotateCcw, Send, Server, TriangleAlert, Webhook, XCircle } from "lucide-react";
import { PublicPage } from "@/components/marketing/public-page";
import { readPublicHealth, type PublicHealth, type ServiceState } from "@/lib/health";
import { readMonitoringSummary } from "@/lib/monitoring";

export const metadata: Metadata = { title: "Service Status", description: "Live availability and incident history for PayloadGrid APIs, dashboard, webhook ingestion, delivery, and retries." };
export const dynamic = "force-dynamic";

function unavailableHealth(): PublicHealth {
  return { status: "outage", services: { api: "outage", dashboard: "outage", inboundWebhooks: "outage", outboundDelivery: "outage", scheduledRetries: "outage" }, checkedAt: new Date().toISOString() };
}

const services = [
  { key: "api", incidentKey: "api", title: "Public API", copy: "Message acceptance, authentication, and API responses.", icon: Server },
  { key: "dashboard", incidentKey: "dashboard", title: "Dashboard", copy: "Workspace configuration and delivery visibility.", icon: LayoutDashboard },
  { key: "inboundWebhooks", incidentKey: "inbound_webhooks", title: "Inbound webhooks", copy: "Provider callback acceptance and verification.", icon: Webhook },
  { key: "outboundDelivery", incidentKey: "outbound_delivery", title: "Outbound delivery", copy: "Signed delivery to customer destinations.", icon: Send },
  { key: "scheduledRetries", incidentKey: "scheduled_retries", title: "Scheduled retries", copy: "Automatic recovery for unsuccessful deliveries.", icon: RotateCcw }
] as const;

function statusCopy(status: ServiceState) { if (status === "operational") return "Operational"; if (status === "degraded") return "Degraded performance"; return "Outage"; }
function serviceLabel(value: string) { return services.find((service) => service.incidentKey === value)?.title || value.replaceAll("_", " "); }

export default async function StatusPage() {
  let health = unavailableHealth();
  let monitoring: Awaited<ReturnType<typeof readMonitoringSummary>> | null = null;
  try { health = await readPublicHealth(); } catch { health = unavailableHealth(); }
  try { monitoring = await readMonitoringSummary(); } catch { monitoring = null; }

  const serviceStates = { ...health.services };
  for (const incident of monitoring?.activeIncidents || []) {
    const service = services.find((item) => item.incidentKey === incident.service);
    if (service) serviceStates[service.key] = incident.severity === "outage" ? "outage" : "degraded";
  }
  const effectiveStatus: ServiceState = Object.values(serviceStates).includes("outage") ? "outage" : Object.values(serviceStates).includes("degraded") ? "degraded" : "operational";
  const Icon = effectiveStatus === "operational" ? CheckCircle2 : effectiveStatus === "degraded" ? TriangleAlert : XCircle;
  const title = effectiveStatus === "operational" ? "All monitored services operational." : effectiveStatus === "degraded" ? "Some services are experiencing delays." : "Service interruption detected.";
  const hasRuns = Boolean(monitoring?.recentRuns.length);

  return <PublicPage eyebrow="Live service status" title={title} intro="Current availability and incident history for the PayloadGrid services customers depend on.">
    <section className={`status-summary ${effectiveStatus}`}><Icon size={26} /><div><strong>{statusCopy(effectiveStatus)}</strong><span>Checked {new Date(health.checkedAt).toLocaleString("en-US")}</span></div></section>
    <section className="status-components">{services.map(({ key, title: serviceTitle, copy, icon: ServiceIcon }) => { const state = serviceStates[key]; return <article key={key}><ServiceIcon size={20} /><div><strong>{serviceTitle}</strong><p>{copy}</p></div><span className={state === "operational" ? "ok" : state === "degraded" ? "warn" : "down"}>{statusCopy(state)}</span></article>; })}</section>

    <section className="status-history"><div className="status-section-head"><div><span className="section-label">Monitoring history</span><h2>Recent service checks</h2></div><span>{monitoring?.monitoringSince ? `Collecting since ${new Date(monitoring.monitoringSince).toLocaleDateString("en-US")}` : "Awaiting first scheduled run"}</span></div>{hasRuns ? <div className="check-run-strip" aria-label="Recent monitoring runs">{monitoring!.recentRuns.map((run) => <i key={run.runId} className={run.status} title={`${statusCopy(run.status as ServiceState)} · ${new Date(run.checkedAt).toLocaleString("en-US")}`} />)}</div> : <div className="status-empty"><Gauge size={20} /><div><strong>Monitoring history is being collected</strong><p>Scheduled checks will appear here after the first scheduled monitoring run.</p></div></div>}</section>

    <section className="incident-history"><div className="status-section-head"><div><span className="section-label">Incidents</span><h2>{!monitoring ? "Incident history" : monitoring.activeIncidents.length ? "Active incidents" : "No active incidents"}</h2></div><span>{monitoring ? `${monitoring.totalChecks.toLocaleString()} checks recorded` : "Live status only"}</span></div>{monitoring?.activeIncidents.map((incident) => <article className="incident-card active" key={incident.id}><header><span className={incident.severity}>{incident.severity}</span><time>{new Date(incident.startedAt).toLocaleString("en-US")}</time></header><h3>{incident.title}</h3><p>{incident.summary}</p><div>{incident.updates.map((update) => <span key={update.id}><i /> <strong>{update.status}</strong> {update.message}<time>{new Date(update.createdAt).toLocaleString("en-US")}</time></span>)}</div></article>)}{monitoring && !monitoring.activeIncidents.length ? <div className="status-empty compact"><CheckCircle2 size={20} /><div><strong>No unresolved service incidents</strong><p>New incidents appear after repeated synthetic check failures.</p></div></div> : null}{!monitoring ? <div className="status-empty compact"><Gauge size={20} /><div><strong>Incident history is not available yet</strong><p>Live service checks remain available above.</p></div></div> : null}{monitoring?.recentIncidents.length ? <div className="resolved-incidents"><strong>Recently resolved</strong>{monitoring.recentIncidents.map((incident) => <article key={incident.id}><div><span>{serviceLabel(incident.service)}</span><h3>{incident.title}</h3></div><time>Resolved {new Date(incident.resolvedAt || incident.updatedAt).toLocaleString("en-US")}</time></article>)}</div> : null}</section>

    <section className="public-section status-methodology"><span className="section-label">Status methodology</span><h2>Customer impact, backed by recorded checks.</h2><p><Gauge size={17} aria-hidden="true" /> Live state uses platform connectivity and delivery backlog signals. Scheduled checks open incidents only after three consecutive failures and resolve them after two consecutive recoveries.</p></section>
  </PublicPage>;
}
