"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowLeft, BookOpen, Building2, CirclePlay, Eye, FileText, Gauge, Headset, History, LoaderCircle, LogOut, Pencil, RefreshCw, Search, ShieldBan, ShieldCheck, Trash2, Users, Webhook, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { AdminSupport } from "@/components/admin/admin-support";
import { BlogView } from "@/components/dashboard/views/blog";
import { OperatorMonitoring } from "@/components/dashboard/views/operator-monitoring";

type AdminView = "overview" | "support" | "workspaces" | "users" | "infrastructure" | "publishing" | "audit";
type Workspace = { id: string; name: string; slug: string; plan: string; created_at: string; members: number; projects: number; endpoints: number; events_this_month: number; billing_status: string | null; current_period_end: string | null; suspended_at: string | null; suspension_reason: string | null };
type AdminUser = { id: string; name: string; email: string; email_verified_at: string | null; verification_required: boolean; created_at: string; workspace_count: number; workspaces: string[]; providers: string[]; suspended_at: string | null; suspension_reason: string | null };
type WorkspaceDetail = { workspace: Workspace; members: Array<{ id: string; name: string; email: string; role: string; suspended_at: string | null; created_at: string }>; projects: Array<{ id: string; name: string; slug: string; environment: string; endpoints: number; applications: number; active_keys: number; created_at: string }> };
type Audit = { id: number; action: string; resource_type: string; resource_id: string | null; detail: Record<string, unknown>; created_at: string; actor_name: string; actor_email: string | null };
type Summary = {
  totals: { workspaces: number; users: number; projects: number; endpoints: number };
  delivery: { events_24h: number; delivered_24h: number; pending: number; dead_letter: number };
  publishing: { published: number; drafts: number; scheduled: number };
  workspaces: Workspace[];
  users: AdminUser[];
  audits: Audit[];
};
type Editor = { kind: "user"; item: AdminUser } | { kind: "workspace"; item: Workspace };
type DeleteTarget = { kind: "user"; id: string; name: string; confirmation: string } | { kind: "workspace"; id: string; name: string; confirmation: string };
type LifecycleTarget = { kind: "user" | "workspace"; id: string; name: string; action: "suspend" | "reactivate" | "force_logout" };

