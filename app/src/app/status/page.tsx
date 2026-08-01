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
  return <PublicPage eyebrow="Live service status" title={operational ? "All monitored systems operational." : "Beta configuration needs attention."} intro="This page reports live component checks. Historical uptime and an SLA will only be published after independent monitoring has collected enough evidence.">
    <section className={`status-summary ${operational ? "operational" : "degraded"}`}>{operational ? <CheckCircle2 size={26} /> : <TriangleAlert size={26} />}<div><strong>{health ? health.status : "unavailable"}</strong><span>Checked {health ? new Date(health.checkedAt).toLocaleString("en-US") : "just now"}</span></div></section>
    <section className="status-components"><article><Database size={20} /><div><strong>PostgreSQL</strong><p>Account, configuration, queue state, and delivery evidence.</p></div><span className={health?.database === "operational" ? "ok" : "warn"}>{health?.database || "unavailable"}</span></article><article><ServerCog size={20} /><div><strong>Delivery queue</strong><p>Signed QStash jobs with a database-backed fallback.</p></div><span className={health?.deliveryQueue === "operational" ? "ok" : "warn"}>{health?.deliveryQueue || "unavailable"}</span></article><article><Activity size={20} /><div><strong>Pending deliveries</strong><p>Events waiting, processing, or scheduled for retry.</p></div><span>{health?.pendingDeliveries ?? "—"}</span></article><article><Clock3 size={20} /><div><strong>Oldest pending event</strong><p>Queue age is a more useful beta signal than an invented uptime percentage.</p></div><span>{health ? `${health.oldestPendingSeconds}s` : "—"}</span></article></section>
    <section className="public-section"><span className="section-label">Beta transparency</span><h2>What this page does not claim</h2><p>There is no contractual uptime SLA or long-term incident history during public beta. External synthetic monitoring and public incident records will be added before a paid reliability plan launches.</p></section>
  </PublicPage>;
}