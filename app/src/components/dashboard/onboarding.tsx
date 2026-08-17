"use client";

import { FormEvent, useMemo, useState } from "react";
import { AppWindow, ArrowRight, Check, Clipboard, KeyRound, LoaderCircle, Route, Send, X } from "lucide-react";
import type { DashboardData, DashboardMutate, View } from "@/components/dashboard/types";
import { ONBOARDING_TEMPLATES, onboardingTemplate } from "@/lib/onboarding";

export function OnboardingWizard({ data, mutate, close, goTo, revealKey }: { data: DashboardData; mutate: DashboardMutate; close: () => void; goTo: (view: View) => void; revealKey: (token: string) => void }) {
  const [provider, setProvider] = useState("custom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const template = onboardingTemplate(provider);
  const activeEndpoints = data.endpoints.filter((endpoint) => endpoint.is_active);
  const step = !data.activation.applicationCreated ? 1
    : !data.activation.endpointCreated ? 2
      : !data.activation.apiKeyCreated ? 3
        : !data.activation.deliverySucceeded ? 4
          : 5;
  const progress = useMemo(() => [
    { number: 1, label: "Application", done: data.activation.applicationCreated },
    { number: 2, label: "Endpoint", done: data.activation.endpointCreated },
    { number: 3, label: "API key", done: data.activation.apiKeyCreated },
    { number: 4, label: "Delivery", done: data.activation.deliverySucceeded }
  ].map((item) => ({ ...item, active: step === item.number })), [data.activation, step]);

  async function run(action: () => Promise<Record<string, unknown> | null>) {
    setBusy(true); setError("");
    try { const result = await action(); if (!result) setError("The setup step could not be completed."); return result; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Setup failed"); return null; }
    finally { setBusy(false); }
  }

  async function createApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run(() => mutate("/api/applications", { name: form.get("name"), description: form.get("description") }));
  }

  async function createEndpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await run(() => mutate("/api/endpoints", {
      applicationId: form.get("applicationId"), name: form.get("name"), provider,
      providerSecret: form.get("providerSecret") || undefined, destinationUrl: form.get("destinationUrl"),
      eventTypes: template.eventTypes, revenueTrackingMode: template.revenueTracking ? "automatic" : "disabled"
    }));
  }

  async function createApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const result = await run(() => mutate("/api/api-keys", { name: form.get("name"), scopes: ["messages:write", "events:read"] }));
    if (result?.token) revealKey(String(result.token));
  }

  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const endpointId = String(form.get("endpointId"));
    await run(() => mutate(`/api/endpoints/${endpointId}/test`));
  }

  function finish(view?: View) { if (view) goTo(view); close(); }

  return <div className="onboarding-backdrop"><section className="onboarding-shell" aria-modal="true" role="dialog" aria-labelledby="onboarding-title">
    <header><div><span className="section-label">Workspace activation</span><h2 id="onboarding-title">Deliver your first webhook</h2><p>Build one real route, authenticate your server, and confirm a successful delivery.</p></div><button className="icon-button" onClick={close} aria-label="Close onboarding"><X size={19} /></button></header>
    <div className="onboarding-progress">{progress.map(({ number, label, done, active }) => <span key={number} className={done ? "done" : active ? "active" : ""}><i>{done ? <Check size={13} /> : number}</i><strong>{label}</strong></span>)}</div>
    {error ? <div className="inline-error">{error}</div> : null}
    <div className="onboarding-body">
      {step === 1 ? <form onSubmit={createApplication}><span className="onboarding-icon"><AppWindow size={21} /></span><h3>Create an application</h3><p>Applications isolate endpoints and events for one product, customer, or environment.</p><label>Application name<input name="name" required autoFocus placeholder="Production application" /></label><label>Description<textarea name="description" placeholder="Customer events for the production API" /></label><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />} Continue</button></form> : null}
      {step === 2 ? <form key={provider} onSubmit={createEndpoint}><span className="onboarding-icon"><Route size={21} /></span><h3>Add the first endpoint</h3><p>Start from a provider preset or use the generic signed-delivery path.</p><div className="onboarding-templates" role="radiogroup" aria-label="Endpoint template">{ONBOARDING_TEMPLATES.map((item) => <button className={provider === item.provider ? "selected" : ""} type="button" role="radio" aria-checked={provider === item.provider} onClick={() => setProvider(item.provider)} key={item.provider}><strong>{item.name}</strong><small>{item.description}</small></button>)}</div><label>Application<select name="applicationId" required defaultValue={data.applications[0]?.id}>{data.applications.map((application) => <option value={application.id} key={application.id}>{application.name}</option>)}</select></label><label>Endpoint name<input name="name" required defaultValue={template.endpointName} /></label>{provider !== "custom" ? <label>Provider verification secret<small>Encrypted before storage and never displayed again.</small><input name="providerSecret" type="password" required autoComplete="off" placeholder={`${template.name} webhook secret`} /></label> : null}<label>Destination URL<input name="destinationUrl" type="url" required placeholder="https://api.example.com/webhooks" /></label><div className="onboarding-subscriptions"><span>Subscribed events</span>{template.eventTypes.map((eventType) => <code key={eventType}>{eventType}</code>)}</div><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />} Create endpoint</button></form> : null}
      {step === 3 ? <form onSubmit={createApiKey}><span className="onboarding-icon"><KeyRound size={21} /></span><h3>Authenticate your server</h3><p>Create a scoped key for sending messages and inspecting relay events. The secret is shown once.</p><label>Key name<input name="name" required autoFocus defaultValue="Production server" /></label><div className="onboarding-permissions"><span><Check size={14} /> Send single and batch messages</span><span><Check size={14} /> Read events for local relay and inspection</span></div><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />} Generate API key</button></form> : null}
      {step === 4 ? <form onSubmit={sendTest}><span className="onboarding-icon"><Send size={21} /></span><h3>{data.activation.eventAccepted ? "Confirm successful delivery" : "Send a test delivery"}</h3><p>{data.activation.eventAccepted ? "The event was accepted. PayloadGrid is waiting for the destination to return a successful 2xx response." : "A signed payloadgrid.test event will be queued and sent to the selected endpoint."}</p><label>Endpoint<select name="endpointId" required defaultValue={activeEndpoints[0]?.id}>{activeEndpoints.map((endpoint) => <option value={endpoint.id} key={endpoint.id}>{endpoint.name}</option>)}</select></label>{!activeEndpoints.length ? <div className="onboarding-warning">All endpoints are paused. <button type="button" onClick={() => finish("endpoints")}>Resume an endpoint</button></div> : null}<div className="test-payload"><span>EVENT</span><code>payloadgrid.test</code><span>QUEUE</span><code>{data.system.queueConfigured ? "durable" : "direct"}</code></div>{data.activation.eventAccepted ? <div className="onboarding-waiting"><LoaderCircle className="spin" size={16} /><span>Accepted. Waiting for HTTP 2xx; this view refreshes automatically.</span></div> : null}<button className="button primary" disabled={busy || activeEndpoints.length === 0}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} {data.activation.eventAccepted ? "Send another test" : "Send test webhook"}</button><button className="button secondary" type="button" onClick={() => finish("deliveries")}>Inspect delivery attempts</button></form> : null}
      {step === 5 ? <div className="onboarding-complete"><span><Check size={24} /></span><h3>Your workspace is activated</h3><p>A destination returned a successful response. Your application, endpoint, API access, and delivery path are ready.</p><div><button className="button primary" onClick={() => finish("messages")}>Send a real event <ArrowRight size={16} /></button><button className="button secondary" onClick={() => finish("deliveries")}><Clipboard size={15} /> View evidence</button></div></div> : null}
    </div>
  </section></div>;
}
