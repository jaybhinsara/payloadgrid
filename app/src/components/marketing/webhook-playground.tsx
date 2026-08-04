"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Copy, LoaderCircle, Play, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";

const presets = {
  "payment.captured": { payload: { paymentId: "pay_demo_8921", amount: 9999, currency: "USD" } },
  "order.completed": { payload: { orderId: "order_demo_184", status: "completed" } },
  "invoice.payment_failed": { payload: { invoiceId: "inv_demo_204", attempt: 1 } }
};

type EventType = keyof typeof presets;
type Phase = "accepted" | "verified" | "routed" | "failed" | "retrying" | "delivered";
type TimelineStep = { state: Phase; label: string; detail: string };

const scenarios: Record<EventType, (messageId: string) => TimelineStep[]> = {
  "payment.captured": (messageId) => [
    { state: "accepted", label: "Payment event recorded", detail: `202 · ${messageId}` },
    { state: "routed", label: "Payment endpoint matched", detail: "subscription · payment.*" },
    { state: "verified", label: "Payload signed", detail: "HMAC-SHA256 · v1" },
    { state: "delivered", label: "Delivered on first attempt", detail: "200 · 184ms" }
  ],
  "order.completed": (messageId) => [
    { state: "accepted", label: "Order event recorded", detail: `202 · ${messageId}` },
    { state: "routed", label: "Order processor matched", detail: "subscription · order.*" },
    { state: "verified", label: "Payload signed", detail: "HMAC-SHA256 · v1" },
    { state: "delivered", label: "Accepted by destination", detail: "202 · 241ms" }
  ],
  "invoice.payment_failed": (messageId) => [
    { state: "accepted", label: "Invoice event recorded", detail: `202 · ${messageId}` },
    { state: "failed", label: "Billing endpoint unavailable", detail: "503 · 912ms" },
    { state: "retrying", label: "Automatic retry scheduled", detail: "backoff · 1 minute" },
    { state: "delivered", label: "Delivered after recovery", detail: "200 · attempt 2" }
  ]
};

async function signature(secret: string, id: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const value = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return btoa(String.fromCharCode(...new Uint8Array(value)));
}

export function WebhookPlayground() {
  const [eventType, setEventType] = useState<EventType>("payment.captured");
  const [payload, setPayload] = useState(JSON.stringify(presets["payment.captured"].payload, null, 2));
  const [messageId, setMessageId] = useState("msg_demo_01");
  const [currentStep, setCurrentStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [signed, setSigned] = useState("");
  const [copied, setCopied] = useState(false);
  const timers = useRef<number[]>([]);
  const timeline = useMemo(() => scenarios[eventType](messageId), [eventType, messageId]);

  function clearTimers() {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }

  useEffect(() => clearTimers, []);

  function selectPreset(value: EventType) {
    clearTimers();
    setEventType(value);
    setPayload(JSON.stringify(presets[value].payload, null, 2));
    setMessageId("msg_demo_01");
    setCurrentStep(-1);
    setRunning(false);
    setSigned("");
  }

  async function run() {
    try {
      JSON.parse(payload);
    } catch {
      setCurrentStep(-1);
      return;
    }

    clearTimers();
    setRunning(true);
    const id = `msg_demo_${Date.now().toString(36)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const steps = scenarios[eventType](id);

    setMessageId(id);
    setSigned(`v1,${await signature("whsec_demo_only", id, timestamp, payload)}`);
    setCurrentStep(0);

    steps.slice(1).forEach((_, index) => {
      const step = index + 1;
      timers.current.push(window.setTimeout(() => {
        setCurrentStep(step);
        if (step === steps.length - 1) setRunning(false);
      }, step * 550));
    });
  }

  async function copySignature() {
    await navigator.clipboard.writeText(signed);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const phase = currentStep >= 0 ? timeline[currentStep].state : "idle";

  return <div className="playground-grid">
    <section className="playground-editor">
      <div className="playground-toolbar"><span>LOCAL EVENT</span><em>No network request</em></div>
      <label>Event type
        <select value={eventType} onChange={(event) => selectPreset(event.target.value as EventType)} disabled={running}>
          {Object.keys(presets).map((key) => <option key={key}>{key}</option>)}
        </select>
      </label>
      <label>JSON payload
        <textarea value={payload} onChange={(event) => setPayload(event.target.value)} spellCheck={false} disabled={running} />
      </label>
      <button className="button primary large" onClick={run} disabled={running}>
        {running ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />} Run delivery simulation
      </button>
    </section>
    <section className="playground-output">
      <div className="playground-toolbar"><span>DELIVERY LIFECYCLE</span><em className={phase === "delivered" ? "done" : ""}>{phase}</em></div>
      <div className="simulation-timeline">
        {timeline.map((item, index) => {
          const reached = index <= currentStep;
          return <article className={reached ? `reached ${item.state}` : ""} key={`${item.state}-${index}`}>
            <span>{!reached ? index + 1 : item.state === "failed" ? <TriangleAlert size={15} /> : item.state === "retrying" ? <RefreshCw size={15} /> : <CheckCircle2 size={16} />}</span>
            <div><strong>{item.label}</strong><small>{item.detail}</small></div>
          </article>;
        })}
      </div>
      <div className="signature-preview">
        <div><ShieldCheck size={17} /><strong>PayloadGrid signature</strong>{signed ? <button className="icon-button" onClick={copySignature} title="Copy signature"><Copy size={14} /></button> : null}</div>
        <code>{signed || "Run the simulation to sign this payload."}</code>
        {copied ? <span>Copied</span> : null}
      </div>
    </section>
  </div>;
}