const navigation: Array<{ id: AdminView; label: string; icon: typeof Gauge }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "support", label: "Support operations", icon: Headset },
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
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleTarget | null>(null);
  const [workspaceDetail, setWorkspaceDetail] = useState<WorkspaceDetail | "loading" | null>(null);
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

  async function mutate(method: "PATCH" | "DELETE", url: string, payload: Record<string, unknown>, success: string) {
    setBusy(url); setError(""); setNotice("");
    try {
      const response = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Admin operation failed");
      setEditor(null); setDeleteTarget(null); setLifecycleTarget(null); setNotice(success); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Admin operation failed"); }
    finally { setBusy(""); }
  }

  async function inspectWorkspace(workspace: Workspace) {
    setWorkspaceDetail("loading"); setError("");
    try {
      const response = await fetch(`/api/admin/workspaces/${workspace.id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load workspace details");
      setWorkspaceDetail(body);
    } catch (cause) { setWorkspaceDetail(null); setError(cause instanceof Error ? cause.message : "Could not load workspace details"); }
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
          {view === "support" ? <AdminSupport workspaces={summary.workspaces} /> : null}
          {view === "workspaces" ? <WorkspaceAdmin workspaces={summary.workspaces} busy={busy} changePlan={changePlan} edit={setEditor} remove={setDeleteTarget} lifecycle={setLifecycleTarget} inspect={inspectWorkspace} /> : null}
          {view === "users" ? <UserAdmin users={summary.users} currentUserId={user.id} edit={setEditor} remove={setDeleteTarget} lifecycle={setLifecycleTarget} /> : null}
          {view === "infrastructure" ? <><AdminHead eyebrow="Infrastructure" title="Platform health and incidents" copy="Monitor global service probes and control customer-facing incident updates." /><OperatorMonitoring refreshVersion={refreshVersion} /></> : null}
          {view === "publishing" ? <BlogView /> : null}
          {view === "audit" ? <AdminAudit audits={summary.audits} /> : null}
        </>}
      </div>
    </section>
    {editor ? <AdminEditDialog editor={editor} busy={Boolean(busy)} close={() => setEditor(null)} save={(payload) => void mutate("PATCH", `/api/admin/${editor.kind === "user" ? "users" : "workspaces"}/${editor.item.id}`, payload, `${editor.item.name} was updated.`)} /> : null}
    {deleteTarget ? <AdminDeleteDialog target={deleteTarget} busy={Boolean(busy)} close={() => setDeleteTarget(null)} confirm={() => void mutate("DELETE", `/api/admin/${deleteTarget.kind === "user" ? "users" : "workspaces"}/${deleteTarget.id}`, { confirmation: deleteTarget.confirmation }, `${deleteTarget.name} was deleted.`)} /> : null}
    {lifecycleTarget ? <AdminLifecycleDialog target={lifecycleTarget} busy={Boolean(busy)} close={() => setLifecycleTarget(null)} confirm={(reason) => void mutate("PATCH", `/api/admin/${lifecycleTarget.kind === "user" ? "users" : "workspaces"}/${lifecycleTarget.id}`, { action: lifecycleTarget.action, reason }, lifecycleTarget.action === "force_logout" ? `${lifecycleTarget.name} was signed out on every device.` : `${lifecycleTarget.name} was ${lifecycleTarget.action === "suspend" ? "suspended" : "reactivated"}.`)} /> : null}
    {workspaceDetail ? <WorkspaceDetailDialog detail={workspaceDetail} close={() => setWorkspaceDetail(null)} /> : null}
  </main>;
}

function UserAdmin({ users, currentUserId, edit, remove, lifecycle }: { users: AdminUser[]; currentUserId: string; edit: (editor: Editor) => void; remove: (target: DeleteTarget) => void; lifecycle: (target: LifecycleTarget) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => users.filter((user) => `${user.name} ${user.email} ${user.workspaces.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [query, users]);
  return <><AdminHead eyebrow="Accounts" title="User directory" copy="Review account verification, linked identity providers, and workspace membership across the platform." /><label className="admin-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, or workspace" /><span>{filtered.length} users</span></label><section className="content-card admin-users"><header><span>User</span><span>Workspaces</span><span>Sign-in methods</span><span>Verification</span><span>Joined</span><span>Actions</span></header>{filtered.map((user) => <article key={user.id}><div><strong>{user.name}</strong><small>{user.email}</small>{user.suspended_at ? <i className="admin-status suspended" title={user.suspension_reason || "Suspended"}>Suspended</i> : <i className="admin-status active">Active</i>}</div><span title={user.workspaces.join(", ")}>{user.workspace_count} · {user.workspaces.slice(0, 2).join(", ") || "None"}</span><span>{user.providers.length ? user.providers.join(" + ") : "Password"}</span><b className={user.email_verified_at || !user.verification_required ? "verified" : "pending"}>{user.email_verified_at || !user.verification_required ? "Verified" : "Pending"}</b><time>{new Date(user.created_at).toLocaleDateString()}</time><span className="admin-row-actions"><button className="icon-button" title={`Edit ${user.name}`} onClick={() => edit({ kind: "user", item: user })}><Pencil size={14} /></button><button className="icon-button" disabled={user.id === currentUserId} title={user.suspended_at ? `Reactivate ${user.name}` : `Suspend ${user.name}`} onClick={() => lifecycle({ kind: "user", id: user.id, name: user.name, action: user.suspended_at ? "reactivate" : "suspend" })}>{user.suspended_at ? <CirclePlay size={14} /> : <ShieldBan size={14} />}</button><button className="icon-button" disabled={user.id === currentUserId} title={`Force ${user.name} to sign out`} onClick={() => lifecycle({ kind: "user", id: user.id, name: user.name, action: "force_logout" })}><LogOut size={14} /></button><button className="icon-button danger-icon" disabled={user.id === currentUserId} title={user.id === currentUserId ? "You cannot delete your current account" : `Delete ${user.name}`} onClick={() => remove({ kind: "user", id: user.id, name: user.name, confirmation: user.email })}><Trash2 size={14} /></button></span></article>)}</section></>;
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

function WorkspaceAdmin({ workspaces, busy, changePlan, edit, remove, lifecycle, inspect }: { workspaces: Workspace[]; busy: string; changePlan: (workspace: Workspace, plan: string) => Promise<void>; edit: (editor: Editor) => void; remove: (target: DeleteTarget) => void; lifecycle: (target: LifecycleTarget) => void; inspect: (workspace: Workspace) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => workspaces.filter((workspace) => `${workspace.name} ${workspace.slug} ${workspace.plan}`.toLowerCase().includes(query.toLowerCase())), [query, workspaces]);
  return <><AdminHead eyebrow="Tenants" title="Workspace administration" copy="Review tenant footprint, billing state, monthly activity, and explicitly assigned capacity." /><label className="admin-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workspace, slug, or plan" /><span>{filtered.length} workspaces</span></label><section className="content-card admin-workspaces"><header><span>Workspace</span><span>Footprint</span><span>Monthly events</span><span>Billing</span><span>Assigned plan</span><span>Actions</span></header>{filtered.map((workspace) => <article key={workspace.id}><div><strong>{workspace.name}</strong><small>{workspace.slug}</small>{workspace.suspended_at ? <i className="admin-status suspended" title={workspace.suspension_reason || "Suspended"}>Suspended</i> : <i className="admin-status active">Active</i>}</div><span>{workspace.projects} projects · {workspace.endpoints} endpoints · {workspace.members} members</span><b>{workspace.events_this_month.toLocaleString()}</b><span>{workspace.billing_status || "No subscription"}</span><select aria-label={`Plan for ${workspace.name}`} value={workspace.plan} disabled={busy === workspace.id} onChange={(event) => void changePlan(workspace, event.target.value)}><option value="free">Free</option><option value="starter">Starter</option><option value="growth">Growth</option><option value="enterprise">Enterprise</option></select><span className="admin-row-actions"><button className="icon-button" title={`Inspect ${workspace.name}`} onClick={() => void inspect(workspace)}><Eye size={14} /></button><button className="icon-button" title={`Edit ${workspace.name}`} onClick={() => edit({ kind: "workspace", item: workspace })}><Pencil size={14} /></button><button className="icon-button" title={workspace.suspended_at ? `Reactivate ${workspace.name}` : `Suspend ${workspace.name}`} onClick={() => lifecycle({ kind: "workspace", id: workspace.id, name: workspace.name, action: workspace.suspended_at ? "reactivate" : "suspend" })}>{workspace.suspended_at ? <CirclePlay size={14} /> : <ShieldBan size={14} />}</button><button className="icon-button danger-icon" title={`Delete ${workspace.name}`} onClick={() => remove({ kind: "workspace", id: workspace.id, name: workspace.name, confirmation: workspace.name })}><Trash2 size={14} /></button></span></article>)}</section></>;
}

function AdminEditDialog({ editor, busy, close, save }: { editor: Editor; busy: boolean; close: () => void; save: (payload: Record<string, unknown>) => void }) {
  const user = editor.kind === "user" ? editor.item : null;
  return <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><form className="admin-dialog" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); save(editor.kind === "user" ? { name: data.get("name"), email: data.get("email"), verified: data.get("verified") === "on" } : { name: data.get("name") }); }}><header><div><span className="section-label">{editor.kind === "user" ? "Account" : "Tenant"}</span><h2>Edit {editor.item.name}</h2></div><button type="button" className="icon-button" title="Close" onClick={close}><X size={17} /></button></header><div className="admin-dialog-fields"><label>Name<input name="name" required minLength={2} maxLength={80} defaultValue={editor.item.name} /></label>{user ? <><label>Email<input name="email" required type="email" defaultValue={user.email} /></label><label className="admin-check"><input name="verified" type="checkbox" defaultChecked={Boolean(user.email_verified_at || !user.verification_required)} /><span><strong>Email verified</strong><small>Unchecking requires this user to verify before password sign-in.</small></span></label></> : <p>Renaming keeps the workspace slug and API identifiers unchanged.</p>}</div><footer><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={15} /> : <Pencil size={15} />} Save changes</button></footer></form></div>;
}

