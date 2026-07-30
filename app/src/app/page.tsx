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
  latency_ms: number | null;
  error: string | null;
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
      if (document.visibilityState === "visible") {
        loadDashboard();
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const events = useMemo(() => {
    if (!data) return [];
    return providerFilter === "all" ? data.events : data.events.filter((event) => event.provider === providerFilter);
  }, [data, providerFilter]);

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
          <button className="secondary" onClick={() => loadDashboard(true)}>Refresh now</button>
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
                <div><strong style={{ padding: "2px" }}>{event.event_type}</strong><span>{event.provider} · {event.provider_event_id || event.id}</span></div>
                <div><strong style={{ padding: "2px" }}>{endpoint?.name || "Endpoint"}</strong><span>{timeAgo(event.received_at)}</span></div>
                <div><strong style={{ padding: "2px" }} className={`status ${statusClass(event.status)}`}>{formatStatus(event.status)}</strong><span>{responseSummary(event)}</span></div>
                <button className="secondary" onClick={() => replay(event.id)}>Replay</button>
              </article>
            );
          }) : <p className="empty">No webhook events yet. Send a POST request to one of your HookIn endpoint URLs.</p>}
        </div>
      </section>
    </main>
  );
}
