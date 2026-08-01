"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Braces, ChevronLeft, ChevronRight, Eye, MessageSquareText, Plus, RotateCcw, Search, Send } from "lucide-react";
import { Empty, SectionHead, Status, timeAgo } from "@/components/dashboard/common";
import type { DashboardData, DashboardSubmit, EventRow } from "@/components/dashboard/types";

export function MessagesView({ data, busy, submit }: { data: DashboardData; busy: string; submit: DashboardSubmit }) {
  const appName = (id: string) => data.applications.find((app) => app.id === id)?.name || "Application";
  const availableEventTypes = Array.from(new Set([
    ...data.eventTypes.map((item) => item.name),
    ...data.endpoints.flatMap((endpoint) => endpoint.event_types),
    ...data.messages.map((message) => message.event_type)
  ])).sort();
  return <><SectionHead eyebrow="Outbound API" heading="Messages" copy="Send one event and PayloadGrid will route it to every matching endpoint." /><section className="split-layout message-layout"><form className="content-card form-card" onSubmit={(event) => submit(event, "/api/messages", (form) => ({ applicationId: form.get("applicationId"), eventType: form.get("eventType"), payload: JSON.parse(String(form.get("payload"))) }))}><h3>Send test event</h3><label>Application<select name="applicationId" required defaultValue=""><option value="" disabled>Select application</option>{data.applications.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label><label>Event type<select name="eventType" required defaultValue=""><option value="" disabled>{availableEventTypes.length ? "Select event type" : "Add an event type first"}</option>{availableEventTypes.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}</select></label><label>JSON payload<textarea className="code-input" name="payload" required defaultValue={'{\n  "orderId": "order_123",\n  "status": "completed"\n}'} /></label><button className="button primary" disabled={busy === "/api/messages"}><Send size={16} /> Send message</button></form><section className="content-card table-card"><div className="card-head"><h3>Message history</h3><span>{data.messages.length} messages</span></div>{data.messages.length ? <div className="compact-list">{data.messages.map((message) => <article key={message.id}><span className="resource-icon"><MessageSquareText size={17} /></span><div><strong>{message.event_type}</strong><small>{appName(message.application_id)} · {message.id.slice(0, 8)}</small></div><Status value={message.status} /><time>{timeAgo(message.created_at)}</time></article>)}</div> : <Empty icon={<Send size={22} />} title="No outbound messages" copy="Send a test event here or use the authenticated REST API." />}</section></section></>;
}

export function DeliveriesView({ events, endpoints, inspect, replay, endpointName }: { events: EventRow[]; endpoints: DashboardData["endpoints"]; inspect: (event: EventRow) => void; replay: (id: string) => void; endpointName: (id: string) => string }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const [endpointId, setEndpointId] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const filtered = useMemo(() => events.filter((event) => {
    const matchesSearch = `${event.event_type} ${event.provider_event_id || ""} ${event.id} ${endpointName(event.endpoint_id)}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (status === "all" || event.status === status) && (direction === "all" || event.direction === direction) && (endpointId === "all" || event.endpoint_id === endpointId);
  }), [direction, endpointId, endpointName, events, search, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [search, status, direction, endpointId]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  return <><SectionHead eyebrow="Observability" heading="Deliveries" copy="Filter, inspect, and replay the latest 100 inbound and outbound attempts." />
    <section className="delivery-filters" aria-label="Delivery filters">
      <div className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event or endpoint" /></div>
      <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["queued", "processing", "retrying", "delivered", "failed", "received"].map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <select aria-label="Filter by direction" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="all">All directions</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select>
      <select aria-label="Filter by endpoint" value={endpointId} onChange={(event) => setEndpointId(event.target.value)}><option value="all">All endpoints</option>{endpoints.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select>
      <span>{filtered.length} results</span>
    </section>
    <section className="content-card delivery-list">{visible.length ? <div className="data-table delivery-table"><div className="table-header"><span>Event</span><span>Direction</span><span>Endpoint</span><span>Status</span><span>Response</span><span>Attempts</span><span>Time</span><span /></div>{visible.map((event) => <div className="table-row" key={event.id}><span><strong>{event.event_type}</strong><small>{event.provider_event_id || event.id.slice(0, 12)}</small></span><span><i className="direction-pill">{event.direction}</i></span><span>{endpointName(event.endpoint_id)}</span><span><Status value={event.status} /></span><span>{event.response_status ? `HTTP ${event.response_status}` : event.error || "No response"}</span><span>{event.attempt_count}/{event.max_retries}</span><span>{timeAgo(event.received_at)}</span><span className="row-actions"><button className="icon-button" onClick={() => inspect(event)} title="Inspect"><Eye size={15} /></button><button className="icon-button" onClick={() => replay(event.id)} title="Replay"><RotateCcw size={15} /></button></span></div>)}</div> : <Empty icon={<Activity size={22} />} title="No matching deliveries" copy="Change the filters or send an event to this workspace." />}</section>
    {filtered.length > pageSize ? <nav className="table-pagination" aria-label="Delivery pages"><span>Page {page} of {pageCount}</span><div><button className="icon-button" disabled={page === 1} onClick={() => setPage((value) => value - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button><button className="icon-button" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)} aria-label="Next page"><ChevronRight size={16} /></button></div></nav> : null}
  </>;
}

export function EventTypesView({ data, busy, submit }: { data: DashboardData; busy: string; submit: DashboardSubmit }) {
  return <><SectionHead eyebrow="Event catalog" heading="Event types" copy="Define the event names customers can subscribe to." /><section className="split-layout"><form className="content-card form-card" onSubmit={(event) => submit(event, "/api/event-types", (form) => ({ name: form.get("name"), description: form.get("description") }))}><h3>Add event type</h3><label>Name<input name="name" required placeholder="invoice.payment_failed" /></label><label>Description<textarea name="description" placeholder="When this event is emitted" /></label><button className="button primary" disabled={busy === "/api/event-types"}><Plus size={16} /> Save event type</button></form><section className="content-card list-card">{data.eventTypes.length ? <div className="resource-list">{data.eventTypes.map((item) => <article key={item.id}><span className="resource-icon"><Braces size={18} /></span><div><strong>{item.name}</strong><small>{item.description || "No description"}</small></div><span>{data.endpoints.filter((endpoint) => endpoint.event_types.includes(item.name)).length} subscribers</span></article>)}</div> : <Empty icon={<Braces size={22} />} title="No event types" copy="Add event types to make endpoint subscriptions easier to manage." />}</section></section></>;
}