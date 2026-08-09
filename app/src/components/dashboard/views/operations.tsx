"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Clock3, Database, LoaderCircle, RefreshCw, ServerCog, TriangleAlert } from "lucide-react";
import { SectionHead } from "@/components/dashboard/common";
import { OperatorMonitoring } from "@/components/dashboard/views/operator-monitoring";

export type OperationsHealth = {
  status: "operational" | "degraded";
  database: "operational";
  deliveryQueue: "operational" | "fallback";
  pendingDeliveries: number;
  oldestPendingSeconds: number;
  pendingDispatchJobs: number;
  publishingDispatchJobs: number;
  dispatchErrors: number;
  oldestDispatchSeconds: number;
  lastDeliveryAt: string | null;
  checkedAt: string;
};

function duration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function OperationsView({ refreshVersion, isOperator }: { refreshVersion: number; isOperator: boolean }) {
  const [health, setHealth] = useState<OperationsHealth | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/operations/health", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load system diagnostics");
      setHealth(payload.health); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load system diagnostics");
    } finally { if (manual) setRefreshing(false); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshVersion]);

  return <>
    <SectionHead eyebrow="Private operations" heading="System health" copy="Project-scoped delivery diagnostics for workspace owners and administrators." action={<button className="button secondary" onClick={() => void load(true)} disabled={refreshing}><RefreshCw className={refreshing ? "spin" : ""} size={15} /> Refresh</button>} />
    {error ? <div className="operations-error"><TriangleAlert size={17} />{error}</div> : null}
    {!health ? <section className="content-card operations-loading"><LoaderCircle className="spin" size={22} /><span>Loading diagnostics</span></section> : <>
      <section className={`operations-summary ${health.status}`}><span>{health.status === "operational" ? <CheckCircle2 size={22} /> : <TriangleAlert size={22} />}</span><div><strong>{health.status === "operational" ? "Delivery systems ready" : "Delivery path needs attention"}</strong><p>{health.deliveryQueue === "operational" ? "Durable queue processing is configured for this deployment." : "Direct delivery fallback is active; durable queue processing is not configured."}</p></div><time>Checked {new Date(health.checkedAt).toLocaleTimeString()}</time></section>
      <section className="operations-metrics"><article><span><Activity size={18} /></span><div><small>Pending deliveries</small><strong>{health.pendingDeliveries.toLocaleString()}</strong></div></article><article><span><Clock3 size={18} /></span><div><small>Oldest pending</small><strong>{health.pendingDeliveries ? duration(health.oldestPendingSeconds) : "None"}</strong></div></article><article><span><Database size={18} /></span><div><small>Outbox backlog</small><strong>{health.pendingDispatchJobs.toLocaleString()}</strong></div></article><article><span><ServerCog size={18} /></span><div><small>Queue mode</small><strong>{health.deliveryQueue === "operational" ? "Durable" : "Fallback"}</strong></div></article></section>
      <section className="content-card operations-detail"><div className="card-head"><div><span className="section-label">Delivery diagnostics</span><h3>Active project</h3></div><span>Private</span></div><div className="operations-rows"><article><div><strong>Transactional outbox</strong><p>Accepted deliveries remain recoverable until queue publication succeeds.</p></div><span className={health.oldestDispatchSeconds < 300 ? "ok" : "warn"}>{health.pendingDispatchJobs} pending · {health.publishingDispatchJobs} publishing</span></article><article><div><strong>Queue publication errors</strong><p>Outbox publish attempts with an error during the last hour.</p></div><span className={health.dispatchErrors ? "warn" : "ok"}>{health.dispatchErrors}</span></article><article><div><strong>Latest terminal delivery</strong><p>Most recent delivered, failed, cancelled, or dead-lettered event.</p></div><span>{health.lastDeliveryAt ? new Date(health.lastDeliveryAt).toLocaleString() : "No activity"}</span></article><article><div><strong>Backlog threshold</strong><p>Attention is raised when delivery or outbox age reaches five minutes.</p></div><span>{duration(Math.max(health.oldestPendingSeconds, health.oldestDispatchSeconds))} / 5m</span></article></div></section>
    </>}
    {isOperator ? <OperatorMonitoring refreshVersion={refreshVersion} /> : null}
  </>;
}
