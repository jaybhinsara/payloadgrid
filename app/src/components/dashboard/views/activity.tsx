"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Braces, ChevronLeft, ChevronRight, Eye, MessageSquareText, Plus, RotateCcw, Search, Send } from "lucide-react";
import { Empty, SectionHead, Status, timeAgo } from "@/components/dashboard/common";
import type { DashboardData, DashboardMutate, DashboardSubmit, EventRow } from "@/components/dashboard/types";

const REPLAYABLE_STATUSES = new Set(["delivered", "failed", "dead_letter", "resolved", "cancelled"]);

export function MessagesView({ data, busy, submit }: { data: DashboardData; busy: string; submit: DashboardSubmit }) {
  const appName = (id: string) => data.applications.find((app) => app.id === id)?.name || "Application";
  const availableEventTypes = Array.from(new Set([
    ...data.eventTypes.map((item) => item.name),
    ...data.endpoints.flatMap((endpoint) => endpoint.event_types),
    ...data.messages.map((message) => message.event_type)
  ])).sort();
  return <><SectionHead eyebrow="Outbound API" heading="Messages" copy="Send one event and PayloadGrid will route it to every matching endpoint." /><section className="split-layout message-layout"><form className="content-card form-card" onSubmit={(event) => submit(event, "/api/messages", (form) => ({ applicationId: form.get("applicationId"), eventType: form.get("eventType"), payload: JSON.parse(String(form.get("payload"))) }))}><h3>Send test event</h3><label>Application<select name="applicationId" required defaultValue=""><option value="" disabled>Select application</option>{data.applications.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label><label>Event type<select name="eventType" required defaultValue=""><option value="" disabled>{availableEventTypes.length ? "Select event type" : "Add an event type first"}</option>{availableEventTypes.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}</select></label><label>JSON payload<textarea className="code-input" name="payload" required defaultValue={'{\n  "orderId": "order_123",\n  "status": "completed"\n}'} /></label><button className="button primary" disabled={busy === "/api/messages"}><Send size={16} /> Send message</button></form><section className="content-card table-card"><div className="card-head"><h3>Message history</h3><span>{data.messages.length} messages</span></div>{data.messages.length ? <div className="compact-list">{data.messages.map((message) => <article key={message.id}><span className="resource-icon"><MessageSquareText size={17} /></span><div><strong>{message.event_type}</strong><small>{appName(message.application_id)} · {message.id.slice(0, 8)}</small></div><Status value={message.status} /><time>{timeAgo(message.created_at)}</time></article>)}</div> : <Empty icon={<Send size={22} />} title="No outbound messages" copy="Send a test event here or use the authenticated REST API." />}</section></section></>;
}

export function DeliveriesView({ initialEvents, endpoints, inspect, replay, mutate, refreshVersion }: { initialEvents: EventRow[]; endpoints: DashboardData["endpoints"]; inspect: (event: EventRow) => void; replay: (id: string) => Promise<Record<string, unknown> | null>; mutate: DashboardMutate; refreshVersion: number }) {
  const [events, setEvents] = useState(initialEvents.slice(0, 20));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const [endpointId, setEndpointId] = useState("all");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const cursor = cursorHistory[cursorHistory.length - 1];
  const refreshInitialized = useRef(false);
  const tableRef = useRef<HTMLElement>(null);

  useEffect(() => { if (refreshInitialized.current) setReload((value) => value + 1); else refreshInitialized.current = true; }, [refreshVersion]);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { setCursorHistory([]); }, [debouncedSearch, status, direction, endpointId]);
  useEffect(() => {
    tableRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }, [cursor, debouncedSearch, status, direction, endpointId]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "20" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (status !== "all") params.set("status", status);
    if (direction !== "all") params.set("direction", direction);
    if (endpointId !== "all") params.set("endpointId", endpointId);
    if (cursor) params.set("cursor", cursor);
    setLoading(true); setError(""); setNextCursor(null);
    fetch(`/api/deliveries?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Could not load deliveries"); return payload; })
      .then((payload) => { setEvents(payload.events || []); setNextCursor(payload.nextCursor || null); setSelected(new Set()); })
      .catch((cause) => { if (cause instanceof Error && cause.name !== "AbortError") setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cursor, debouncedSearch, direction, endpointId, reload, status]);

  const selectable = useMemo(() => events.filter((event) => REPLAYABLE_STATUSES.has(event.status)), [events]);
  const allSelected = selectable.length > 0 && selectable.every((event) => selected.has(event.id));
  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function togglePage() { setSelected(allSelected ? new Set() : new Set(selectable.map((event) => event.id))); }
  async function replayOne(id: string) { const payload = await replay(id); if (payload) { setNotice("Replay accepted. Delivery state will update automatically."); setReload((value) => value + 1); } }
  async function replaySelected() {
    const payload = await mutate("/api/events/bulk-replay", { eventIds: [...selected] });
    if (payload) { setNotice(`${Number(payload.accepted || 0)} deliveries accepted for replay.`); setSelected(new Set()); setReload((value) => value + 1); }
  }

  return <><SectionHead eyebrow="Delivery operations" heading="Deliveries" copy="Inspect complete attempt history, control retries, and recover dead-lettered events." />
    {notice ? <div className="view-notice">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div> : null}
    {error ? <div className="inline-error">{error}</div> : null}
    <section className="delivery-filters" aria-label="Delivery filters">
      <div className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event or endpoint" /></div>
      <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["queued", "processing", "retrying", "delivered", "failed", "dead_letter", "resolved", "cancelled", "received"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select>
      <select aria-label="Filter by direction" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="all">All directions</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select>
      <select aria-label="Filter by endpoint" value={endpointId} onChange={(event) => setEndpointId(event.target.value)}><option value="all">All endpoints</option>{endpoints.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select>

    </section>
    {selected.size ? <section className="bulk-toolbar"><strong>{selected.size} selected</strong><span>Replay up to 25 deliveries at once.</span><button className="button secondary small" onClick={() => setSelected(new Set())}>Clear</button><button className="button primary small" disabled={selected.size > 25} onClick={() => void replaySelected()}><RotateCcw size={14} /> Replay selected</button></section> : null}
    <section ref={tableRef} className="content-card delivery-list" aria-busy={loading}>{events.length ? <div className="data-table delivery-table operations-table"><div className="table-header"><span><input type="checkbox" checked={allSelected} onChange={togglePage} aria-label="Select page" /></span><span>Event</span><span>Direction</span><span>Endpoint</span><span>Status</span><span>Response</span><span>Attempts</span><span>Time</span><span /></div>{events.map((event) => <div className="table-row" key={event.id}><span><input type="checkbox" checked={selected.has(event.id)} disabled={!REPLAYABLE_STATUSES.has(event.status)} onChange={() => toggle(event.id)} aria-label={`Select ${event.event_type}`} /></span><span><strong>{event.event_type}</strong><small>{event.provider_event_id || event.id.slice(0, 12)}</small></span><span><i className="direction-pill">{event.direction}</i></span><span>{event.endpoint_name}</span><span><Status value={event.status} /></span><span>{event.response_status ? `HTTP ${event.response_status}` : event.error || event.last_error || "No response"}</span><span>{event.attempt_count}/{event.max_retries}</span><span>{timeAgo(event.received_at)}</span><span className="row-actions"><button className="icon-button" onClick={() => inspect(event)} title="Inspect attempts"><Eye size={15} /></button><button className="icon-button" disabled={!REPLAYABLE_STATUSES.has(event.status)} onClick={() => void replayOne(event.id)} title="Replay"><RotateCcw size={15} /></button></span></div>)}</div> : <Empty icon={<Activity size={22} />} title="No matching deliveries" copy="Change the filters or send an event to this workspace." />}</section>
    <nav className="table-pagination" aria-label="Delivery pages"><span>Page {cursorHistory.length + 1}</span><div><button className="icon-button" disabled={!cursorHistory.length || loading} onClick={() => setCursorHistory((value) => value.slice(0, -1))} aria-label="Previous page"><ChevronLeft size={16} /></button><button className="icon-button" disabled={!nextCursor || loading} onClick={() => nextCursor && setCursorHistory((value) => [...value, nextCursor])} aria-label="Next page"><ChevronRight size={16} /></button></div></nav>
  </>;
}

export function EventTypesView({ data, busy, submit }: { data: DashboardData; busy: string; submit: DashboardSubmit }) {
  return <><SectionHead eyebrow="Event catalog" heading="Event types" copy="Define the event names customers can subscribe to." /><section className="split-layout"><form className="content-card form-card" onSubmit={(event) => submit(event, "/api/event-types", (form) => ({ name: form.get("name"), description: form.get("description") }))}><h3>Add event type</h3><label>Name<input name="name" required placeholder="invoice.payment_failed" /></label><label>Description<textarea name="description" placeholder="When this event is emitted" /></label><button className="button primary" disabled={busy === "/api/event-types"}><Plus size={16} /> Save event type</button></form><section className="content-card list-card">{data.eventTypes.length ? <div className="resource-list">{data.eventTypes.map((item) => <article key={item.id}><span className="resource-icon"><Braces size={18} /></span><div><strong>{item.name}</strong><small>{item.description || "No description"}</small></div><span>{data.endpoints.filter((endpoint) => endpoint.event_types.includes(item.name)).length} subscribers</span></article>)}</div> : <Empty icon={<Braces size={22} />} title="No event types" copy="Add event types to make endpoint subscriptions easier to manage." />}</section></section></>;
}
