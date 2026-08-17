"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, BookOpen, Building2, FileText, Gauge, History, LoaderCircle, RefreshCw, Search, ShieldCheck, Users, Webhook, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { BlogView } from "@/components/dashboard/views/blog";
import { OperatorMonitoring } from "@/components/dashboard/views/operator-monitoring";

type AdminView = "overview" | "workspaces" | "users" | "infrastructure" | "publishing" | "audit";
type Workspace = { id: string; name: string; slug: string; plan: string; created_at: string; members: number; projects: number; endpoints: number; events_this_month: number; billing_status: string | null; current_period_end: string | null };
type AdminUser = { id: string; name: string; email: string; email_verified_at: string | null; verification_required: boolean; created_at: string; workspace_count: number; workspaces: string[]; providers: string[] };
type Audit = { id: number; action: string; resource_type: string; resource_id: string | null; detail: Record<string, unknown>; created_at: string; actor_name: string; actor_email: string | null };
type Summary = {
  totals: { workspaces: number; users: number; projects: number; endpoints: number };
  delivery: { events_24h: number; delivered_24h: number; pending: number; dead_letter: number };
  publishing: { published: number; drafts: number; scheduled: number };
  workspaces: Workspace[];
  users: AdminUser[];
  audits: Audit[];
};

const navigation: Array<{ id: AdminView; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "workspaces", label: "Workspaces", icon: Building2 },
  { id: "users", label: "Users", icon: Users },
  { id: "infrastructure", label: "Infrastructure", icon: Activity },
  { id: "publishing", label: "Blog", icon: FileText },
  { id: "audit", label: "Admin audit", icon: History }
];