function AdminLifecycleDialog({ target, busy, close, confirm }: { target: LifecycleTarget; busy: boolean; close: () => void; confirm: (reason: string | null) => void }) {
  const [reason, setReason] = useState("");
  const isSuspend = target.action === "suspend";
  const title = target.action === "force_logout" ? `Sign out ${target.name}` : `${target.action === "reactivate" ? "Reactivate" : "Suspend"} ${target.name}`;
  const copy = target.action === "force_logout"
    ? "Every active session for this user will be revoked immediately. Their account and data remain unchanged."
    : isSuspend
      ? target.kind === "workspace" ? "Dashboard, API keys, inbound webhooks, embedded portals, and outbound delivery will stop until this workspace is reactivated." : "The user will be signed out and blocked from password and OAuth access until reactivated."
      : target.kind === "workspace" ? "Access will resume and pending delivery jobs will be scheduled again." : "The user will be allowed to sign in again.";
  return <div className="admin-dialog-backdrop" role="presentation"><section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="lifecycle-title"><header><div><span className="section-label">Lifecycle control</span><h2 id="lifecycle-title">{title}</h2></div><button className="icon-button" title="Close" onClick={close}><X size={17} /></button></header><div className="admin-dialog-fields"><p>{copy}</p>{isSuspend ? <label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} placeholder="Required for the audit history" rows={4} /></label> : null}</div><footer><button className="button secondary" onClick={close}>Cancel</button><button className={`button ${isSuspend ? "danger" : ""}`} disabled={busy || (isSuspend && reason.trim().length < 3)} onClick={() => confirm(isSuspend ? reason.trim() : null)}>{busy ? <LoaderCircle className="spin" size={15} /> : target.action === "reactivate" ? <CirclePlay size={15} /> : target.action === "force_logout" ? <LogOut size={15} /> : <ShieldBan size={15} />}{target.action === "force_logout" ? " Sign out everywhere" : target.action === "reactivate" ? " Reactivate" : " Suspend"}</button></footer></section></div>;
}

