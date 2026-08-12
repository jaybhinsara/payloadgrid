"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Ban, Braces, ChevronLeft, ChevronRight, Eye, History, LoaderCircle, MessageSquareText, Plus, RotateCcw, Search, Send, X } from "lucide-react";
import { Empty, SectionHead, Status, timeAgo } from "@/components/dashboard/common";
import type { DashboardData, DashboardMutate, DashboardSubmit, EventRow } from "@/components/dashboard/types";

const REPLAYABLE_STATUSES = new Set(["delivered", "failed", "dead_letter", "resolved", "cancelled"]);
const CANCELLABLE_STATUSES = new Set(["queued", "received", "retrying"]);

export function MessagesView({ data, busy, submit }: { data: DashboardData; busy: string; submit: DashboardSubmit }) {
  const appName = (id: string) => data.applications.find((app) => app.id === id)?.name || "Application";
  const availableEventTypes = Array.from(new Set([
    ...data.eventTypes.map((item) => item.name),
    ...data.endpoints.flatMap((endpoint) => endpoint.event_types),
    ...data.messages.map((message) => message.event_type)
  ])).sort();
  return <><SectionHead eyebrow="Outbound API" heading="Messages" copy="Send one event and PayloadGrid will route it to every matching endpoint." /><section className="split-layout message-layout"><form className="content-card form-card" onSubmit={(event) => submit(event, "/api/messages", (form) => ({ applicationId: form.get("applicationId"), eventType: form.get("eventType"), payload: JSON.parse(String(form.get("payload"))) }))}><h3>Send test event</h3><label>Application<select name="applicationId" required defaultValue=""><option value="" disabled>Select application</option>{data.applications.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}</select></label><label>Event type<select name="eventType" required defaultValue=""><option value="" disabled>{availableEventTypes.length ? "Select event type" : "Add an event type first"}</option>{availableEventTypes.map((eventType) => <option key={eventType} value={eventType}>{eventType}</option>)}</select></label><label>JSON payload<textarea className="code-input" name="payload" required defaultValue={'{\n  "orderId": "order_123",\n  "status": "completed"\n}'} /></label><button className="button primary" disabled={busy === "/api/messages"}><Send size={16} /> Send message</button></form><section className="content-card table-card"><div className="card-head"><h3>Message history</h3><span>{data.messages.length} messages</span></div>{data.messages.length ? <div className="compact-list">{data.messages.map((message) => <article key={message.id}><span className="resource-icon"><MessageSquareText size={17} /></span><div><strong>{message.event_type}</strong><small>{appName(message.application_id)} · {message.id.slice(0, 8)}</small><small className={message.validation_warnings?.length ? "message-contract warning" : "message-contract"}>{message.contract_version ? `Contract v${message.contract_version} · ${message.validation_warnings?.length ? `${message.validation_warnings.length} warning${message.validation_warnings.length === 1 ? "" : "s"}` : "valid"}` : "No published contract"}</small></div><Status value={message.status} /><time>{timeAgo(message.created_at)}</time></article>)}</div> : <Empty icon={<Send size={22} />} title="No outbound messages" copy="Send a test event here or use the authenticated REST API." />}</section></section></>;
}