export function AdminConsole({ user }: { user: { id: string; name: string; email: string } }) {
  const [view, setView] = useState<AdminView>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const load = useCallback(async (manual = false) => {
    if (manual) setBusy("refresh");
    try {
      const response = await fetch("/api/admin/summary", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load admin data");
      setSummary(body); setError(""); setRefreshVersion(Date.now());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load admin data"); }
    finally { if (manual) setBusy(""); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function changePlan(workspace: Workspace, plan: string) {
    if (plan === workspace.plan) return;
    if (!window.confirm(`Change ${workspace.name} from ${workspace.plan} to ${plan}?`)) return;
    setBusy(workspace.id); setError("");
    try {
      const response = await fetch(`/api/admin/workspaces/${workspace.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not change workspace plan");
      setNotice(`${workspace.name} now uses the ${plan} plan.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not change workspace plan"); }
    finally { setBusy(""); }
  }

  return <main className="admin-shell">
    <aside className="admin-sidebar">
      <div><Brand href="/admin" /><span>ADMIN</span></div>
      <nav>{navigation.map(({ id, label, icon: Icon }) => <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><Icon size={17} />{label}</button>)}</nav>
      <div className="admin-sidebar-bottom"><Link href="/dashboard"><ArrowLeft size={15} /> Customer dashboard</Link><Link href="/docs"><BookOpen size={15} /> Documentation</Link><span><i>{user.name.slice(0, 1).toUpperCase()}</i><b>{user.name}</b><small>Platform admin</small></span></div>
    </aside>
    <section className="admin-content">
      <header className="admin-topbar"><div><span>PayloadGrid /</span><strong>{navigation.find((item) => item.id === view)?.label}</strong></div><div><span className="admin-secure"><ShieldCheck size={14} /> Restricted</span><button className="icon-button" onClick={() => void load(true)} title="Refresh admin data"><RefreshCw className={busy === "refresh" ? "spin" : ""} size={17} /></button></div></header>
      {error ? <div className="alert-banner"><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div> : null}
      {notice ? <div className="notice-banner"><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div> : null}
      <div className="admin-view">
        {!summary ? <div className="admin-loading"><LoaderCircle className="spin" size={22} /> Loading PayloadGrid Admin</div> : <>
          {view === "overview" ? <AdminOverview summary={summary} navigate={setView} /> : null}
          {view === "workspaces" ? <WorkspaceAdmin workspaces={summary.workspaces} busy={busy} changePlan={changePlan} /> : null}
          {view === "users" ? <UserAdmin users={summary.users} /> : null}
          {view === "infrastructure" ? <><AdminHead eyebrow="Infrastructure" title="Platform health and incidents" copy="Monitor global service probes and control customer-facing incident updates." /><OperatorMonitoring refreshVersion={refreshVersion} /></> : null}
          {view === "publishing" ? <BlogView /> : null}
          {view === "audit" ? <AdminAudit audits={summary.audits} /> : null}
        </>}
      </div>
    </section>
  </main>;
}

function UserAdmin({ users }: { users: AdminUser[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => users.filter((user) => `${user.name} ${user.email} ${user.workspaces.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query, users]);
  return <><AdminHead eyebrow="Accounts" title="User directory" copy="Review account verification, linked identity providers, and workspace membership across the platform." /><label className="admin-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, or workspace" /><span>{filtered.length} users</span></label><section className="content-card admin-users"><header><span>User</span><span>Workspaces</span><span>Sign-in methods</span><span>Verification</span><span>Joined</span></header>{filtered.map((user) => <article key={user.id}><div><strong>{user.name}</strong><small>{user.email}</small></div><span title={user.workspaces.join(", ")}>{user.workspace_count} · {user.workspaces.slice(0, 2).join(", ") || "None"}</span><span>{user.providers.length ? user.providers.join(" + ") : "Password"}</span><b className={user.email_verified_at || !user.verification_required ? "verified" : "pending"}>{user.email_verified_at || !user.verification_required ? "Verified" : "Pending"}</b><time>{new Date(user.created_at).toLocaleDateString()}</time></article>)}</section></>;
}

function AdminOverview({ summary, navigate }: { summary: Summary; navigate: (view: AdminView) => void }) {
  const rate = summary.delivery.events_24h ? Math.round((summary.delivery.delivered_24h / summary.delivery.events_24h) * 1000) / 10 : 100;
  return <>
    <AdminHead eyebrow="Control plane" title="PayloadGrid Admin" copy="Global tenant, delivery, publishing, and incident visibility from one restricted console." />
    <section className="admin-metrics"><Metric icon={<Building2 />} label="Workspaces" value={summary.totals.workspaces} /><Metric icon={<Users />} label="Users" value={summary.totals.users} /><Metric icon={<Webhook />} label="Events · 24h" value={summary.delivery.events_24h} /><Metric icon={<Activity />} label="Delivery rate · 24h" value={`${rate}%`} /></section>
    <section className="admin-overview-grid"><article className="content-card admin-queue-card"><div><span className="section-label">Delivery operations</span><h3>Global queue posture</h3></div><div><span><small>Pending</small><strong>{summary.delivery.pending.toLocaleString()}</strong></span><span><small>Open dead letters</small><strong>{summary.delivery.dead_letter.toLocaleString()}</strong></span><span><small>Endpoints</small><strong>{summary.totals.endpoints.toLocaleString()}</strong></span><span><small>Projects</small><strong>{summary.totals.projects.toLocaleString()}</strong></span></div><button className="text-button" onClick={() => navigate("infrastructure")}>Open infrastructure <Activity size={14} /></button></article><article className="content-card admin-queue-card"><div><span className="section-label">Publishing</span><h3>Engineering content</h3></div><div><span><small>Published</small><strong>{summary.publishing.published}</strong></span><span><small>Drafts</small><strong>{summary.publishing.drafts}</strong></span><span><small>Scheduled</small><strong>{summary.publishing.scheduled}</strong></span></div><button className="text-button" onClick={() => navigate("publishing")}>Manage blog <FileText size={14} /></button></article></section>
    <section className="content-card admin-recent"><div className="card-head"><div><span className="section-label">Newest tenants</span><h3>Recently created workspaces</h3></div><button className="text-button" onClick={() => navigate("workspaces")}>View all</button></div>{summary.workspaces.slice(0, 6).map((workspace) => <article key={workspace.id}><div><strong>{workspace.name}</strong><small>{workspace.slug} · created {new Date(workspace.created_at).toLocaleDateString()}</small></div><span>{workspace.plan}</span><b>{workspace.events_this_month.toLocaleString()} events</b></article>)}</section>
  </>;
}

function WorkspaceAdmin({ workspaces, busy, changePlan }: { workspaces: Workspace[]; busy: string; changePlan: (workspace: Workspace, plan: string) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => workspaces.filter((workspace) => `${workspace.name} ${workspace.slug} ${workspace.plan}`.toLowerCase().includes(query.toLowerCase())), [query, workspaces]);
  return <><AdminHead eyebrow="Tenants" title="Workspace administration" copy="Review tenant footprint, billing state, monthly activity, and explicitly assigned capacity." /><label className="admin-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspace, slug, or plan" /><span>{filtered.length} workspaces</span></label><section className="content-card admin-workspaces"><header><span>Workspace</span><span>Footprint</span><span>Monthly events</span><span>Billing</span><span>Assigned plan</span></header>{filtered.map((workspace) => <article key={workspace.id}><div><strong>{workspace.name}</strong><small>{workspace.slug}</small></div><span>{workspace.projects} projects · {workspace.endpoints} endpoints · {workspace.members} members</span><b>{workspace.events_this_month.toLocaleString()}</b><span>{workspace.billing_status || "No subscription"}</span><select aria-label={`Plan for ${workspace.name}`} value={workspace.plan} disabled={busy === workspace.id} onChange={(event) => void changePlan(workspace, event.target.value)}><option value="free">Free</option><option value="starter">Starter</option><option value="growth">Growth</option><option value="enterprise">Enterprise</option></select></article>)}</section></>;
}

function AdminAudit({ audits }: { audits: Audit[] }) {
  return <><AdminHead eyebrow="Security history" title="Admin audit" copy="Every platform-level mutation is retained with its actor, target, and structured detail." /><section className="content-card admin-audit">{audits.length ? audits.map((audit) => <article key={audit.id}><span><History size={15} /></span><div><strong>{audit.action.replaceAll("_", " ").replaceAll(".", " · ")}</strong><small>{audit.actor_name}{audit.actor_email ? ` · ${audit.actor_email}` : ""}</small></div><code>{audit.resource_type}{audit.resource_id ? ` / ${audit.resource_id}` : ""}</code><time>{new Date(audit.created_at).toLocaleString()}</time></article>) : <p>No platform-level changes have been recorded.</p>}</section></>;
}

function AdminHead({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <div className="admin-heading"><span className="section-label">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>; }
function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) { return <article className="content-card"><span>{icon}</span><div><small>{label}</small><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong></div></article>; }
