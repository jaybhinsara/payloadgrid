"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Copy, LoaderCircle, Play, RefreshCw, ShieldCheck } from "lucide-react";

const presets = {
  "payment.captured": { event: "payment.captured", payload: { paymentId: "pay_demo_8921", amount: 9999, currency: "USD" } },
  "order.completed": { event: "order.completed", payload: { orderId: "order_demo_184", status: "completed" } },
  "invoice.payment_failed": { event: "invoice.payment_failed", payload: { invoiceId: "inv_demo_204", attempt: 1 } }
};
type Phase = "idle" | "accepted" | "failed" | "retrying" | "delivered";
async function signature(secret: string, id: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const value = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}
export function WebhookPlayground() {
  const [eventType, setEventType] = useState<keyof typeof presets>("payment.captured");
  const [payload, setPayload] = useState(JSON.stringify(presets["payment.captured"].payload, null, 2));
  const [phase, setPhase] = useState<Phase>("idle"); const [signed, setSigned] = useState(""); const [copied, setCopied] = useState(false);
  const timeline = useMemo(() => [
    { state: "accepted", label: "Accepted and recorded", detail: "202 · msg_demo_01" },
    { state: "failed", label: "Destination unavailable", detail: "503 · 912ms" },
    { state: "retrying", label: "Retry scheduled", detail: "backoff · 1 minute" },
    { state: "delivered", label: "Destination recovered", detail: "200 · 184ms" }
  ], []);
  function selectPreset(value: keyof typeof presets) { setEventType(value); setPayload(JSON.stringify(presets[value].payload, null, 2)); setPhase("idle"); setSigned(""); }
  async function run() {
    try { JSON.parse(payload); } catch { setPhase("idle"); return; }
    const id = `evt_demo_${Date.now().toString(36)}`; const timestamp = Math.floor(Date.now() / 1000).toString();
    setSigned(`v1,${await signature("whsec_demo_only", id, timestamp, payload)}`); setPhase("accepted");
    window.setTimeout(() => setPhase("failed"), 500); window.setTimeout(() => setPhase("retrying"), 1050); window.setTimeout(() => setPhase("delivered"), 1800);
  }
  const reached = (state: string) => ["accepted", "failed", "retrying", "delivered"].indexOf(state) <= ["accepted", "failed", "retrying", "delivered"].indexOf(phase);
  async function copySignature() { await navigator.clipboard.writeText(signed); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }
  return <div className="playground-grid"><section className="playground-editor"><div className="playground-toolbar"><span>LOCAL EVENT</span><em>No network request</em></div><label>Event type<select value={eventType} onChange={(event) => selectPreset(event.target.value as keyof typeof presets)}>{Object.keys(presets).map((key) => <option key={key}>{key}</option>)}</select></label><label>JSON payload<textarea value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} /></label><button className="button primary large" onClick={run} disabled={phase !== "idle" && phase !== "delivered"}>{phase !== "idle" && phase !== "delivered" ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />} Run delivery simulation</button></section><section className="playground-output"><div className="playground-toolbar"><span>DELIVERY LIFECYCLE</span><em className={phase === "delivered" ? "done" : ""}>{phase}</em></div><div className="simulation-timeline">{timeline.map((item, index) => <article className={reached(item.state) ? "reached" : ""} key={item.state}><span>{reached(item.state) ? item.state === "delivered" ? <CheckCircle2 size={16} /> : <RefreshCw size={15} /> : index + 1}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div></article>)}</div><div className="signature-preview"><div><ShieldCheck size={17} /><strong>PayloadGrid signature</strong>{signed ? <button className="icon-button" onClick={copySignature} title="Copy signature"><Copy size={14} /></button> : null}</div><code>{signed || "Run the simulation to sign this payload."}</code>{copied ? <span>Copied</span> : null}</div></section></div>;
}