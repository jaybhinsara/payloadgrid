"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, AppWindow, ArchiveX, Ban, BarChart3, CircleCheck, BookOpen, Building2, Braces, ChevronDown, Copy, Gauge, KeyRound, LoaderCircle, LogOut, Menu, MessageSquareText, RefreshCw, RotateCcw, Route, Settings2, Users, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { Status } from "@/components/dashboard/common";
import { OnboardingWizard } from "@/components/dashboard/onboarding";
import type { DashboardData, DeliveryAttempt, EventRow, View } from "@/components/dashboard/types";
import { OverviewView } from "@/components/dashboard/views/overview";
import { ApplicationsView, EndpointsView } from "@/components/dashboard/views/routing";
import { DeliveriesView, EventTypesView, MessagesView } from "@/components/dashboard/views/activity";
import { ApiKeysView, AutomationsView, TeamView } from "@/components/dashboard/views/manage";
import { UsageView } from "@/components/dashboard/views/usage";
import { WorkspaceView } from "@/components/dashboard/views/workspace";

const nav: Array<{ id: View; label: string; icon: typeof Gauge; group: string }> = [
  { id: "overview", label: "Overview", icon: Gauge, group: "Workspace" }, { id: "applications", label: "Applications", icon: AppWindow, group: "Workspace" }, { id: "endpoints", label: "Endpoints", icon: Route, group: "Workspace" },
  { id: "messages", label: "Messages", icon: MessageSquareText, group: "Activity" }, { id: "deliveries", label: "Deliveries", icon: Activity, group: "Activity" }, { id: "event-types", label: "Event types", icon: Braces, group: "Activity" },
  { id: "workspace", label: "Workspace", icon: Building2, group: "Manage" }, { id: "api-keys", label: "API keys", icon: KeyRound, group: "Manage" }, { id: "team", label: "Team", icon: Users, group: "Manage" }, { id: "usage", label: "Usage", icon: BarChart3, group: "Manage" }, { id: "settings", label: "Automations", icon: Settings2, group: "Manage" }
];