function WorkspaceDetailDialog({ detail, close }: { detail: WorkspaceDetail | "loading"; close: () => void }) {
  if (detail === "loading") return <div className="admin-dialog-backdrop" role="presentation"><section className="admin-dialog admin-detail-dialog"><div className="admin-loading"><LoaderCircle className="spin" size={21} /> Loading workspace</div></section></div>;
  return <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="admin-dialog admin-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-detail-title"><header><div><span className="section-label">Workspace record</span><h2 id="workspace-detail-title">{detail.workspace.name}</h2><small>{detail.workspace.slug} · {detail.workspace.plan} plan</small></div><button className="icon-button" title="Close" onClick={close}><X size={17} /></button></header><div className="admin-detail-body"><section><div className="admin-detail-section-head"><div><span className="section-label">Members</span><h3>{detail.members.length} accounts</h3></div></div><div className="admin-detail-list">{detail.members.map((member) => <article key={member.id}><div><strong>{member.name}</strong><small>{member.email}</small></div><span>{member.role}</span><i className={`admin-status ${member.suspended_at ? "suspended" : "active"}`}>{member.suspended_at ? "Suspended" : "Active"}</i></article>)}</div></section><section><div className="admin-detail-section-head"><div><span className="section-label">Projects</span><h3>{detail.projects.length} environments</h3></div></div><div className="admin-detail-list projects">{detail.projects.map((project) => <article key={project.id}><div><strong>{project.name}</strong><small>{project.slug} · {project.environment}</small></div><span>{project.applications} apps</span><span>{project.endpoints} endpoints</span><span>{project.active_keys} keys</span></article>)}</div></section></div><footer><button className="button secondary" onClick={close}>Close</button></footer></section></div>;
}

function AdminDeleteDialog({ target, busy, close, confirm }: { target: DeleteTarget; busy: boolean; close: () => void; confirm: () => void }) {
  const [value, setValue] = useState("");
  return <div className="admin-dialog-backdrop" role="presentation"><section className="admin-dialog admin-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-delete-title"><header><div><span className="section-label">Permanent action</span><h2 id="admin-delete-title">Delete {target.name}</h2></div><button className="icon-button" title="Close" onClick={close}><X size={17} /></button></header><div className="admin-dialog-fields"><p>{target.kind === "workspace" ? "Every project, endpoint, event, key, membership, and related record in this workspace will be permanently deleted." : "The account, sessions, linked sign-in methods, and remaining memberships will be permanently deleted."}</p><label>Type <strong>{target.confirmation}</strong> to confirm<input value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" /></label>{target.kind === "user" ? <small>Users who still own a workspace must transfer or delete it first.</small> : <small>Workspaces with an active subscription must be cancelled first.</small>}</div><footer><button className="button secondary" onClick={close}>Cancel</button><button className="button danger" disabled={busy || value !== target.confirmation} onClick={confirm}>{busy ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />} Delete permanently</button></footer></section></div>;
}

function AdminAudit({ audits }: { audits: Audit[] }) {
  return <><AdminHead eyebrow="Security history" title="Admin audit" copy="Every platform-level mutation is retained with its actor, target, and structured detail." /><section className="content-card admin-audit">{audits.length ? audits.map((audit) => <article key={audit.id}><span><History size={15} /></span><div><strong>{audit.action.replaceAll("_", " ").replaceAll(".", " · ")}</strong><small>{audit.actor_name}{audit.actor_email ? ` · ${audit.actor_email}` : ""}</small></div><code>{audit.resource_type}{audit.resource_id ? ` / ${audit.resource_id}` : ""}</code><time>{new Date(audit.created_at).toLocaleString()}</time></article>) : <p>No platform-level changes have been recorded.</p>}</section></>;
}

function AdminHead({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) { return <div className="admin-heading"><span className="section-label">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>; }
function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) { return <article className="content-card"><span>{icon}</span><div><small>{label}</small><strong>{typeof value === "number" ? value.toLocaleString() : value}</strong></div></article>; }
