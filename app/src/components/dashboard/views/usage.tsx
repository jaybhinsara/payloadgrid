import { Activity, CalendarDays, Database, Gauge, Route, Users } from "lucide-react";
import { SectionHead } from "@/components/dashboard/common";
import type { DashboardData } from "@/components/dashboard/types";

export function UsageView({ data }: { data: DashboardData }) {
  const { limits } = data.usage;
  const rows = [
    { label: "Accepted events", value: data.usage.acceptedEvents, limit: limits.messagesPerMonth, icon: Activity, copy: "Inbound events and outbound API messages this month" },
    { label: "Endpoints", value: data.endpoints.length, limit: limits.endpoints, icon: Route, copy: "Active and paused destinations in this project" },
    { label: "Team members", value: data.members.length, limit: limits.teamMembers, icon: Users, copy: "People with access to this workspace" }
  ];
  return <>
    <SectionHead eyebrow="Plan and capacity" heading="Usage" copy={`Current plan usage since ${new Date(data.usage.periodStart).toLocaleDateString(undefined, { month: "long", day: "numeric" })}.`} />
    <section className="usage-summary">
      <article><span><Gauge size={18} /></span><div><small>Plan</small><strong>{data.context.organization.plan === "free" ? "Free" : data.context.organization.plan}</strong></div></article>
      <article><span><Database size={18} /></span><div><small>Payload retention</small><strong>{limits.payloadRetentionDays} days</strong></div></article>
      <article><span><CalendarDays size={18} /></span><div><small>Resets</small><strong>{new Date(new Date(data.usage.periodStart).getFullYear(), new Date(data.usage.periodStart).getMonth() + 1, 1).toLocaleDateString()}</strong></div></article>
    </section>
    <section className="content-card usage-card"><div className="card-head"><div><span className="section-label">Included capacity</span><h3>Project limits</h3></div><span>{data.system.queueConfigured ? "Durable queue active" : "Fallback delivery"}</span></div><div className="usage-list">{rows.map(({ label, value, limit, icon: Icon, copy }) => { const percent = Math.min(100, Math.round((value / limit) * 100)); return <article key={label}><span className="resource-icon"><Icon size={17} /></span><div><div><strong>{label}</strong><span>{value.toLocaleString()} / {limit.toLocaleString()}</span></div><p>{copy}</p><div className="usage-track"><i style={{ width: `${percent}%` }} /></div></div><em>{percent}%</em></article>; })}</div></section>
    <section className="usage-notes"><article><strong>API rate</strong><span>{limits.apiRequestsPerMinute} requests per minute for each API key</span></article><article><strong>Inbound rate</strong><span>{limits.inboundRequestsPerMinute} requests per minute for each endpoint</span></article><article><strong>Retry attempts</strong><span>Retries do not count as additional accepted events</span></article></section>
  </>;
}