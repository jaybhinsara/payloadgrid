"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, CirclePlay, Clock3, Eye, FileWarning, LoaderCircle, MessageSquarePlus, Pause, RefreshCw, RotateCcw, Search, ShieldCheck, X } from "lucide-react";

type WorkspaceOption = { id: string; name: string; slug: string; plan: string };
type Delivery = {
  id: string; message_id: string | null; provider_event_id: string | null; event_type: string; direction: string; status: string;
  retry_count: number; max_retries: number; next_retry_at: string | null; last_error: string | null; received_at: string;
  endpoint_name: string; project_name: string; workspace_id: string; workspace_name: string; attempt_count: number;
  response_status: number | null; latency_ms: number | null; job_status: string | null; available_at: string | null;
  publish_attempts: number | null; job_error: string | null;
};
type DeliveryDetail = { event: Delivery; attempts: Array<{ id: string; attempt_number: number; response_status: number | null; error: string | null; latency_ms: number; destination: string; created_at: string }> };
type SupportWorkspace = {
  workspace: WorkspaceOption & { delivery_paused_at: string | null; delivery_pause_reason: string | null; temporary_message_limit: number | null; temporary_limit_expires_at: string | null; temporary_limit_reason: string | null; plan_message_limit: number; billing_status: string | null; current_period_end: string | null };
  queue: { pending: number; dead_letter: number; oldest_pending: string | null; accepted_events: number };
  notes: Array<{ id: string; note: string; created_at: string; author_name: string; author_email: string | null }>;
};
type DeliveryAction = "retry" | "cancel" | "dead_letter" | "resolve" | "archive";