export function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null); const [view, setView] = useState<View>("overview"); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState("");
  const [menuOpen, setMenuOpen] = useState(false); const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null); const [newToken, setNewToken] = useState(""); const [inviteToken, setInviteToken] = useState(""); const [lastRefresh, setLastRefresh] = useState<Date | null>(null); const [onboardingOpen, setOnboardingOpen] = useState(false);

  const load = useCallback(async (manual = false) => { if (manual) setBusy("refresh"); const response = await fetch("/api/dashboard", { cache: "no-store" }); if (response.status === 401) { router.replace("/login"); return; } const payload = await response.json().catch(() => ({})); if (!response.ok) setError(payload.error || "Could not load workspace"); else { setData(payload); setError(""); setLastRefresh(new Date()); } if (manual) setBusy(""); }, [router]);
  useEffect(() => { load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 8000); return () => window.clearInterval(timer); }, [load]);

  async function mutate(path: string, body?: unknown, method = "POST") {
    setBusy(path); setError("");
    try {
      const response = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || "Request failed"); return null; }
      await load();
      return payload as Record<string, unknown>;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Network request failed");
      return null;
    } finally { setBusy(""); }
  }
  async function replayDelivery(id: string) {
    const payload = await mutate(`/api/events/${id}/replay`);
    if (!payload) return null;
    const queueError = typeof payload.queueError === "string" ? payload.queueError : "";
    setNotice(payload.scheduled === true ? "Replay accepted by the durable queue." : `Replay used the Vercel fallback because QStash did not accept the job.${queueError ? ` ${queueError}` : ""}`);
    window.setTimeout(() => setNotice(""), 8000);
    return payload;
  }
  async function submit(event: FormEvent<HTMLFormElement>, path: string, build: (form: FormData) => unknown, after?: (payload: Record<string, unknown>) => void) { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); try { const payload = await mutate(path, build(form)); if (payload) { after?.(payload); formElement.reset(); } } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid form data"); } }
  async function copy(value: string) { await navigator.clipboard.writeText(value); setBusy("copied"); window.setTimeout(() => setBusy(""), 1000); }
  async function switchOrganization(organizationId: string) { setBusy("organization" ); const response = await fetch("/api/auth/switch-organization", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId }) }); if (response.ok) await load(); else setError("Could not switch workspace" ); setBusy("" ); }
  async function switchProject(projectId: string) { setBusy("project"); const response = await fetch("/api/auth/switch-project", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId }) }); if (response.ok) await load(); else setError("Could not switch project"); setBusy(""); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }

  useEffect(() => {
    if (!data) return;
    const complete = data.applications.length > 0 && data.endpoints.length > 0 && data.events.length > 0;
    const key = `payloadgrid:onboarding:${data.context.organization.id}`;
    if (!complete && window.localStorage.getItem(key) !== "dismissed") setOnboardingOpen(true);
  }, [data]);
  function closeOnboarding() {
    if (data) window.localStorage.setItem(`payloadgrid:onboarding:${data.context.organization.id}`, "dismissed");
    setOnboardingOpen(false);
  }
  function startOnboarding() {
    if (data) window.localStorage.removeItem(`payloadgrid:onboarding:${data.context.organization.id}`);
    setOnboardingOpen(true);
  }
  const endpointName = (id: string) => data?.endpoints.find((endpoint) => endpoint.id === id)?.name || data?.events.find((event) => event.endpoint_id === id)?.endpoint_name || "Deleted endpoint";
  if (!data) return <main className="loading-screen"><Brand /><LoaderCircle className="spin" size={25} /><p>{error || "Loading your workspace"}</p>{error ? <button className="button secondary" onClick={() => load(true)}>Try again</button> : null}</main>;

  return <main className="console-shell">
    <aside className={`console-sidebar ${menuOpen ? "open" : ""}`}><div className="sidebar-brand"><Brand href="/dashboard" /><button className="icon-button mobile-only" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19} /></button></div><WorkspaceSwitcher data={data} switchOrganization={switchOrganization} manage={() => { setView("workspace"); setMenuOpen(false); }} /><nav className="console-nav">{["Workspace", "Activity", "Manage"].map((group) => <div key={group}><span>{group}</span>{nav.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMenuOpen(false); }}><Icon size={17} />{label}{id === "deliveries" && data.metrics.openIncidents ? <em>{data.metrics.openIncidents}</em> : null}</button>)}</div>)}</nav><a className="sidebar-docs" href="/docs"><BookOpen size={16} /> Documentation</a><div className="sidebar-user"><span>{data.context.user.name.slice(0, 1).toUpperCase()}</span><div><strong>{data.context.user.name}</strong><small>{data.context.organization.role}</small></div><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={16} /></button></div></aside>
    <section className="console-content"><header className="console-topbar"><div><button className="icon-button mobile-only" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div><span>{data.context.project.environment} /</span><strong>{nav.find((item) => item.id === view)?.label}</strong></div></div><div><span className="environment-pill"><i /> {data.system.queueConfigured ? "durable queue" : "beta fallback"}</span><span className="environment-pill"><i /> {data.context.project.environment}</span><button className="icon-button" onClick={() => load(true)} title="Refresh"><RefreshCw className={busy === "refresh" ? "spin" : ""} size={17} /></button><span className="avatar">{data.context.user.name.slice(0, 1).toUpperCase()}</span></div></header>{error ? <div className="alert-banner"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div> : null}{notice ? <div className="notice-banner"><CircleCheck size={17} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div> : null}<div className="view-content">
      {view === "overview" ? <OverviewView data={data} setView={setView} inspect={setSelectedEvent} endpointName={endpointName} lastRefresh={lastRefresh} startOnboarding={startOnboarding} /> : null}
      {view === "applications" ? <ApplicationsView data={data} busy={busy} submit={submit} /> : null}
      {view === "endpoints" ? <EndpointsView data={data} busy={busy} submit={submit} copy={copy} mutate={mutate} /> : null}
      {view === "messages" ? <MessagesView data={data} busy={busy} submit={submit} /> : null}
      {view === "deliveries" ? <DeliveriesView initialEvents={data.events} endpoints={data.endpoints} inspect={setSelectedEvent} replay={replayDelivery} mutate={mutate} refreshVersion={lastRefresh?.getTime() || 0} /> : null}
      {view === "event-types" ? <EventTypesView data={data} busy={busy} submit={submit} /> : null}
      {view === "workspace" ? <WorkspaceView data={data} busy={busy} submit={submit} mutate={mutate} switchOrganization={switchOrganization} switchProject={switchProject} /> : null}
      {view === "api-keys" ? <ApiKeysView data={data} busy={busy} submit={submit} revoke={(id) => { void mutate(`/api/api-keys/${id}`, undefined, "DELETE"); }} reveal={setNewToken} /> : null}
      {view === "team" ? <TeamView data={data} busy={busy} submit={submit} reveal={setInviteToken} mutate={mutate} /> : null}
      {view === "usage" ? <UsageView data={data} /> : null}
      {view === "settings" ? <AutomationsView data={data} busy={busy} submit={submit} mutate={mutate} /> : null}
    </div></section>
    {selectedEvent ? <EventDrawer event={selectedEvent} endpointName={endpointName} close={() => setSelectedEvent(null)} copy={copy} replay={replayDelivery} mutate={mutate} /> : null}
    {newToken ? <SecretModal title="API key created" copy="This key is shown once. Store it securely before closing." secret={newToken} close={() => setNewToken("")} copyValue={copy} /> : null}
    {inviteToken ? <SecretModal title="Invitation link created" copy="Share this one-time signup link securely with the invited teammate." secret={inviteToken} close={() => setInviteToken("")} copyValue={copy} /> : null}
    {onboardingOpen ? <OnboardingWizard data={data} mutate={mutate} close={closeOnboarding} goTo={setView} /> : null}
  </main>;
}

