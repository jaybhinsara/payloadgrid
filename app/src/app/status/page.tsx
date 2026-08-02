import type { Metadata } from "next";
import { Activity, CheckCircle2, Clock3, Database, ServerCog, TriangleAlert } from "lucide-react";
import { PublicPage } from "@/components/marketing/public-page";
import { readSystemHealth, type SystemHealth } from "@/lib/health";

export const metadata: Metadata = { title: "Service Status", description: "Live PayloadGrid database and delivery queue health." };
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  let health: SystemHealth | null = null;
  try { health = await readSystemHealth(); } catch { health = null; }
  const operational = health?.status === "operational";
  return <PublicPage eyebrow="Live service status" title={operational ? "All monitored systems operational." : "Service configuration needs attention."} intro="Live checks for the database, delivery queue, and pending-event age.">
    <section className={`status-summary ${operational ? "operational" : "degraded"}`}>{operational ? <CheckCircle2 size={26} /> : <TriangleAlert size={26} />}<div><strong>{health ? health.status : "unavailable"}</strong><span>Checked {health ? new Date(health.checkedAt).toLocaleString("en-US") : "just now"}</span></div></section>
    <section className="status-components"><article><Database size={20} /><div><strong>PostgreSQL</strong><p>Account, configuration, queue state, and delivery evidence.</p></div><span className={health?.database === "operational" ? "ok" : "warn"}>{health?.database || "unavailable"}</span></article><article><ServerCog size={20} /><div><strong>Delivery queue</strong><p>Signed QStash jobs with a database-backed fallback.</p></div><span className={health?.deliveryQueue === "operational" ? "ok" : "warn"}>{health?.deliveryQueue || "unavailable"}</span></article><article><Activity size={20} /><div><strong>Pending deliveries</strong><p>Events waiting, processing, or scheduled for retry.</p></div><span>{health?.pendingDeliveries ?? "-"}</span></article><article><Clock3 size={20} /><div><strong>Oldest pending event</strong><p>Oldest queued event across active delivery states.</p></div><span>{health ? `${health.oldestPendingSeconds}s` : "-"}</span></article></section>
    <section className="public-section"><span className="section-label">Service commitments</span><h2>Live health without invented guarantees.</h2><p>This page reports current component health. PayloadGrid does not currently publish long-term uptime history, and a contractual SLA applies only when agreed in writing.</p></section>
  </PublicPage>;
}
