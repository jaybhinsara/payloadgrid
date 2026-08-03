"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCircle2, LoaderCircle, ShieldCheck, TriangleAlert } from "lucide-react";

type Check = { id: number; service: string; status: string; latencyMs: number; responseStatus: number | null; error: string | null; checkedAt: string };
type Incident = { id: string; status: string; title: string; summary: string; startedAt: string };
type Summary = { totalChecks: number; latestChecks: Check[]; activeIncidents: Incident[]; notifications: { emailConfigured: boolean; webhookConfigured: boolean } };

const labels: Record<string, string> = { api: "Events API", dashboard: "Dashboard", inbound_webhooks: "Inbound webhooks", outbound_delivery: "Outbound delivery", scheduled_retries: "Scheduled retries" };

export function OperatorMonitoring({ refreshVersion }: { refreshVersion: number }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/operations/monitoring", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load platform monitoring");
      setSummary(payload.monitoring); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load platform monitoring"); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshVersion]);

  async function changeIncident(incident: Incident, status: "identified" | "monitoring" | "resolved") {
    const defaults = { identified: "The cause has been identified and remediation is underway.", monitoring: "A fix has been applied and service recovery is being monitored.", resolved: "Service has recovered and the incident is resolved." };
    const message = window.prompt("Public incident update", defaults[status]);
    if (!message?.trim()) return;
    setBusy(incident.id);
    try {
      const response = await fetch(`/api/operations/incidents/${incident.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, message: message.trim() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not update incident");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update incident"); }
    finally { setBusy(""); }
  }

  return <section className="platform-monitoring">
    <div className="operator-heading"><div><span className="section-label">PayloadGrid operator</span><h2>External monitoring</h2><p>Synthetic service checks and public incident controls across the platform.</p></div><ShieldCheck size={25} /></div>
    {error ? <div className="operations-error"><TriangleAlert size={17} />{error}</div> : null}
    {!summary ? <section className="content-card operations-loading"><LoaderCircle className="spin" size={22} /><span>Loading platform monitoring</span></section> : <>
      <div className="monitoring-summary-grid"><article><small>Recorded checks</small><strong>{summary.totalChecks.toLocaleString()}</strong></article><article><small>Email alerts</small><strong>{summary.notifications.emailConfigured ? "Ready" : "Not configured"}</strong></article><article><small>Webhook alerts</small><strong>{summary.notifications.webhookConfigured ? "Ready" : "Not configured"}</strong></article></div>
      <section className="content-card monitoring-services"><div className="card-head"><div><span className="section-label">Latest run</span><h3>Service probes</h3></div><span>{summary.latestChecks[0] ? new Date(summary.latestChecks[0].checkedAt).toLocaleString() : "Awaiting first run"}</span></div><div>{summary.latestChecks.length ? summary.latestChecks.map((check) => <article key={check.service}><div><strong>{labels[check.service] || check.service}</strong><p>{check.error || (check.responseStatus ? `HTTP ${check.responseStatus}` : "Derived from delivery infrastructure")}</p></div><span>{check.latencyMs ? `${check.latencyMs} ms` : "Internal"}</span><b className={check.status}>{check.status}</b></article>) : <div className="monitoring-empty">Run the protected monitoring schedule to collect the first service checks.</div>}</div></section>
      <section className="content-card operator-incidents"><div className="card-head"><div><span className="section-label">Incident control</span><h3>Active incidents</h3></div><span><BellRing size={14} /> {summary.activeIncidents.length}</span></div>{summary.activeIncidents.length ? <div>{summary.activeIncidents.map((incident) => <article key={incident.id}><div><strong>{incident.title}</strong><p>{incident.summary}</p><small>{incident.status} · started {new Date(incident.startedAt).toLocaleString()}</small></div><div className="incident-actions"><button className="button secondary compact-button" disabled={busy === incident.id} onClick={() => void changeIncident(incident, "identified")}>Identify</button><button className="button secondary compact-button" disabled={busy === incident.id} onClick={() => void changeIncident(incident, "monitoring")}>Monitor</button><button className="button compact-button" disabled={busy === incident.id} onClick={() => void changeIncident(incident, "resolved")}>Resolve</button></div></article>)}</div> : <div className="monitoring-empty"><CheckCircle2 size={18} /> No active platform incidents.</div>}</section>
    </>}
  </section>;
}