function WorkspaceSwitcher({ data, switchOrganization, manage }: { data: DashboardData; switchOrganization: (organizationId: string) => Promise<void>; manage: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [data.context.organization.id]);
  useEffect(() => {
    function dismiss(event: MouseEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function keyboard(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", dismiss); document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("mousedown", dismiss); document.removeEventListener("keydown", keyboard); };
  }, []);
  return <div className="workspace-picker" ref={root}>
    <button className="workspace-switch" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="workspace-avatar">{data.context.organization.name.slice(0, 1).toUpperCase()}</span><span><strong>{data.context.organization.name}</strong><small>{data.context.project.name}</small></span><ChevronDown className={open ? "open" : ""} size={16} />
    </button>
    {open ? <div className="workspace-menu" role="menu"><span>Workspaces</span>{data.context.organizations.map((organization) => <button type="button" role="menuitem" key={organization.id} className={organization.id === data.context.organization.id ? "active" : ""} onClick={() => { setOpen(false); if (organization.id !== data.context.organization.id) void switchOrganization(organization.id); }}><i>{organization.name.slice(0, 1).toUpperCase()}</i><span><strong>{organization.name}</strong><small>{organization.role}</small></span>{organization.id === data.context.organization.id ? <CircleCheck size={15} /> : null}</button>)}<button className="workspace-manage" type="button" role="menuitem" onClick={() => { setOpen(false); manage(); }}><Building2 size={15} /> Manage workspaces</button></div> : null}
  </div>;
}
function EventDrawer({ event, endpointName, close, copy, replay, mutate }: { event: EventRow; endpointName: (id: string) => string; close: () => void; copy: (value: string) => void; replay: (id: string) => Promise<Record<string, unknown> | null>; mutate: (path: string, body?: unknown, method?: string) => Promise<Record<string, unknown> | null> }) {
  const [attempts, setAttempts] = useState<DeliveryAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState("");
  const [detailError, setDetailError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setDetailError("");
    fetch(`/api/events/${event.id}/attempts`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Could not load attempts"); return payload; })
      .then((payload) => setAttempts(payload.attempts || []))
      .catch((cause) => { if (cause instanceof Error && cause.name !== "AbortError") setDetailError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [event.id]);
  async function run(kind: "replay" | "cancel" | "dead-letter") {
    setActionBusy(kind);
    const payload = kind === "replay" ? await replay(event.id) : await mutate(`/api/events/${event.id}/${kind}`);
    setActionBusy("");
    if (payload) close();
  }
  const pending = ["queued", "received", "retrying"].includes(event.status);
  const replayable = ["delivered", "failed", "dead_letter", "cancelled"].includes(event.status);
  return <div className="drawer-backdrop" onMouseDown={close}><aside className="event-drawer" onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}><header><div><span className="section-label">Delivery inspection</span><h2>{event.event_type}</h2><p>{event.id}</p></div><button className="icon-button" onClick={close} aria-label="Close delivery"><X size={19} /></button></header>
    <div className="drawer-summary"><div><span>Status</span><Status value={event.status} /></div><div><span>Endpoint</span><strong>{event.endpoint_name || endpointName(event.endpoint_id)}</strong></div><div><span>Response</span><strong>{event.response_status ? `HTTP ${event.response_status}` : "No response"}</strong></div><div><span>Latency</span><strong>{event.latency_ms || 0}ms</strong></div><div><span>Attempts</span><strong>{event.attempt_count}/{event.max_retries}</strong></div><div><span>Direction</span><strong>{event.direction}</strong></div></div>
    {event.next_retry_at ? <div className="retry-notice"><RefreshCw size={16} /> Next retry {new Date(event.next_retry_at).toLocaleString()}</div> : null}
    {detailError ? <div className="inline-error drawer-error">{detailError}</div> : null}
    <section className="attempt-section"><div className="attempt-heading"><div><span className="section-label">Attempt history</span><h3>{attempts.length} delivery attempts</h3></div>{loading ? <LoaderCircle className="spin" size={17} /> : null}</div>{attempts.length ? <div className="attempt-timeline">{attempts.map((attempt) => <AttemptRow key={attempt.id} attempt={attempt} />)}</div> : !loading ? <p className="attempt-empty">No destination attempt has run yet.</p> : null}</section>
    <DrawerCode title="Original payload" value={JSON.stringify(event.request_body, null, 2)} copy={copy} />
    <DrawerCode title="Original request headers" value={JSON.stringify(event.request_headers, null, 2)} copy={copy} />
    <footer>{pending ? <button className="button danger" disabled={Boolean(actionBusy)} onClick={() => void run("cancel")}><Ban size={16} /> Cancel retry</button> : null}{event.status === "failed" ? <button className="button secondary" disabled={Boolean(actionBusy)} onClick={() => void run("dead-letter")}><ArchiveX size={16} /> Move to dead letter</button> : null}{replayable ? <button className="button primary" disabled={Boolean(actionBusy)} onClick={() => void run("replay")}><RotateCcw size={16} /> Replay delivery</button> : null}</footer>
  </aside></div>;
}

function AttemptRow({ attempt }: { attempt: DeliveryAttempt }) {
  const delivered = Boolean(attempt.response_status && attempt.response_status >= 200 && attempt.response_status < 300);
  return <article className={delivered ? "delivered" : "failed"}><span>{attempt.attempt_number}</span><div><header><strong>{delivered ? "Delivered" : attempt.error ? "Connection failed" : `HTTP ${attempt.response_status || "error"}`}</strong><time>{new Date(attempt.created_at).toLocaleString()}</time></header><code>{attempt.destination_url}</code><div className="attempt-meta"><span>{attempt.latency_ms}ms</span><span>{attempt.response_status ? `HTTP ${attempt.response_status}` : "No response"}</span></div>{attempt.error ? <p>{attempt.error}</p> : null}<details><summary>Request and response evidence</summary><pre>{JSON.stringify({ requestHeaders: attempt.request_headers, responseHeaders: attempt.response_headers, responseBody: attempt.response_body }, null, 2)}</pre></details></div></article>;
}
function DrawerCode({ title, value, copy }: { title: string; value: string; copy: (value: string) => void }) { return <section className="drawer-code"><div><strong>{title}</strong><button className="icon-button" onClick={() => copy(value)} title={`Copy ${title}`}><Copy size={14} /></button></div><pre>{value}</pre></section>; }
function SecretModal({ title, copy: message, secret, close, copyValue }: { title: string; copy: string; secret: string; close: () => void; copyValue: (value: string) => void }) { return <div className="modal-backdrop"><section className="secret-modal"><span className="secret-icon"><KeyRound size={22} /></span><h2>{title}</h2><p>{message}</p><div><code>{secret}</code><button className="icon-button" onClick={() => copyValue(secret)}><Copy size={16} /></button></div><button className="button primary wide" onClick={close}>I stored it securely</button></section></div>; }