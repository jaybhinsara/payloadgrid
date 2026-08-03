import { randomUUID } from "node:crypto";
import { assertSafeDestinationUrl } from "@/lib/destination-security";
import { appUrl } from "@/lib/constants";
import { requireSql } from "@/lib/db";

export const MONITORED_SERVICES = ["api", "dashboard", "inbound_webhooks", "outbound_delivery", "scheduled_retries"] as const;
export type MonitoredService = typeof MONITORED_SERVICES[number];
export type MonitorState = "operational" | "degraded" | "outage";
export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";

export const SERVICE_LABELS: Record<MonitoredService, string> = {
  api: "Public API",
  dashboard: "Dashboard",
  inbound_webhooks: "Inbound webhooks",
  outbound_delivery: "Outbound delivery",
  scheduled_retries: "Scheduled retries"
};

type CheckResult = { service: MonitoredService; status: MonitorState; latencyMs: number; responseStatus: number | null; error: string | null; metadata?: Record<string, unknown> };
type IncidentNotice = { id: string; service: MonitoredService; status: IncidentStatus; severity: "degraded" | "outage"; title: string; summary: string; startedAt: string; resolvedAt?: string | null };

function monitorState(value: unknown): MonitorState { return value === "degraded" || value === "outage" ? value : "operational"; }
async function probe(path: string) {
  const started = Date.now();
  try {
    const response = await fetch(`${appUrl()}${path}`, { cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "user-agent": "PayloadGrid-Monitor/1.0" } });
    const text = await response.text();
    return { ok: response.ok, status: response.status, latencyMs: Date.now() - started, text, error: response.ok ? null : `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, status: null, latencyMs: Date.now() - started, text: "", error: error instanceof Error ? error.message.slice(0, 300) : "Probe failed" };
  }
}

async function collectChecks(): Promise<CheckResult[]> {
  const [healthProbe, dashboardProbe] = await Promise.all([probe("/api/health"), probe("/login")]);
  let health: { services?: Record<string, unknown> } = {};
  try { health = JSON.parse(healthProbe.text); } catch { health = {}; }
  const stateFor = (key: string): MonitorState => healthProbe.ok && health.services ? monitorState(health.services[key]) : "outage";
  const apiState = stateFor("api");
  const dashboardState = dashboardProbe.ok ? stateFor("dashboard") : "outage";
  const derived = (service: MonitoredService, key: string): CheckResult => {
    const status = stateFor(key);
    return { service, status, latencyMs: healthProbe.latencyMs, responseStatus: healthProbe.status, error: status === "operational" ? null : healthProbe.error || `${SERVICE_LABELS[service]} reported ${status}` };
  };
  return [
    { service: "api", status: apiState, latencyMs: healthProbe.latencyMs, responseStatus: healthProbe.status, error: apiState === "operational" ? null : healthProbe.error || "Public API health check failed" },
    { service: "dashboard", status: dashboardState, latencyMs: Math.max(healthProbe.latencyMs, dashboardProbe.latencyMs), responseStatus: dashboardProbe.status, error: dashboardState === "operational" ? null : dashboardProbe.error || healthProbe.error || "Dashboard probe failed" },
    derived("inbound_webhooks", "inboundWebhooks"),
    derived("outbound_delivery", "outboundDelivery"),
    derived("scheduled_retries", "scheduledRetries")
  ];
}

async function notifyIncident(notice: IncidentNotice) {
  const subject = `[PayloadGrid] ${notice.status === "resolved" ? "Resolved" : notice.severity.toUpperCase()}: ${notice.title}`;
  const text = `${notice.title}\n\n${notice.summary}\nStatus: ${notice.status}\nService: ${SERVICE_LABELS[notice.service]}\nStarted: ${notice.startedAt}${notice.resolvedAt ? `\nResolved: ${notice.resolvedAt}` : ""}`;
  const recipients = (process.env.PAYLOADGRID_INCIDENT_ALERT_TO || "").split(",").map((value) => value.trim()).filter(Boolean);
  if (process.env.RESEND_API_KEY && process.env.PAYLOADGRID_ALERT_FROM && recipients.length) {
    try {
      await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" }, body: JSON.stringify({ from: process.env.PAYLOADGRID_ALERT_FROM, to: recipients, subject, text }), signal: AbortSignal.timeout(10000) });
    } catch { /* Monitoring persistence must not depend on notification delivery. */ }
  }
  if (process.env.PAYLOADGRID_INCIDENT_ALERT_WEBHOOK) {
    try {
      const destination = await assertSafeDestinationUrl(process.env.PAYLOADGRID_INCIDENT_ALERT_WEBHOOK);
      await fetch(destination, { method: "POST", headers: { "content-type": "application/json", "user-agent": "PayloadGrid-Monitor/1.0" }, body: JSON.stringify({ source: "PayloadGrid", type: "service_incident", incident: notice }), signal: AbortSignal.timeout(10000) });
    } catch { /* Monitoring persistence must not depend on notification delivery. */ }
  }
}

async function updateIncidentLifecycle(check: CheckResult) {
  const sql = requireSql();
  if (check.status !== "operational") {
    const recent = await sql`select status from service_checks where service = ${check.service} order by checked_at desc limit 3`;
    if (recent.length < 3 || recent.some((item) => String(item.status) === "operational")) return null;
    const severity = recent.some((item) => String(item.status) === "outage") ? "outage" : "degraded";
    const title = `${SERVICE_LABELS[check.service]} ${severity === "outage" ? "outage" : "degradation"}`;
    const summary = check.error || `${SERVICE_LABELS[check.service]} is reporting ${severity} service.`;
    const [incident] = await sql`
      insert into incidents (service, severity, title, summary)
      values (${check.service}, ${severity}, ${title}, ${summary})
      on conflict (service) where status <> 'resolved' do nothing
      returning id, service, status, severity, title, summary, started_at, resolved_at
    `;
    if (!incident) {
      if (severity === "outage") await sql`update incidents set severity = 'outage', updated_at = now() where service = ${check.service} and status <> 'resolved' and severity <> 'outage'`;
      return null;
    }
    await sql`insert into incident_updates (incident_id, status, message) values (${incident.id}, 'investigating', ${summary})`;
    const notice: IncidentNotice = { id: String(incident.id), service: check.service, status: "investigating", severity, title, summary, startedAt: new Date(String(incident.started_at)).toISOString() };
    await notifyIncident(notice);
    return { action: "opened", incidentId: notice.id };
  }

  const recent = await sql`select status from service_checks where service = ${check.service} order by checked_at desc limit 2`;
  if (recent.length < 2 || recent.some((item) => String(item.status) !== "operational")) return null;
  const [incident] = await sql`
    update incidents set status = 'resolved', resolved_at = now(), updated_at = now()
    where service = ${check.service} and status <> 'resolved'
    returning id, service, status, severity, title, summary, started_at, resolved_at
  `;
  if (!incident) return null;
  const message = `${SERVICE_LABELS[check.service]} recovered after consecutive healthy checks.`;
  await sql`insert into incident_updates (incident_id, status, message) values (${incident.id}, 'resolved', ${message})`;
  const notice: IncidentNotice = { id: String(incident.id), service: check.service, status: "resolved", severity: String(incident.severity) as "degraded" | "outage", title: String(incident.title), summary: message, startedAt: new Date(String(incident.started_at)).toISOString(), resolvedAt: new Date(String(incident.resolved_at)).toISOString() };
  await notifyIncident(notice);
  return { action: "resolved", incidentId: notice.id };
}

export async function runSyntheticMonitoring() {
  const sql = requireSql();
  const runId = randomUUID();
  const checks = await collectChecks();
  for (const check of checks) {
    await sql`
      insert into service_checks (run_id, service, status, latency_ms, response_status, error, metadata)
      values (${runId}, ${check.service}, ${check.status}, ${check.latencyMs}, ${check.responseStatus}, ${check.error}, ${JSON.stringify(check.metadata || {})}::jsonb)
      on conflict (run_id, service) do nothing
    `;
  }
  const transitions = [];
  for (const check of checks) { const transition = await updateIncidentLifecycle(check); if (transition) transitions.push(transition); }
  const status: MonitorState = checks.some((check) => check.status === "outage") ? "outage" : checks.some((check) => check.status === "degraded") ? "degraded" : "operational";
  return { runId, status, checks, transitions };
}

function incidentFromRow(row: Record<string, unknown>, updates: Array<Record<string, unknown>>) {
  return { id: String(row.id), service: String(row.service), status: String(row.status), severity: String(row.severity), title: String(row.title), summary: String(row.summary), startedAt: new Date(String(row.started_at)).toISOString(), resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)).toISOString() : null, updatedAt: new Date(String(row.updated_at)).toISOString(), updates: updates.filter((item) => String(item.incident_id) === String(row.id)).map((item) => ({ id: String(item.id), status: String(item.status), message: String(item.message), createdAt: new Date(String(item.created_at)).toISOString() })) };
}

export async function readMonitoringSummary(includeChecks = false) {
  const sql = requireSql();
  const [activeRows, recentRows, updateRows, latestChecks, recentRuns, coverageRows, checkRows] = await Promise.all([
    sql`select id, service, status, severity, title, summary, started_at, resolved_at, updated_at from incidents where status <> 'resolved' order by started_at desc`,
    sql`select id, service, status, severity, title, summary, started_at, resolved_at, updated_at from incidents where status = 'resolved' order by resolved_at desc limit 8`,
    sql`select id, incident_id, status, message, created_at from incident_updates where incident_id in (select id from incidents order by started_at desc limit 20) order by created_at asc`,
    sql`select distinct on (service) service, status, latency_ms, response_status, error, checked_at from service_checks order by service, checked_at desc`,
    sql`select run_id, max(checked_at) as checked_at, case when bool_or(status = 'outage') then 'outage' when bool_or(status = 'degraded') then 'degraded' else 'operational' end as status from service_checks group by run_id order by max(checked_at) desc limit 24`,
    sql`select min(checked_at) as monitoring_since, count(*)::int as total_checks from service_checks`,
    includeChecks ? sql`select id, run_id, service, status, latency_ms, response_status, error, checked_at from service_checks order by checked_at desc, service asc limit 100` : Promise.resolve([])
  ]);
  const coverage = coverageRows[0] || {};
  return {
    monitoringSince: coverage.monitoring_since ? new Date(String(coverage.monitoring_since)).toISOString() : null,
    totalChecks: Number(coverage.total_checks || 0),
    latestChecks: latestChecks.map((row) => ({ service: String(row.service), status: String(row.status), latencyMs: Number(row.latency_ms || 0), responseStatus: row.response_status ? Number(row.response_status) : null, error: row.error ? String(row.error) : null, checkedAt: new Date(String(row.checked_at)).toISOString() })),
    recentRuns: recentRuns.map((row) => ({ runId: String(row.run_id), status: String(row.status), checkedAt: new Date(String(row.checked_at)).toISOString() })).reverse(),
    activeIncidents: activeRows.map((row) => incidentFromRow(row, updateRows)),
    recentIncidents: recentRows.map((row) => incidentFromRow(row, updateRows)),
    checks: checkRows.map((row) => ({ id: String(row.id), runId: String(row.run_id), service: String(row.service), status: String(row.status), latencyMs: Number(row.latency_ms || 0), responseStatus: row.response_status ? Number(row.response_status) : null, error: row.error ? String(row.error) : null, checkedAt: new Date(String(row.checked_at)).toISOString() })),
    notifications: { emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.PAYLOADGRID_ALERT_FROM && process.env.PAYLOADGRID_INCIDENT_ALERT_TO), webhookConfigured: Boolean(process.env.PAYLOADGRID_INCIDENT_ALERT_WEBHOOK) }
  };
}

export async function updateIncident(incidentId: string, status: Exclude<IncidentStatus, "investigating">, message: string, userId: string) {
  const sql = requireSql();
  const [incident] = await sql`
    update incidents set status = ${status}, resolved_at = ${status === "resolved" ? new Date().toISOString() : null}, updated_at = now()
    where id = ${incidentId}
    returning id, service, status, severity, title, summary, started_at, resolved_at
  `;
  if (!incident) return null;
  await sql`insert into incident_updates (incident_id, status, message, created_by) values (${incidentId}, ${status}, ${message}, ${userId})`;
  if (status === "resolved") await notifyIncident({ id: String(incident.id), service: String(incident.service) as MonitoredService, status, severity: String(incident.severity) as "degraded" | "outage", title: String(incident.title), summary: message, startedAt: new Date(String(incident.started_at)).toISOString(), resolvedAt: new Date(String(incident.resolved_at)).toISOString() });
  return { id: String(incident.id), status };
}
