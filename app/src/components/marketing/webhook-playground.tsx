"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Clock3, Copy, Inbox, LoaderCircle, Radio, RefreshCw, Send } from "lucide-react";

const presets = {
  "payment.captured": { paymentId: "pay_demo_8921", amount: 9999, currency: "USD" },
  "order.completed": { orderId: "order_demo_184", status: "completed" },
  "invoice.payment_failed": { invoiceId: "inv_demo_204", attempt: 1 },
};

type EventType = keyof typeof presets;
type InboxSession = { token: string; ingestUrl: string; expiresAt: string; maxRequests: number };
type CapturedRequest = { id: string; method: string; content_type: string | null; headers: Record<string, string>; body_text: string; size_bytes: number; received_at: string };
const STORAGE_KEY = "payloadgrid-playground-inbox";

function prettyBody(value: string) {
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value || "(empty body)"; }
}
function expiresIn(value?: string) {
  if (!value) return "";
  const minutes = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 60000));
  return `${minutes} min left`;
}

export function WebhookPlayground() {
  const [eventType, setEventType] = useState<EventType>("payment.captured");
  const [payload, setPayload] = useState(JSON.stringify(presets["payment.captured"], null, 2));
  const [session, setSession] = useState<InboxSession | null>(null);
  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"url" | "curl" | null>(null);

  const createInbox = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/playground/inboxes", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to create an inbox");
      const next = result as InboxSession;
      setSession(next); setRequests([]); setSelectedId(null); setRequestCount(0);
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to create an inbox"); }
    finally { setLoading(false); }
  }, []);

  const refreshInbox = useCallback(async (activeSession: InboxSession, quiet = false) => {
    try {
      const response = await fetch(`/api/playground/inboxes/${activeSession.token}`, { cache: "no-store" });
      const result = await response.json();
      if (response.status === 410 || response.status === 404) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        await createInbox();
        return;
      }
      if (!response.ok) throw new Error(result.error || "Unable to refresh this inbox");
      const nextRequests = result.requests as CapturedRequest[];
      setRequests(nextRequests); setRequestCount(Number(result.requestCount || 0));
      setSelectedId((current) => current && nextRequests.some((item) => item.id === current) ? current : nextRequests[0]?.id || null);
      setError("");
    } catch (cause) { if (!quiet) setError(cause instanceof Error ? cause.message : "Unable to refresh this inbox"); }
  }, [createInbox]);

  useEffect(() => {
    const saved = window.sessionStorage.getItem(STORAGE_KEY);
    if (!saved) { void createInbox(); return; }
    try {
      const parsed = JSON.parse(saved) as InboxSession;
      setSession(parsed);
      void refreshInbox(parsed).finally(() => setLoading(false));
    } catch { window.sessionStorage.removeItem(STORAGE_KEY); void createInbox(); }
  }, [createInbox, refreshInbox]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => void refreshInbox(session, true), 2000);
    return () => window.clearInterval(timer);
  }, [refreshInbox, session]);

  const selected = requests.find((item) => item.id === selectedId) || null;
  const curl = useMemo(() => session ? `curl -X POST '${session.ingestUrl}' \\\n+  -H 'Content-Type: application/json' \\\n+  -H 'X-Event-Type: ${eventType}' \\\n+  --data-raw '${payload.replaceAll("'", "'\\''")}'` : "", [eventType, payload, session]);

  function selectPreset(value: EventType) { setEventType(value); setPayload(JSON.stringify(presets[value], null, 2)); }
  async function sendSample() {
    if (!session) return;
    try { JSON.parse(payload); } catch { setError("The sample body must contain valid JSON."); return; }
    setSending(true); setError("");
    try {
      const response = await fetch(session.ingestUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Event-Type": eventType, "X-Request-Id": crypto.randomUUID() }, body: payload });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Request failed with HTTP ${response.status}`);
      await refreshInbox(session);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The sample request failed"); }
    finally { setSending(false); }
  }
  async function copy(value: string, kind: "url" | "curl") {
    await navigator.clipboard.writeText(value); setCopied(kind); window.setTimeout(() => setCopied(null), 1400);
  }

  return <div className="live-playground">
    <header className="playground-inbox-bar">
      <div><span className="playground-live"><Radio size={14} /> LIVE INBOX</span><strong>{loading ? "Creating a secure temporary URL..." : session?.ingestUrl || "Inbox unavailable"}</strong>{session ? <small><Clock3 size={12} /> {expiresIn(session.expiresAt)} · {requestCount}/{session.maxRequests} requests</small> : null}</div>
      <div><button className="button compact" type="button" disabled={!session} onClick={() => session && void copy(session.ingestUrl, "url")}>{copied === "url" ? <Check size={15} /> : <Copy size={15} />} {copied === "url" ? "Copied" : "Copy URL"}</button><button className="icon-button" type="button" title="Create a new inbox" onClick={() => void createInbox()} disabled={loading}><RefreshCw size={16} /></button></div>
    </header>
    {error ? <div className="playground-error">{error}</div> : null}
    <div className="playground-grid playground-live-grid">
      <section className="playground-editor">
        <div className="playground-toolbar"><span>REQUEST BUILDER</span><em>real HTTP POST</em></div>
        <label>Event type<select value={eventType} onChange={(event) => selectPreset(event.target.value as EventType)} disabled={sending}>{Object.keys(presets).map((key) => <option key={key}>{key}</option>)}</select></label>
        <label>JSON payload<textarea value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} disabled={sending} /></label>
        <button className="button primary large" onClick={() => void sendSample()} disabled={sending || loading || !session}>{sending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />} Send real test webhook</button>
        <div className="playground-curl"><div><span>RUN FROM YOUR TERMINAL</span><button type="button" onClick={() => void copy(curl, "curl")} title="Copy cURL"><Copy size={14} /></button></div><pre>{curl || "Creating endpoint..."}</pre></div>
      </section>
      <section className="playground-output">
        <div className="playground-toolbar"><span>CAPTURED REQUESTS</span><em>{requests.length ? `${requests.length} received` : "listening"}</em></div>
        {requests.length ? <><div className="playground-request-list">{requests.map((item) => <button type="button" className={item.id === selectedId ? "selected" : ""} key={item.id} onClick={() => setSelectedId(item.id)}><span>{item.method}</span><strong>{item.headers["x-event-type"] || item.content_type || "webhook"}</strong><time>{new Date(item.received_at).toLocaleTimeString()}</time></button>)}</div>{selected ? <div className="playground-inspector"><div><span>HTTP request captured</span><strong>202 Accepted</strong></div><dl><div><dt>Content type</dt><dd>{selected.content_type || "Not provided"}</dd></div><div><dt>Body size</dt><dd>{selected.size_bytes.toLocaleString()} bytes</dd></div></dl><details open><summary>Request body</summary><pre>{prettyBody(selected.body_text)}</pre></details><details><summary>Safe request headers</summary><pre>{JSON.stringify(selected.headers, null, 2)}</pre></details></div> : null}</> : <div className="playground-waiting"><Inbox size={28} /><strong>Waiting for a webhook</strong><p>Send the sample request or POST to the temporary URL from any HTTP client. New requests appear here automatically.</p></div>}
      </section>
    </div>
    <footer className="playground-privacy">Temporary playground data expires automatically. Authorization, cookie, and other sensitive headers are never retained.</footer>
  </div>;
}
