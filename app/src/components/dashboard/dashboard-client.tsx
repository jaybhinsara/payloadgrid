"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertTriangle, AppWindow, CircleCheck, BookOpen, Braces, ChevronDown, Copy, Eye, Gauge, KeyRound, LoaderCircle, LogOut, Menu, MessageSquareText, RefreshCw, RotateCcw, Route, Search, Settings2, Users, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { Status } from "@/components/dashboard/common";
import type { DashboardData, EventRow, View } from "@/components/dashboard/types";
import { OverviewView } from "@/components/dashboard/views/overview";
import { ApplicationsView, EndpointsView } from "@/components/dashboard/views/routing";
import { DeliveriesView, EventTypesView, MessagesView } from "@/components/dashboard/views/activity";
import { ApiKeysView, AutomationsView, TeamView } from "@/components/dashboard/views/manage";

const nav: Array<{ id: View; label: string; icon: typeof Gauge; group: string }> = [
  { id: "overview", label: "Overview", icon: Gauge, group: "Workspace" }, { id: "applications", label: "Applications", icon: AppWindow, group: "Workspace" }, { id: "endpoints", label: "Endpoints", icon: Route, group: "Workspace" },
  { id: "messages", label: "Messages", icon: MessageSquareText, group: "Activity" }, { id: "deliveries", label: "Deliveries", icon: Activity, group: "Activity" }, { id: "event-types", label: "Event types", icon: Braces, group: "Activity" },
  { id: "api-keys", label: "API keys", icon: KeyRound, group: "Manage" }, { id: "team", label: "Team", icon: Users, group: "Manage" }, { id: "settings", label: "Automations", icon: Settings2, group: "Manage" }
];

export function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null); const [view, setView] = useState<View>("overview"); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState("");
  const [menuOpen, setMenuOpen] = useState(false); const [selectedEvent, setSelectedEvent] = useState<EventRow | null>(null); const [newToken, setNewToken] = useState(""); const [inviteToken, setInviteToken] = useState(""); const [search, setSearch] = useState(""); const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async (manual = false) => { if (manual) setBusy("refresh"); const response = await fetch("/api/dashboard", { cache: "no-store" }); if (response.status === 401) { router.replace("/login"); return; } const payload = await response.json().catch(() => ({})); if (!response.ok) setError(payload.error || "Could not load workspace"); else { setData(payload); setError(""); setLastRefresh(new Date()); } if (manual) setBusy(""); }, [router]);
  useEffect(() => { load(); const timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 8000); return () => window.clearInterval(timer); }, [load]);

  async function mutate(path: string, body?: unknown, method = "POST") { setBusy(path); setError(""); const response = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }); const payload = await response.json().catch(() => ({})); setBusy(""); if (!response.ok) { setError(payload.error || "Request failed"); return null; } await load(); return payload as Record<string, unknown>; }
  async function replayDelivery(id: string) {
    const payload = await mutate(`/api/events/${id}/replay`);
    if (!payload) return;
    const queueError = typeof payload.queueError === "string" ? payload.queueError : "";
    setNotice(payload.scheduled === true ? "Replay accepted by the durable queue." : `Replay used the Vercel fallback because QStash did not accept the job.${queueError ? ` ${queueError}` : ""}`);
    window.setTimeout(() => setNotice(""), 8000);
  }
  async function submit(event: FormEvent<HTMLFormElement>, path: string, build: (form: FormData) => unknown, after?: (payload: Record<string, unknown>) => void) { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); try { const payload = await mutate(path, build(form)); if (payload) { after?.(payload); formElement.reset(); } } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid form data"); } }
  async function copy(value: string) { await navigator.clipboard.writeText(value); setBusy("copied"); window.setTimeout(() => setBusy(""), 1000); }
  async function switchOrganization(organizationId: string) { setBusy("organization" ); const response = await fetch("/api/auth/switch-organization", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId }) }); if (response.ok) await load(); else setError("Could not switch workspace" ); setBusy("" ); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }

  const filteredEvents = useMemo(() => (data?.events || []).filter((event) => `${event.event_type} ${event.provider_event_id || ""} ${event.status}`.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const endpointName = (id: string) => data?.endpoints.find((endpoint) => endpoint.id === id)?.name || "Endpoint";
  if (!data) return <main className="loading-screen"><Brand /><LoaderCircle className="spin" size={25} /><p>{error || "Loading your workspace"}</p>{error ? <button className="button secondary" onClick={() => load(true)}>Try again</button> : null}</main>;

  return <main className="console-shell">
    <aside className={`console-sidebar ${menuOpen ? "open" : ""}`}><div className="sidebar-brand"><Brand href="/dashboard" /><button className="icon-button mobile-only" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={19} /></button></div><div className="workspace-switch"><span className="workspace-avatar">{data.context.organization.name.slice(0, 1).toUpperCase()}</span><span><select aria-label="Active workspace" value={data.context.organization.id} onChange={(event) => { void switchOrganization(event.target.value); }}>{data.context.organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select><small>{data.context.project.name}</small></span><ChevronDown size={15} /></div><nav className="console-nav">{["Workspace", "Activity", "Manage"].map((group) => <div key={group}><span>{group}</span>{nav.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMenuOpen(false); }}><Icon size={17} />{label}{id === "deliveries" && data.metrics.openIncidents ? <em>{data.metrics.openIncidents}</em> : null}</button>)}</div>)}</nav><a className="sidebar-docs" href="/docs"><BookOpen size={16} /> Documentation</a><div className="sidebar-user"><span>{data.context.user.name.slice(0, 1).toUpperCase()}</span><div><strong>{data.context.user.name}</strong><small>{data.context.organization.role}</small></div><button className="icon-button" onClick={logout} title="Sign out"><LogOut size={16} /></button></div></aside>
    <section className="console-content"><header className="console-topbar"><div><button className="icon-button mobile-only" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></button><div><span>Production /</span><strong>{nav.find((item) => item.id === view)?.label}</strong></div></div><div><span className="environment-pill"><i /> {data.system.queueConfigured ? "durable queue" : "beta fallback"}</span><span className="environment-pill"><i /> {data.context.project.environment}</span><button className="icon-button" onClick={() => load(true)} title="Refresh"><RefreshCw className={busy === "refresh" ? "spin" : ""} size={17} /></button><span className="avatar">{data.context.user.name.slice(0, 1).toUpperCase()}</span></div></header>{error ? <div className="alert-banner"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div> : null}{notice ? <div className="notice-banner"><CircleCheck size={17} /><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div> : null}<div className="view-content">
      {view === "overview" ? <OverviewView data={data} setView={setView} inspect={setSelectedEvent} endpointName={endpointName} lastRefresh={lastRefresh} /> : null}
      {view === "applications" ? <ApplicationsView data={data} busy={busy} submit={submit} /> : null}
      {view === "endpoints" ? <EndpointsView data={data} busy={busy} submit={submit} copy={copy} /> : null}
      {view === "messages" ? <MessagesView data={data} busy={busy} submit={submit} /> : null}
      {view === "deliveries" ? <DeliveriesView events={filteredEvents} search={search} setSearch={setSearch} inspect={setSelectedEvent} replay={(id) => { void replayDelivery(id); }} endpointName={endpointName} /> : null}
      {view === "event-types" ? <EventTypesView data={data} busy={busy} submit={submit} /> : null}
      {view === "api-keys" ? <ApiKeysView data={data} busy={busy} submit={submit} revoke={(id) => { void mutate(`/api/api-keys/${id}`, undefined, "DELETE"); }} reveal={setNewToken} /> : null}
      {view === "team" ? <TeamView data={data} busy={busy} submit={submit} reveal={setInviteToken} /> : null}
      {view === "settings" ? <AutomationsView data={data} busy={busy} submit={submit} /> : null}
    </div></section>
    {selectedEvent ? <EventDrawer event={selectedEvent} endpointName={endpointName} close={() => setSelectedEvent(null)} copy={copy} replay={(id) => { void replayDelivery(id); }} /> : null}
    {newToken ? <SecretModal title="API key created" copy="This key is shown once. Store it securely before closing." secret={newToken} close={() => setNewToken("")} copyValue={copy} /> : null}
    {inviteToken ? <SecretModal title="Invitation link created" copy="Share this one-time signup link securely with the invited teammate." secret={inviteToken} close={() => setInviteToken("")} copyValue={copy} /> : null}
  </main>;
}

