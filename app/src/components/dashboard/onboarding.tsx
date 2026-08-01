"use client";

import { FormEvent, useMemo, useState } from "react";
import { AppWindow, ArrowRight, Check, LoaderCircle, Route, Send, X } from "lucide-react";
import type { DashboardData, DashboardMutate, View } from "@/components/dashboard/types";

export function OnboardingWizard({ data, mutate, close, goTo }: { data: DashboardData; mutate: DashboardMutate; close: () => void; goTo: (view: View) => void }) {
  const [provider, setProvider] = useState("custom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [testSent, setTestSent] = useState(data.events.length > 0);
  const activeEndpoints = data.endpoints.filter((endpoint) => endpoint.is_active);
  const step = data.applications.length === 0 ? 1 : data.endpoints.length === 0 ? 2 : !testSent && data.events.length === 0 ? 3 : 4;
  const progress = useMemo(() => [1, 2, 3].map((number) => ({ number, done: step > number, active: step === number })), [step]);

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
      providerSecret: form.get("providerSecret") || undefined, destinationUrl: form.get("destinationUrl"), eventTypes: []
    }));
  }

  async function sendTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const endpointId = String(form.get("endpointId"));
    const result = await run(() => mutate(`/api/endpoints/${endpointId}/test`));
    if (result) setTestSent(true);
  }

  function finish(view?: View) { if (view) goTo(view); close(); }

  return <div className="onboarding-backdrop"><section className="onboarding-shell" aria-modal="true" role="dialog" aria-labelledby="onboarding-title">
    <header><div><span className="section-label">Workspace setup</span><h2 id="onboarding-title">Deliver your first webhook</h2><p>Configure a real route and verify delivery before integrating the API.</p></div><button className="icon-button" onClick={close} aria-label="Close onboarding"><X size={19} /></button></header>
    <div className="onboarding-progress">{progress.map(({ number, done, active }) => <span key={number} className={done ? "done" : active ? "active" : ""}><i>{done ? <Check size={13} /> : number}</i><strong>{number === 1 ? "Application" : number === 2 ? "Endpoint" : "Test"}</strong></span>)}</div>
    {error ? <div className="inline-error">{error}</div> : null}
    <div className="onboarding-body">
      {step === 1 ? <form onSubmit={createApplication}><span className="onboarding-icon"><AppWindow size={21} /></span><h3>Create an application</h3><p>Applications group endpoints and events for one product, customer, or environment.</p><label>Application name<input name="name" required autoFocus placeholder="Production application" /></label><label>Description<textarea name="description" placeholder="Customer webhooks for the production API" /></label><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />} Continue</button></form> : null}
      {step === 2 ? <form onSubmit={createEndpoint}><span className="onboarding-icon"><Route size={21} /></span><h3>Add the first endpoint</h3><p>PayloadGrid will sign and deliver events to this public HTTPS destination.</p><label>Application<select name="applicationId" required defaultValue={data.applications[0]?.id}>{data.applications.map((application) => <option value={application.id} key={application.id}>{application.name}</option>)}</select></label><label>Endpoint name<input name="name" required autoFocus placeholder="Production webhook handler" /></label><label>Source provider<select value={provider} onChange={(event) => setProvider(event.target.value)}>{data.providers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>{provider !== "custom" ? <label>Provider verification secret<small>Encrypted before storage.</small><input name="providerSecret" type="password" required autoComplete="off" /></label> : null}<label>Destination URL<input name="destinationUrl" type="url" required placeholder="https://api.example.com/webhooks" /></label><button className="button primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />} Create endpoint</button></form> : null}
      {step === 3 ? <form onSubmit={sendTest}><span className="onboarding-icon"><Send size={21} /></span><h3>Send a test delivery</h3><p>A signed <code>payloadgrid.test</code> event will be queued and sent to the selected endpoint.</p><label>Endpoint<select name="endpointId" required defaultValue={activeEndpoints[0]?.id}>{activeEndpoints.map((endpoint) => <option value={endpoint.id} key={endpoint.id}>{endpoint.name}</option>)}</select></label>{!activeEndpoints.length ? <div className="onboarding-warning">All endpoints are paused. <button type="button" onClick={() => finish("endpoints")}>Resume an endpoint</button></div> : null}<div className="test-payload"><span>EVENT</span><code>payloadgrid.test</code><span>QUEUE</span><code>{data.system.queueConfigured ? "durable" : "fallback"}</code></div><button className="button primary" disabled={busy || activeEndpoints.length === 0}>{busy ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />} Send test webhook</button></form> : null}
      {step === 4 ? <div className="onboarding-complete"><span><Check size={24} /></span><h3>Your first route is ready</h3><p>Inspect the test attempt, copy the inbound URL, or create an API key for outbound messages.</p><div><button className="button primary" onClick={() => finish("deliveries")}>View delivery <ArrowRight size={16} /></button><button className="button secondary" onClick={() => finish("endpoints")}>Manage endpoint</button></div></div> : null}
    </div>
  </section></div>;
}