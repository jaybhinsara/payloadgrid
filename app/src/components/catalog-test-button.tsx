"use client";
import { useState } from "react";
import { Send } from "lucide-react";

export function CatalogTestButton({ applicationId, eventType, payload }: { applicationId: string; eventType: string; payload: unknown }) {
  const [state, setState] = useState("");
  async function send() {
    setState("Sending");
    const response = await fetch("/api/catalog/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId, eventType, payload }) });
    const result = await response.json().catch(() => ({}));
    setState(response.ok ? `Accepted · ${result.queuedDeliveries || 0} deliveries` : result.error || "Sign in to send a test");
  }
  return <div className="catalog-test"><button className="button secondary" onClick={() => void send()} disabled={state === "Sending"}><Send size={15} /> Send signed test</button>{state ? <small>{state}</small> : null}</div>;
}