export function DeliveriesView({ initialEvents, endpoints, inspect, replay, mutate, refreshVersion }: { initialEvents: EventRow[]; endpoints: DashboardData["endpoints"]; inspect: (event: EventRow) => void; replay: (id: string) => Promise<Record<string, unknown> | null>; mutate: DashboardMutate; refreshVersion: number }) {
  const [events, setEvents] = useState(initialEvents.slice(0, 20));
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [direction, setDirection] = useState("all");
  const [endpointId, setEndpointId] = useState("all");
  const [eventType, setEventType] = useState("");
  const [payloadPath, setPayloadPath] = useState("");
  const [payloadValue, setPayloadValue] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [replayRate, setReplayRate] = useState(120);
  const [replayBatch, setReplayBatch] = useState("");
  const [replayProgress, setReplayProgress] = useState<{ delivered: number; failed: number; pending: number; status: string } | null>(null);
  const [replayMax, setReplayMax] = useState(100);
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
  useEffect(() => { setCursorHistory([]); }, [debouncedSearch, status, direction, endpointId, eventType, payloadPath, payloadValue, headerName, headerValue]);
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
    if (eventType) params.set("eventType", eventType);
    if (payloadPath) params.set("payloadPath", payloadPath);
    if (payloadPath && payloadValue) params.set("payloadValue", payloadValue);
    if (headerName) params.set("headerName", headerName);
    if (headerName && headerValue) params.set("headerValue", headerValue);
    if (cursor) params.set("cursor", cursor);
    setLoading(true); setError(""); setNextCursor(null);
    fetch(`/api/deliveries?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "Could not load deliveries"); return payload; })
      .then((payload) => { setEvents(payload.events || []); setNextCursor(payload.nextCursor || null); setSelected(new Set()); })
      .catch((cause) => { if (cause instanceof Error && cause.name !== "AbortError") setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cursor, debouncedSearch, direction, endpointId, eventType, payloadPath, payloadValue, headerName, headerValue, reload, status]);
  useEffect(() => {
    if (!replayBatch) return;
    let active = true;
    let timer: number | undefined;
    const poll = async () => { const response=await fetch(`/api/events/bulk-replay?batchId=${replayBatch}`,{cache:"no-store"}); const payload=await response.json().catch(()=>({})); if(active&&response.ok){const status=String(payload.batch.status||"running");setReplayProgress({delivered:Number(payload.batch.delivered||0),failed:Number(payload.batch.failed||0),pending:Number(payload.batch.pending||0),status});if(status!=="running"&&timer)window.clearInterval(timer);} };
    void poll(); timer=window.setInterval(()=>void poll(),3000); return()=>{active=false;if(timer)window.clearInterval(timer);};
  }, [replayBatch]);

  const selectable = useMemo(() => events.filter((event) => REPLAYABLE_STATUSES.has(event.status) || CANCELLABLE_STATUSES.has(event.status)), [events]);
  const selectedEvents = useMemo(() => events.filter((event) => selected.has(event.id)), [events, selected]);
  const canReplaySelection = selectedEvents.length > 0 && selectedEvents.every((event) => REPLAYABLE_STATUSES.has(event.status));
  const canCancelSelection = selectedEvents.length > 0 && selectedEvents.every((event) => CANCELLABLE_STATUSES.has(event.status));
  const allSelected = selectable.length > 0 && selectable.every((event) => selected.has(event.id));
  function toggle(id: string) { setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function togglePage() { setSelected(allSelected ? new Set() : new Set(selectable.map((event) => event.id))); }
  async function replayOne(id: string) { const payload = await replay(id); if (payload) { setNotice("Replay accepted. Delivery state will update automatically."); setReload((value) => value + 1); } }
  async function replaySelected() {
    const payload = await mutate("/api/events/bulk-replay", { eventIds: [...selected], rateLimitPerMinute: replayRate, maxEvents: selected.size });
    if (payload) { setReplayBatch(String(payload.batchId || "")); setNotice(`${Number(payload.accepted || 0)} deduplicated deliveries accepted at ${replayRate}/minute.`); setSelected(new Set()); setReload((value) => value + 1); }
  }
  async function replayFiltered() {
    const filters: Record<string,string> = {};
    if(status!=="all"&&["delivered","failed","dead_letter","cancelled"].includes(status))filters.status=status;
    if(direction!=="all")filters.direction=direction;
    if(endpointId!=="all")filters.endpointId=endpointId;
    if(eventType)filters.eventType=eventType;
    if(payloadPath){filters.payloadPath=payloadPath;if(payloadValue)filters.payloadValue=payloadValue;}
    if(headerName){filters.headerName=headerName;if(headerValue)filters.headerValue=headerValue;}
    const payload=await mutate("/api/events/bulk-replay",{filters,maxEvents:replayMax,rateLimitPerMinute:replayRate});
    if(payload){setReplayBatch(String(payload.batchId));setNotice(`${Number(payload.accepted||0)} matching deliveries accepted for controlled replay.`);}
  }
  async function cancelSelected() {
    if (!window.confirm(`Cancel ${selected.size} selected deliveries? They will not be retried.`)) return;
    const payload = await mutate("/api/events/bulk-cancel", { eventIds: [...selected], maxEvents: selected.size });
    if (payload) { setNotice(`${Number(payload.cancelled || 0)} deliveries cancelled.`); setSelected(new Set()); setReload((value) => value + 1); }
  }
  async function cancelFiltered() {
    if (!CANCELLABLE_STATUSES.has(status)) return;
    const filters: Record<string,string> = { status };
    if(direction!=="all")filters.direction=direction;
    if(endpointId!=="all")filters.endpointId=endpointId;
    if(eventType)filters.eventType=eventType;
    if(payloadPath){filters.payloadPath=payloadPath;if(payloadValue)filters.payloadValue=payloadValue;}
    if(headerName){filters.headerName=headerName;if(headerValue)filters.headerValue=headerValue;}
    if (!window.confirm(`Cancel all matching ${status} deliveries, up to 5,000? They will not be retried.`)) return;
    const payload = await mutate("/api/events/bulk-cancel", { filters, maxEvents: 5000 });
    if (payload) { setNotice(`${Number(payload.cancelled || 0)} matching deliveries cancelled.${payload.limitReached ? " The 5,000-event safety limit was reached; run the action again for any remaining matches." : ""}`); setReload((value) => value + 1); }
  }

  return <><SectionHead eyebrow="Delivery operations" heading="Deliveries" copy="Inspect complete attempt history, control retries, and recover dead-lettered events." />
    {notice ? <div className="view-notice">{notice}<button onClick={() => setNotice("")}>Dismiss</button></div> : null}
    {error ? <div className="inline-error">{error}</div> : null}
    <section className="delivery-filters" aria-label="Delivery filters">
      <div className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search event or endpoint" /></div>
      <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["queued", "processing", "retrying", "delivered", "failed", "dead_letter", "resolved", "cancelled", "received"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}</select>
      <select aria-label="Filter by direction" value={direction} onChange={(event) => setDirection(event.target.value)}><option value="all">All directions</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select>
      <select aria-label="Filter by endpoint" value={endpointId} onChange={(event) => setEndpointId(event.target.value)}><option value="all">All endpoints</option>{endpoints.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.name}</option>)}</select>
      <input aria-label="Filter by event type" value={eventType} onChange={(event) => setEventType(event.target.value)} placeholder="Event type" />
      <input aria-label="JSON payload path" value={payloadPath} onChange={(event) => setPayloadPath(event.target.value)} placeholder="Payload path: order.id" />
      <input aria-label="JSON payload value" value={payloadValue} onChange={(event) => setPayloadValue(event.target.value)} placeholder="Payload value" disabled={!payloadPath} />
      <input aria-label="Header name" value={headerName} onChange={(event) => setHeaderName(event.target.value)} placeholder="Header: x-request-id" />
      <input aria-label="Header value" value={headerValue} onChange={(event) => setHeaderValue(event.target.value)} placeholder="Header value" disabled={!headerName} />
    </section>
    <section className="filtered-replay"><span><strong>Bulk operations</strong> Replay terminal deliveries or cancel pending retries using the current structured filters.</span><label>Maximum <input type="number" min="1" max="500" value={replayMax} onChange={(event)=>setReplayMax(Number(event.target.value))}/></label><label>Rate/min <input type="number" min="1" max="10000" value={replayRate} onChange={(event)=>setReplayRate(Number(event.target.value))}/></label><button className="button secondary small" onClick={()=>void replayFiltered()}><RotateCcw size={14}/> Replay matching</button>{CANCELLABLE_STATUSES.has(status)?<button className="button danger small" onClick={()=>void cancelFiltered()}><Ban size={14}/> Cancel matching</button>:null}</section>
    {selected.size ? <section className="bulk-toolbar"><strong>{selected.size} selected</strong>{canReplaySelection?<label>Rate/min <input type="number" min="1" max="10000" value={replayRate} onChange={(event) => setReplayRate(Number(event.target.value))} /></label>:null}<button className="button secondary small" onClick={() => setSelected(new Set())}>Clear</button>{canCancelSelection?<button className="button danger small" onClick={() => void cancelSelected()}><Ban size={14} /> Cancel selected</button>:null}{canReplaySelection?<button className="button primary small" disabled={selected.size > 500} onClick={() => void replaySelected()}><RotateCcw size={14} /> Start controlled replay</button>:null}</section> : null}
    {replayBatch ? <section className="view-notice"><span>Replay batch <code>{replayBatch.slice(0,12)}</code> · {replayProgress?`${replayProgress.delivered} delivered · ${replayProgress.pending} pending · ${replayProgress.failed} failed · ${replayProgress.status}`:"Loading progress…"}</span>{!replayProgress||replayProgress.status==="running"?<button onClick={() => void mutate("/api/events/bulk-replay", { batchId: replayBatch }, "PATCH").then((value) => {if(value){setReplayBatch("");setReplayProgress(null);}})}>Cancel batch</button>:<button onClick={()=>{setReplayBatch("");setReplayProgress(null);}}>Dismiss</button>}</section> : null}
    <section ref={tableRef} className="content-card delivery-list" aria-busy={loading}>{events.length ? <div className="data-table delivery-table operations-table"><div className="table-header"><span><input type="checkbox" checked={allSelected} onChange={togglePage} aria-label="Select page" /></span><span>Event</span><span>Direction</span><span>Endpoint</span><span>Status</span><span>Response</span><span>Attempts</span><span>Time</span><span /></div>{events.map((event) => <div className="table-row" key={event.id}><span><input type="checkbox" checked={selected.has(event.id)} disabled={!REPLAYABLE_STATUSES.has(event.status) && !CANCELLABLE_STATUSES.has(event.status)} onChange={() => toggle(event.id)} aria-label={`Select ${event.event_type}`} /></span><span><strong>{event.event_type}</strong><small>{event.provider_event_id || event.id.slice(0, 12)}</small></span><span><i className="direction-pill">{event.direction}</i></span><span>{event.endpoint_name}</span><span><Status value={event.status} /></span><span>{event.response_status ? `HTTP ${event.response_status}` : event.error || event.last_error || "No response"}</span><span>{event.attempt_count}/{event.max_retries}</span><span>{timeAgo(event.received_at)}</span><span className="row-actions"><button className="icon-button" onClick={() => inspect(event)} title="Inspect attempts"><Eye size={15} /></button><button className="icon-button" disabled={!REPLAYABLE_STATUSES.has(event.status)} onClick={() => void replayOne(event.id)} title="Replay"><RotateCcw size={15} /></button></span></div>)}</div> : <Empty icon={<Activity size={22} />} title="No matching deliveries" copy="Change the filters or send an event to this workspace." />}</section>
    <nav className="table-pagination" aria-label="Delivery pages"><span>Page {cursorHistory.length + 1}</span><div><button className="icon-button" disabled={!cursorHistory.length || loading} onClick={() => setCursorHistory((value) => value.slice(0, -1))} aria-label="Previous page"><ChevronLeft size={16} /></button><button className="icon-button" disabled={!nextCursor || loading} onClick={() => nextCursor && setCursorHistory((value) => [...value, nextCursor])} aria-label="Next page"><ChevronRight size={16} /></button></div></nav>
  </>;
}

type EventContract = DashboardData["eventTypes"][number];
type ContractVersion = { version: number; schema: Record<string, unknown>; example: unknown; compatibility_mode: "backward" | "none"; compatibility_warnings: string[]; status: string; created_at: string; published_at: string | null };

export function EventTypesView({ data, busy, submit, mutate }: { data: DashboardData; busy: string; submit: DashboardSubmit; mutate: DashboardMutate }) {
  const [selected, setSelected] = useState<EventContract | null>(null);
  const defaultSchema = JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { id: { type: "string" } }, required: ["id"] }, null, 2);
  return <><SectionHead eyebrow="Versioned contracts" heading="Event catalog" copy="Publish standard JSON Schema contracts. Validation produces warnings without blocking delivery." /><section className="split-layout contract-layout"><form className="content-card form-card" onSubmit={(event) => submit(event, "/api/event-types", (form) => ({ applicationId: form.get("applicationId"), name: form.get("name"), description: form.get("description"), schema: JSON.parse(String(form.get("schema"))), example: JSON.parse(String(form.get("example"))), compatibilityMode: form.get("compatibilityMode") }))}><h3>Create event contract</h3><label>Application<select name="applicationId" required defaultValue=""><option value="" disabled>Select application</option>{data.applications.map((app)=><option key={app.id} value={app.id}>{app.name}</option>)}</select></label><label>Name<input name="name" required placeholder="invoice.payment_failed" /></label><label>Description<input name="description" placeholder="When this event is emitted" /></label><label>Compatibility<select name="compatibilityMode" defaultValue="backward"><option value="backward">Backward compatible</option><option value="none">No compatibility policy</option></select></label><label>JSON Schema<textarea className="code-input" name="schema" required defaultValue={defaultSchema}/></label><label>Example payload<textarea className="code-input small" name="example" required defaultValue={'{\n  "id": "evt_123"\n}'}/></label><button className="button primary" disabled={busy === "/api/event-types"}>{busy === "/api/event-types" ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} Publish v1</button></form><section className="content-card list-card"><div className="card-head"><div><h3>Published contracts</h3><span>{data.eventTypes.length} event types</span></div></div>{data.eventTypes.length ? <div className="contract-list">{data.eventTypes.map((item) => {const app=data.applications.find((value)=>value.id===item.application_id);const warningCount=item.compatibility_warnings?.length||0;return <article key={item.id}><span className="resource-icon"><Braces size={18} /></span><div><strong>{item.name}</strong><small>{app?.name||"Workspace"} · {item.description||"No description"}</small><span className={warningCount ? "contract-version warning" : "contract-version"}>v{item.current_version||1} · {warningCount ? `${warningCount} compatibility warning${warningCount===1?"":"s"}` : "compatible"}</span></div><span>{data.endpoints.filter((endpoint)=>endpoint.event_types.includes(item.name)).length} subscribers</span><div className="contract-actions"><button className="button secondary small" type="button" onClick={()=>setSelected(item)}><History size={14}/> Manage versions</button>{app?<a className="button secondary small" href={`/catalog/${app.uid}`} target="_blank" rel="noreferrer">View docs</a>:null}</div></article>;})}</div> : <Empty icon={<Braces size={22} />} title="No event contracts" copy="Publish a contract to generate validation and application documentation." />}</section></section>{selected?<ContractDrawer contract={selected} busy={busy} mutate={mutate} close={()=>setSelected(null)}/>:null}</>;
}

function ContractDrawer({ contract, busy, mutate, close }: { contract: EventContract; busy: string; mutate: DashboardMutate; close: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [versions, setVersions] = useState<ContractVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ nextVersion: number; warnings: string[] } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/event-types/${contract.id}`, { cache: "no-store", signal: controller.signal }).then(async(response)=>{const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Could not load contract history");setVersions(payload.versions||[]);}).catch((cause)=>{if(cause instanceof Error&&cause.name!=="AbortError")setError(cause.message);}).finally(()=>setLoading(false));
    return()=>controller.abort();
  },[contract.id]);
  function readForm() {
    if (!formRef.current) throw new Error("Contract editor is unavailable");
    const form = new FormData(formRef.current);
    return { schema: JSON.parse(String(form.get("schema"))), example: JSON.parse(String(form.get("example"))), compatibilityMode: String(form.get("compatibilityMode")) };
  }
  async function checkCompatibility() {
    try {
      setError("");
      const response=await fetch(`/api/event-types/${contract.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({...readForm(),dryRun:true})});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||"Compatibility check failed");
      setPreview({nextVersion:Number(payload.nextVersion),warnings:Array.isArray(payload.compatibilityWarnings)?payload.compatibilityWarnings:[]});
    } catch(cause){setError(cause instanceof Error?cause.message:"Compatibility check failed");}
  }
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const body=readForm();
      const response=await fetch(`/api/event-types/${contract.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({...body,dryRun:true})});
      const checked=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(checked.error||"Compatibility check failed");
      const warnings=Array.isArray(checked.compatibilityWarnings)?checked.compatibilityWarnings:[];
      setPreview({nextVersion:Number(checked.nextVersion),warnings});
      if(warnings.length&&!window.confirm(`Version ${checked.nextVersion} has ${warnings.length} compatibility warning${warnings.length===1?"":"s"}. Publish it anyway?`))return;
      const result=await mutate(`/api/event-types/${contract.id}`,body,"PATCH");
      if(result)close();
    } catch(cause){setError(cause instanceof Error?cause.message:"Contract could not be published");}
  }
  return <div className="drawer-backdrop" onMouseDown={close}><aside className="endpoint-drawer contract-drawer" onMouseDown={(event)=>event.stopPropagation()}><header><div><span className="section-label">Event contract</span><h2>{contract.name}</h2><p>Current version v{contract.current_version||1}</p></div><button className="icon-button" onClick={close} aria-label="Close contract manager"><X size={19}/></button></header>{error?<div className="inline-error contract-error">{error}</div>:null}<form ref={formRef} onSubmit={publish}><label>Compatibility policy<select name="compatibilityMode" defaultValue={contract.compatibility_mode||"backward"}><option value="backward">Backward compatible</option><option value="none">No compatibility policy</option></select></label><label>JSON Schema<small>JSON Schema draft 2020-12. Delivery warnings are recorded but never block the event.</small><textarea className="code-input contract-schema-input" name="schema" required defaultValue={JSON.stringify(contract.schema||{},null,2)}/></label><label>Example payload<textarea className="code-input small" name="example" required defaultValue={JSON.stringify(contract.example??{},null,2)}/></label>{preview?<section className={preview.warnings.length?"compatibility-preview warning":"compatibility-preview compatible"}><strong>Version {preview.nextVersion}: {preview.warnings.length?`${preview.warnings.length} warning${preview.warnings.length===1?"":"s"}`:"backward compatible"}</strong>{preview.warnings.map((warning)=><span key={warning}>{warning}</span>)}</section>:null}<div className="contract-editor-actions"><button className="button secondary" type="button" onClick={()=>void checkCompatibility()}>Check compatibility</button><button className="button primary" disabled={busy===`/api/event-types/${contract.id}`}>{busy===`/api/event-types/${contract.id}`?<LoaderCircle className="spin" size={16}/>:<Plus size={16}/>} Publish v{(contract.current_version||1)+1}</button></div></form><section className="contract-history"><div className="card-head"><div><span className="section-label">History</span><h3>Published versions</h3></div></div>{loading?<div className="operations-loading"><LoaderCircle className="spin" size={18}/> Loading versions</div>:versions.map((version)=><article key={version.version}><div><strong>Version {version.version}</strong><small>{version.published_at?new Date(version.published_at).toLocaleString():new Date(version.created_at).toLocaleString()} · {version.compatibility_mode}</small></div><span className={version.compatibility_warnings?.length?"contract-version warning":"contract-version"}>{version.compatibility_warnings?.length?`${version.compatibility_warnings.length} warnings`:"Compatible"}</span></article>)}</section></aside></div>;
}
