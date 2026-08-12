"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Send, X } from "lucide-react";

export function CatalogTestButton({ applicationId, eventType, payload, version }: { applicationId: string; eventType: string; payload: unknown; version: number }) {
  const [open, setOpen] = useState(false);
  const [editor, setEditor] = useState(JSON.stringify(payload ?? {}, null, 2));
  const [state, setState] = useState<"idle"|"sending"|"success"|"error">("idle");
  const [message, setMessage] = useState("");
  useEffect(()=>{setEditor(JSON.stringify(payload??{},null,2));setState("idle");setMessage("");},[payload,version]);
  async function send() {
    let parsed: unknown;
    try { parsed=JSON.parse(editor); } catch { setState("error");setMessage("Payload must be valid JSON.");return; }
    setState("sending"); setMessage("");
    const response = await fetch("/api/catalog/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId, eventType, payload: parsed }) });
    const result = await response.json().catch(() => ({}));
    if(response.ok){const warnings=Array.isArray(result.validationWarnings)?result.validationWarnings.length:0;setState("success");setMessage(`Accepted as ${String(result.messageId||"").slice(0,12)} · ${Number(result.queuedDeliveries||0)} deliveries${warnings?` · ${warnings} contract warnings`:""}`);}
    else{setState("error");setMessage(result.error||"Sign in with access to this project to send a test.");}
  }
  return <div className="catalog-test"><button className="button secondary" onClick={()=>setOpen(true)}><Send size={15}/> Edit and test</button>{open?<div className="modal-backdrop catalog-test-backdrop" onMouseDown={()=>setOpen(false)}><section className="catalog-test-modal" role="dialog" aria-modal="true" aria-labelledby={`test-${eventType}`} onMouseDown={(event)=>event.stopPropagation()}><header><div><span>Signed test delivery · v{version}</span><h2 id={`test-${eventType}`}>{eventType}</h2><p>Edit this payload and send it as a simulation through the signed delivery pipeline. Simulations stay outside production health metrics and alerts.</p></div><button className="icon-button" onClick={()=>setOpen(false)} aria-label="Close test delivery"><X size={18}/></button></header><label>JSON payload<textarea className="code-input" value={editor} onChange={(event)=>{setEditor(event.target.value);setState("idle");setMessage("");}} spellCheck={false}/></label>{message?<div className={`catalog-test-result ${state}`}>{message}</div>:null}<footer><button className="button secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="button primary" onClick={()=>void send()} disabled={state==="sending"}>{state==="sending"?<LoaderCircle className="spin" size={15}/>:<Send size={15}/>} Send signed test</button></footer></section></div>:null}</div>;
}