export function AdminSupport({ workspaces }: { workspaces: WorkspaceOption[] }) {
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspace, setWorkspace] = useState<SupportWorkspace | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [capacity, setCapacity] = useState("");
  const [capacityExpiry, setCapacityExpiry] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const loadWorkspace = useCallback(async () => {
    if (!workspaceId) return setWorkspace(null);
    try {
      const response = await fetch(`/api/admin/support/workspaces/${workspaceId}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load workspace support state");
      setWorkspace(body); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load workspace support state"); }
  }, [workspaceId]);

  const loadDeliveries = useCallback(async () => {
    setBusy("search");
    try {
      const query = new URLSearchParams({ limit: "50" });
      if (workspaceId) query.set("workspaceId", workspaceId);
      if (search.trim()) query.set("search", search.trim());
      if (status) query.set("status", status);
      const response = await fetch(`/api/admin/support/deliveries?${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not search deliveries");
      setDeliveries(body.deliveries || []); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not search deliveries"); }
    finally { setBusy(""); }
  }, [search, status, workspaceId]);

  useEffect(() => { void loadWorkspace(); void loadDeliveries(); }, [loadWorkspace, loadDeliveries]);

  async function workspaceAction(action: "pause" | "resume" | "set_capacity" | "clear_capacity") {
    if (!workspaceId || reason.trim().length < 3) return setError("Enter an audit reason before changing workspace operations.");
    setBusy(`workspace-${action}`); setError(""); setNotice("");
    try {
      const payload: Record<string, unknown> = { action, reason: reason.trim() };
      if (action === "set_capacity") {
        payload.messageLimit = Number(capacity);
        payload.expiresAt = capacityExpiry ? new Date(capacityExpiry).toISOString() : "";
      }
      const response = await fetch(`/api/admin/support/workspaces/${workspaceId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Workspace support action failed");
      setReason(""); setCapacity(""); setCapacityExpiry(""); setNotice(`Workspace operation ${action.replace("_", " ")} completed.`); await loadWorkspace();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Workspace support action failed"); }
    finally { setBusy(""); }
  }

  async function addNote() {
    if (!workspaceId || note.trim().length < 3) return;
    setBusy("note"); setError("");
    try {
      const response = await fetch(`/api/admin/support/workspaces/${workspaceId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ note: note.trim() }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not add support note");
      setNote(""); setNotice("Internal support note added."); await loadWorkspace();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add support note"); }
    finally { setBusy(""); }
  }

  async function inspectDelivery(id: string) {
    setBusy(`detail-${id}`); setError("");
    try {
      const response = await fetch(`/api/admin/support/deliveries/${id}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load delivery");
      setDetail(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load delivery"); }
    finally { setBusy(""); }
  }

  async function deliveryAction(action: DeliveryAction, actionReason: string) {
    if (!detail) return;
    setBusy(`delivery-${action}`); setError("");
    try {
      const response = await fetch(`/api/admin/support/deliveries/${detail.event.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason: actionReason }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Delivery action failed");
      setDetail(null); setNotice(`Delivery ${action.replace("_", " ")} accepted.`); await Promise.all([loadDeliveries(), loadWorkspace()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Delivery action failed"); }
    finally { setBusy(""); }
  }

  const currentName = useMemo(() => workspaces.find((item) => item.id === workspaceId)?.name || "Select a workspace", [workspaceId, workspaces]);
  return <>
    <div className="admin-heading"><span className="section-label">Customer support</span><h1>Support operations</h1><p>Investigate delivery metadata and recover customer workloads without opening stored payloads or credentials.</p></div>
    {error ? <div className="alert-banner"><span>{error}</span><button onClick={() => setError("")}><X size={15} /></button></div> : null}
    {notice ? <div className="notice-banner"><span>{notice}</span><button onClick={() => setNotice("")}><X size={15} /></button></div> : null}
    <section className="content-card support-workspace-panel">
      <header><div><span className="section-label">Workspace operations</span><h2>{currentName}</h2></div><select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} aria-label="Support workspace"><option value="">All workspaces · search only</option>{workspaces.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.plan}</option>)}</select></header>
      {workspace ? <>
        <div className="support-workspace-metrics"><span><small>Delivery processing</small><strong className={workspace.workspace.delivery_paused_at ? "danger-text" : "success-text"}>{workspace.workspace.delivery_paused_at ? "Paused" : "Running"}</strong></span><span><small>Monthly usage</small><strong>{Number(workspace.queue.accepted_events).toLocaleString()} / {Number(workspace.workspace.temporary_message_limit || workspace.workspace.plan_message_limit).toLocaleString()}</strong></span><span><small>Pending queue</small><strong>{Number(workspace.queue.pending).toLocaleString()}</strong></span><span><small>Open dead letters</small><strong>{Number(workspace.queue.dead_letter).toLocaleString()}</strong></span><span><small>Billing</small><strong>{workspace.workspace.billing_status || "No subscription"}</strong></span></div>
        <div className="support-control-grid">
          <label>Required audit reason<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Customer request, incident ID, or operational justification" /></label>
          <div className="support-pause-control"><div><strong>{workspace.workspace.delivery_paused_at ? "Delivery processing is paused" : "Delivery processing is active"}</strong><small>{workspace.workspace.delivery_pause_reason || "Events continue through the normal durable queue."}</small></div><button className={`button ${workspace.workspace.delivery_paused_at ? "" : "secondary"}`} disabled={Boolean(busy)} onClick={() => void workspaceAction(workspace.workspace.delivery_paused_at ? "resume" : "pause")}>{workspace.workspace.delivery_paused_at ? <CirclePlay size={15} /> : <Pause size={15} />}{workspace.workspace.delivery_paused_at ? " Resume" : " Pause"}</button></div>
          <div className="support-capacity-control"><label>Temporary monthly capacity<input type="number" min={workspace.workspace.plan_message_limit} max={100000000} value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder={workspace.workspace.plan_message_limit.toLocaleString()} /></label><label>Expires<input type="datetime-local" value={capacityExpiry} onChange={(event) => setCapacityExpiry(event.target.value)} /></label><button className="button secondary" disabled={Boolean(busy) || !capacity || !capacityExpiry} onClick={() => void workspaceAction("set_capacity")}>Apply override</button>{workspace.workspace.temporary_message_limit ? <button className="text-button danger-text" disabled={Boolean(busy)} onClick={() => void workspaceAction("clear_capacity")}>Clear {Number(workspace.workspace.temporary_message_limit).toLocaleString()} override</button> : <small>Current plan limit: {workspace.workspace.plan_message_limit.toLocaleString()} events/month</small>}</div>
        </div>
        <div className="support-notes"><div><span className="section-label">Internal history</span><h3>Support notes</h3></div><div className="support-note-compose"><textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for the next admin. Never paste secrets or full payloads." /><button className="button secondary" disabled={busy === "note" || note.trim().length < 3} onClick={() => void addNote()}><MessageSquarePlus size={15} /> Add note</button></div>{workspace.notes.length ? <div className="support-note-list">{workspace.notes.map((item) => <article key={item.id}><p>{item.note}</p><small>{item.author_name} · {new Date(item.created_at).toLocaleString()}</small></article>)}</div> : <p className="support-empty">No internal support notes.</p>}</div>
      </> : workspaceId ? <div className="admin-loading"><LoaderCircle className="spin" size={18} /> Loading workspace operations</div> : <div className="support-empty">Select one workspace to use pause, capacity, billing, and internal-note controls.</div>}
    </section>
    <section className="support-deliveries-section">
      <div className="admin-heading"><span className="section-label">Delivery investigation</span><h2>Search delivery metadata</h2><p>Search identifiers, event types, endpoints, projects, and workspace names. Payload contents are intentionally unavailable here.</p></div>
      <form className="support-search" onSubmit={(event) => { event.preventDefault(); const next = searchInput.trim(); if (next === search) void loadDeliveries(); else setSearch(next); }}><label><Search size={17} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Message, event, endpoint, or event type" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Delivery status"><option value="">All active records</option><option value="queued">Queued</option><option value="retrying">Retrying</option><option value="delivered">Delivered</option><option value="failed">Failed</option><option value="dead_letter">Dead letter</option><option value="resolved">Resolved</option><option value="cancelled">Cancelled</option><option value="archived">Archived</option></select><button className="button secondary" disabled={busy === "search"}>{busy === "search" ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />} Search</button><button type="button" className="icon-button" title="Refresh results" onClick={() => void loadDeliveries()}><RefreshCw size={16} /></button></form>
      <div className="content-card support-delivery-table"><header><span>Delivery</span><span>Route</span><span>Status</span><span>Attempts</span><span>Queue</span><span>Received</span><span></span></header>{deliveries.length ? deliveries.map((item) => <article key={item.id}><div><strong>{item.event_type}</strong><code>{item.id}</code><small>{item.workspace_name}</small></div><div><strong>{item.endpoint_name}</strong><small>{item.project_name} · {item.direction}</small></div><i className={`support-status ${item.status}`}>{item.status.replace("_", " ")}</i><span>{item.attempt_count} · {item.response_status ? `HTTP ${item.response_status}` : "no response"}</span><span>{item.job_status || "none"}</span><time>{new Date(item.received_at).toLocaleString()}</time><button className="icon-button" title="Inspect delivery" onClick={() => void inspectDelivery(item.id)}>{busy === `detail-${item.id}` ? <LoaderCircle className="spin" size={15} /> : <Eye size={15} />}</button></article>) : <div className="support-empty">No deliveries match these filters.</div>}</div>
    </section>
    {detail ? <DeliverySupportDialog detail={detail} busy={Boolean(busy)} close={() => setDetail(null)} action={deliveryAction} /> : null}
  </>;
}

function DeliverySupportDialog({ detail, busy, close, action }: { detail: DeliveryDetail; busy: boolean; close: () => void; action: (action: DeliveryAction, reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const status = detail.event.status;
  const actions: Array<{ id: DeliveryAction; label: string; icon: typeof RotateCcw }> = [];
  if (["delivered", "failed", "dead_letter", "cancelled", "resolved"].includes(status)) actions.push({ id: "retry", label: "Retry", icon: RotateCcw });
  if (["queued", "received", "retrying"].includes(status)) actions.push({ id: "cancel", label: "Cancel", icon: Ban });
  if (status === "failed") actions.push({ id: "dead_letter", label: "Move to dead letter", icon: FileWarning });
  if (status === "dead_letter") actions.push({ id: "resolve", label: "Resolve manually", icon: ShieldCheck });
  if (["delivered", "failed", "dead_letter", "cancelled", "resolved"].includes(status)) actions.push({ id: "archive", label: "Archive", icon: Clock3 });
  return <div className="admin-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="admin-dialog admin-detail-dialog support-delivery-dialog" role="dialog" aria-modal="true"><header><div><span className="section-label">Delivery evidence</span><h2>{detail.event.event_type}</h2><small>{detail.event.workspace_name} · {detail.event.id}</small></div><button className="icon-button" title="Close" onClick={close}><X size={17} /></button></header><div className="admin-detail-body"><div className="support-detail-grid"><span><small>Status</small><strong>{status.replace("_", " ")}</strong></span><span><small>Endpoint</small><strong>{detail.event.endpoint_name}</strong></span><span><small>Queue job</small><strong>{detail.event.job_status || "None"}</strong></span><span><small>Retries</small><strong>{detail.event.retry_count}/{detail.event.max_retries}</strong></span></div>{detail.event.last_error ? <div className="support-error-detail"><strong>Latest error</strong><p>{detail.event.last_error}</p></div> : null}<section><div className="admin-detail-section-head"><span className="section-label">Attempt history</span><h3>{detail.attempts.length} recorded attempts</h3></div><div className="support-attempt-list">{detail.attempts.map((attempt) => <article key={attempt.id}><span>#{attempt.attempt_number}</span><strong>{attempt.response_status ? `HTTP ${attempt.response_status}` : "Network error"}</strong><span>{attempt.latency_ms}ms</span><time>{new Date(attempt.created_at).toLocaleString()}</time><small>{attempt.error || attempt.destination}</small></article>)}</div></section>{actions.length ? <section className="support-recovery"><label>Required action reason<textarea rows={3} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why platform support is changing this delivery" /></label><div>{actions.map(({ id, label, icon: Icon }) => <button className={`button ${id === "cancel" ? "danger" : "secondary"}`} disabled={busy || reason.trim().length < 3} key={id} onClick={() => void action(id, reason.trim())}><Icon size={15} /> {label}</button>)}</div></section> : null}</div><footer><button className="button secondary" onClick={close}>Close</button></footer></section></div>;
}