function EventDrawer({ event, endpointName, close, copy, replay }: { event: EventRow; endpointName: (id: string) => string; close: () => void; copy: (value: string) => void; replay: (id: string) => void }) { return <div className="drawer-backdrop" onMouseDown={close}><aside className="event-drawer" onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}><header><div><span className="section-label">Delivery inspection</span><h2>{event.event_type}</h2><p>{event.id}</p></div><button className="icon-button" onClick={close}><X size={19} /></button></header><div className="drawer-summary"><div><span>Status</span><Status value={event.status} /></div><div><span>Endpoint</span><strong>{endpointName(event.endpoint_id)}</strong></div><div><span>Response</span><strong>{event.response_status ? `HTTP ${event.response_status}` : "No response"}</strong></div><div><span>Latency</span><strong>{event.latency_ms || 0}ms</strong></div><div><span>Attempts</span><strong>{event.attempt_count}/{event.max_retries}</strong></div><div><span>Direction</span><strong>{event.direction}</strong></div></div>{event.next_retry_at ? <div className="retry-notice"><RefreshCw size={16} /> Next retry {new Date(event.next_retry_at).toLocaleString()}</div> : null}<DrawerCode title="Payload" value={JSON.stringify(event.request_body, null, 2)} copy={copy} /><DrawerCode title="Request headers" value={JSON.stringify(event.request_headers, null, 2)} copy={copy} /><DrawerCode title="Latest response" value={event.response_body || event.error || event.last_error || "No response body captured."} copy={copy} /><footer><button className="button secondary" onClick={() => replay(event.id)}><RotateCcw size={16} /> Replay delivery</button></footer></aside></div>; }
function DrawerCode({ title, value, copy }: { title: string; value: string; copy: (value: string) => void }) { return <section className="drawer-code"><div><strong>{title}</strong><button className="icon-button" onClick={() => copy(value)} title={`Copy ${title}`}><Copy size={14} /></button></div><pre>{value}</pre></section>; }
function SecretModal({ title, copy: message, secret, close, copyValue }: { title: string; copy: string; secret: string; close: () => void; copyValue: (value: string) => void }) { return <div className="modal-backdrop"><section className="secret-modal"><span className="secret-icon"><KeyRound size={22} /></span><h2>{title}</h2><p>{message}</p><div><code>{secret}</code><button className="icon-button" onClick={() => copyValue(secret)}><Copy size={16} /></button></div><button className="button primary wide" onClick={close}>I stored it securely</button></section></div>; }