"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

export type EmbeddedEvent = {
  id: string; eventType: string; endpointName: string; status: string;
  responseStatus: number | null; latencyMs: number | null; receivedAt: string; simulation: boolean;
};

export function EmbedDeliveryTable({ initialEvents, token, canReplay }: { initialEvents: EmbeddedEvent[]; token: string; canReplay: boolean }) {
  const [events, setEvents] = useState(initialEvents);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function replay(eventId: string) {
    setBusy(eventId); setError("");
    try {
      const response = await fetch(`/api/embed/events/${eventId}/replay`, { method: "POST", headers: { authorization: `Embed ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Replay failed");
      setEvents((current) => current.map((item) => item.id === eventId ? { ...item, status: "queued" } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Replay failed"); }
    finally { setBusy(""); }
  }
  return <>{error ? <div className="embed-notice">{error}</div> : null}<div className="embed-table"><div className={`embed-row embed-head ${canReplay ? "with-actions" : ""}`}><span>Event</span><span>Endpoint</span><span>Status</span><span>Response</span><span>Received</span>{canReplay ? <span>Action</span> : null}</div>{events.map((event) => <div className={`embed-row ${canReplay ? "with-actions" : ""}`} key={event.id}><span><strong>{event.eventType}</strong><small>{event.id.slice(0, 12)}{event.simulation ? " · simulation" : ""}</small></span><span>{event.endpointName}</span><span><i className={`embed-status ${event.status}`}>{event.status.replaceAll("_", " ")}</i></span><span>{event.responseStatus ? `HTTP ${event.responseStatus} · ${event.latencyMs || 0}ms` : "Pending"}</span><time>{new Date(event.receivedAt).toLocaleString()}</time>{canReplay ? <button className="embed-action" disabled={busy === event.id || !["delivered", "failed", "dead_letter", "cancelled"].includes(event.status)} onClick={() => void replay(event.id)}><RotateCcw size={13} /> {busy === event.id ? "Queueing" : "Replay"}</button> : null}</div>)}</div></>;
}
