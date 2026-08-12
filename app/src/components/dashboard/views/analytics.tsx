"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, LoaderCircle, RotateCcw, Send } from "lucide-react";
import { Empty, SectionHead } from "@/components/dashboard/common";
import type { Endpoint } from "@/components/dashboard/types";

type AnalyticsData = {
  summary: { total: number; delivered: number; failed: number; active: number; successRate: number; retryRate: number; p50Latency: number; p95Latency: number };
  timeline: Array<{ bucket: string; total: number; delivered: number; failed: number }>;
  endpoints: Array<{ id: string; name: string; total: number; delivered: number; failed: number }>;
  eventTypes: Array<{ eventType: string; total: number; delivered: number; failed: number }>;
  failures: Array<{ reason: string; count: number }>;
};

export function AnalyticsView({ endpoints, eventTypes, refreshVersion }: { endpoints: Endpoint[]; eventTypes: string[]; refreshVersion: number }) {
  const [range, setRange] = useState("7d");
  const [endpointId, setEndpointId] = useState("");
  const [eventType, setEventType] = useState("");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ range });
    if (endpointId) params.set("endpointId", endpointId);
    if (eventType) params.set("eventType", eventType);
    setLoading(true); setError("");
    fetch(`/api/analytics?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Could not load analytics"); return payload; })
      .then((payload) => setData(payload))
      .catch((cause) => { if (cause instanceof Error && cause.name !== "AbortError") setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [range, endpointId, eventType, refreshVersion]);
  const maximum = useMemo(() => Math.max(1, ...(data?.timeline.map((item) => item.total) || [1])), [data]);
  const label = range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days";
  return <><SectionHead eyebrow="Delivery intelligence" heading="Analytics" copy="Measure production volume, reliability, retries, and destination latency." action={<div className="analytics-range" role="group" aria-label="Analytics period">{["24h", "7d", "30d"].map((value) => <button key={value} className={range === value ? "active" : ""} onClick={() => setRange(value)}>{value}</button>)}</div>} />
    <section className="analytics-filters"><label>Endpoint<select value={endpointId} onChange={(event) => setEndpointId(event.target.value)}><option value="">All endpoints</option>{endpoints.map((endpoint) => <option value={endpoint.id} key={endpoint.id}>{endpoint.name}</option>)}</select></label><label>Event type<select value={eventType} onChange={(event) => setEventType(event.target.value)}><option value="">All event types</option>{eventTypes.map((name) => <option value={name} key={name}>{name}</option>)}</select></label><span>{loading ? <><LoaderCircle className="spin" size={14} /> Updating</> : `Last ${label}`}</span></section>
    {error ? <div className="view-notice error"><AlertTriangle size={15} />{error}</div> : null}
    {data ? <><section className="analytics-metrics"><Metric icon={Send} label="Total deliveries" value={data.summary.total.toLocaleString()} /><Metric icon={CheckCircle2} label="Success rate" value={`${data.summary.successRate}%`} /><Metric icon={RotateCcw} label="Retry rate" value={`${data.summary.retryRate}%`} /><Metric icon={Clock3} label="Latency p50 / p95" value={`${data.summary.p50Latency} / ${data.summary.p95Latency}ms`} /></section>
      <section className="content-card analytics-chart"><div className="card-head"><div><span className="section-label">Delivery volume</span><h3>Traffic over time</h3></div><span>{data.summary.delivered.toLocaleString()} delivered · {data.summary.failed.toLocaleString()} failed</span></div>{data.timeline.length ? <div className="analytics-bars" aria-label="Delivery volume chart">{data.timeline.map((item) => <div className="analytics-bar" key={item.bucket} title={`${new Date(item.bucket).toLocaleString()}: ${item.total} deliveries`}><i style={{ height: `${Math.max(3, item.total / maximum * 100)}%` }}><b style={{ height: `${item.total ? item.failed / item.total * 100 : 0}%` }} /></i><span>{new Date(item.bucket).toLocaleDateString(undefined, range === "24h" ? { hour: "numeric" } : { month: "short", day: "numeric" })}</span></div>)}</div> : <Empty icon={<Activity size={22} />} title="No delivery activity" copy="No production deliveries match these filters." />}</section>
      <section className="analytics-breakdown"><Breakdown title="Endpoints" rows={data.endpoints.map((row) => ({ label: row.name, ...row }))} /><Breakdown title="Event types" rows={data.eventTypes.map((row) => ({ label: row.eventType, ...row }))} /><section className="content-card analytics-list"><div className="card-head"><h3>Failure reasons</h3><span>{data.failures.reduce((sum, row) => sum + row.count, 0)} terminal</span></div>{data.failures.length ? data.failures.map((row) => <article key={row.reason}><strong>{reasonLabel(row.reason)}</strong><span>{row.count.toLocaleString()}</span></article>) : <p>No terminal failures in this period.</p>}</section></section></> : loading ? <section className="content-card analytics-loading"><LoaderCircle className="spin" size={22} /> Loading analytics</section> : null}
  </>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof Send; label: string; value: string }) { return <article className="content-card"><span><Icon size={18} /></span><div><small>{label}</small><strong>{value}</strong></div></article>; }
function Breakdown({ title, rows }: { title: string; rows: Array<{ label: string; total: number; delivered: number; failed: number }> }) { return <section className="content-card analytics-list"><div className="card-head"><h3>{title}</h3><span>Top 10</span></div>{rows.length ? rows.map((row) => <article key={row.label}><div><strong>{row.label}</strong><small>{row.total.toLocaleString()} deliveries</small></div><span>{row.total ? Math.round(row.delivered / row.total * 1000) / 10 : 0}%</span></article>) : <p>No data for this period.</p>}</section>; }
function reasonLabel(reason: string) { if (reason === "network_error") return "Network error"; if (/^\d+$/.test(reason)) return `HTTP ${reason}`; return reason.replaceAll("_", " "); }
