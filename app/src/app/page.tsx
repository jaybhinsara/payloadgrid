"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Provider = { id: string; name: string; color: string; category: string };
type Endpoint = { id: string; name: string; provider: string; destination_url: string; is_active: boolean; created_at: string };
type EventRow = {
  id: string;
  endpoint_id: string;
  provider: string;
  provider_event_id: string | null;
  event_type: string;
  status: string;
  revenue_at_risk: number;
  received_at: string;
  response_status: number | null;
  response_body: string | null;
  latency_ms: number | null;
  error: string | null;
  attempt_count: number | null;
  request_headers: Record<string, unknown>;
  request_body: unknown;
};
type Dashboard = {
  ok: boolean;
  error?: string;
  appUrl: string;
  providers: Provider[];
  endpoints: Endpoint[];
  events: EventRow[];
  metrics: {
    totalEvents: number;
    openIncidents: number;
    successRate: number;
    avgLatency: number;
    revenueAtRisk: number;
    endpoints: number;
  };
};

function formatMoney(value: number) {
  return "₹" + Number(value || 0).toLocaleString("en-IN");
}

function statusClass(status: string) {
  return status.toLowerCase();
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function responseSummary(event: EventRow) {
  const response = event.response_status ? `Destination HTTP ${event.response_status}` : "No destination response";
  const detail = event.error || `${event.latency_ms || 0}ms`;
  return `${response} · ${detail}`;
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export default function Home() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerFilter, setProviderFilter] = useState("all");
  const [creating, setCreating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const loadDashboard = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      if (!payload.ok) {
        setError(payload.error || "Could not load dashboard");
        return;
      }
      setData(payload);
      setError(null);
      setLastUpdated(new Date());
    } finally {
      if (showRefreshing) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadDashboard();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const events = useMemo(() => {
    if (!data) return [];
    return providerFilter === "all" ? data.events : data.events.filter((event) => event.provider === providerFilter);
  }, [data, providerFilter]);

  const selectedEvent = useMemo(() => {
    if (!data || !selectedEventId) return null;
    return data.events.find((event) => event.id === selectedEventId) || null;
  }, [data, selectedEventId]);

  async function copyText(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedValue(label);
    window.setTimeout(() => setCopiedValue(null), 1600);
  }

  async function createEndpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/endpoints", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        provider: form.get("provider"),
        destinationUrl: form.get("destinationUrl")
      })
    });
    const payload = await response.json();
    setCreating(false);
    if (!payload.ok) {
      setError(payload.error || "Endpoint creation failed");
      return;
    }
    event.currentTarget.reset();
    await loadDashboard();
  }

  async function replay(id: string) {
    await fetch(`/api/events/${id}/replay`, { method: "POST" });
    await loadDashboard();
  }

  if (error && !data) {
    return (
      <main className="setup-screen">
        <section>
          <p className="eyebrow">Neon setup needed</p>
          <h1>Connect HookIn to Neon before using real webhook data.</h1>
          <p>{error}</p>
          <code>DATABASE_URL=postgresql://...</code>
          <p>Run the SQL in db/schema.sql from the Neon SQL editor, then restart the app.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace">
      <header className="masthead">
        <div>
          <p className="eyebrow">HookIn production dashboard</p>
          <h1>Real webhook events, stored in Neon and forwarded from Vercel.</h1>
          <p>Create an endpoint, paste the HookIn URL into Razorpay, Stripe, Cashfree, Shopify, or any provider, and inspect every delivery attempt.</p>
        </div>
        <div className="refresh-card">
          <small>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Waiting for data"}</small>
          <button className="secondary" onClick={() => loadDashboard(true)}>{refreshing ? "Refreshing" : "Refresh now"}</button>
        </div>
      </header>

      {error ? <div className="banner">{error}</div> : null}

      <section className="metrics-grid">
        <article><span>Revenue at risk</span><strong>{formatMoney(data?.metrics.revenueAtRisk || 0)}</strong></article>
        <article><span>Open incidents</span><strong>{data?.metrics.openIncidents || 0}</strong></article>
        <article><span>Delivery health</span><strong>{data?.metrics.successRate || 0}%</strong></article>
        <article><span>Avg latency</span><strong>{data?.metrics.avgLatency || 0}ms</strong></article>
      </section>

      <section className="main-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Create endpoint</p>
              <h2>Route provider callbacks through HookIn</h2>
            </div>
          </div>
          <form className="endpoint-form" onSubmit={createEndpoint}>
            <label>Endpoint name<input name="name" required placeholder="Razorpay production orders" /></label>
            <label>Provider<select name="provider">{data?.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
            <label>Destination URL<input name="destinationUrl" required placeholder="https://yourapp.com/api/webhooks/razorpay" /></label>
            <button className="primary" disabled={creating}>{creating ? "Creating..." : "Create endpoint"}</button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="section-kicker">Protected endpoints</p>
              <h2>{data?.endpoints.length || 0} active routes</h2>
            </div>
          </div>
          <div className="endpoint-list">
            {data?.endpoints.length ? data.endpoints.map((endpoint) => (
              <article className="endpoint-card" key={endpoint.id}>
                <strong>{endpoint.name}</strong>
                <span>{endpoint.provider}</span>
                <code>{data.appUrl}/in/{endpoint.id}</code>
                <button className="secondary compact" onClick={() => copyText("endpoint", `${data.appUrl}/in/${endpoint.id}`)}>{copiedValue === "endpoint" ? "Copied" : "Copy URL"}</button>
                <p>Forwards to {endpoint.destination_url}</p>
              </article>
            )) : <p className="empty">No endpoints yet. Create one to start receiving real webhook events.</p>}
          </div>
        </section>
      </section>

      <section className="panel events-panel">
        <div className="panel-head">
          <div>
            <p className="section-kicker">Event timeline</p>
            <h2>Live webhook deliveries</h2>
          </div>
          <div className="filters">
            <button className={providerFilter === "all" ? "active" : ""} onClick={() => setProviderFilter("all")}>All</button>
            {data?.providers.map((provider) => <button key={provider.id} className={providerFilter === provider.id ? "active" : ""} onClick={() => setProviderFilter(provider.id)}>{provider.name}</button>)}
          </div>
        </div>
        <div className="event-list">
          {events.length ? events.map((event) => {
            const endpoint = data?.endpoints.find((item) => item.id === event.endpoint_id);
            return (
              <article className="event-row" key={event.id}>
                <div><strong>{event.event_type}</strong><span>{event.provider} · {event.provider_event_id || event.id}</span></div>
                <div><strong>{endpoint?.name || "Endpoint"}</strong><span>{timeAgo(event.received_at)}</span></div>
                <div><strong className={`status ${statusClass(event.status)}`}>{formatStatus(event.status)}</strong><span>{responseSummary(event)}</span></div>
                <div className="event-actions"><button className="secondary" onClick={() => setSelectedEventId(event.id)}>Inspect</button><button className="secondary" onClick={() => replay(event.id)}>Replay</button></div>
              </article>
            );
          }) : <p className="empty">No webhook events yet. Send a POST request to one of your HookIn endpoint URLs.</p>}
        </div>
      </section>

      {selectedEvent ? (
        <aside className="drawer" aria-label="Event details">
          <div className="drawer-card">
            <div className="drawer-head">
              <div>
                <p className="section-kicker">Event details</p>
                <h2>{selectedEvent.event_type}</h2>
              </div>
              <button className="secondary compact" onClick={() => setSelectedEventId(null)}>Close</button>
            </div>
            <div className="detail-grid">
              <div><span>Status</span><strong>{formatStatus(selectedEvent.status)}</strong></div>
              <div><span>Provider</span><strong>{selectedEvent.provider}</strong></div>
              <div><span>Attempts</span><strong>{selectedEvent.attempt_count || 0}</strong></div>
              <div><span>Risk</span><strong>{formatMoney(selectedEvent.revenue_at_risk)}</strong></div>
            </div>
            <section className="detail-block">
              <div className="detail-title"><strong>Payload</strong><button className="secondary compact" onClick={() => copyText("payload", JSON.stringify(selectedEvent.request_body, null, 2))}>{copiedValue === "payload" ? "Copied" : "Copy"}</button></div>
              <pre>{JSON.stringify(selectedEvent.request_body, null, 2)}</pre>
            </section>
            <section className="detail-block">
              <div className="detail-title"><strong>Headers</strong><button className="secondary compact" onClick={() => copyText("headers", JSON.stringify(selectedEvent.request_headers, null, 2))}>{copiedValue === "headers" ? "Copied" : "Copy"}</button></div>
              <pre>{JSON.stringify(selectedEvent.request_headers, null, 2)}</pre>
            </section>
            <section className="detail-block">
              <div className="detail-title"><strong>Latest response</strong></div>
              <pre>{selectedEvent.response_body || selectedEvent.error || "No response body captured."}</pre>
            </section>
          </div>
        </aside>
      ) : null}
    </main>
  );
}
