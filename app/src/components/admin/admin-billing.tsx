"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleDollarSign, LoaderCircle, RefreshCw, Search } from "lucide-react";

type BillingTransaction = {
  id: string; workspace_name: string; workspace_slug: string; provider: string;
  provider_order_id: string; provider_payment_id: string; plan: string; amount: number;
  currency: string; status: string; paid_at: string; refunded_amount: number;
  entitlement_status: string | null; current_period_end: string | null;
};

type BillingData = {
  summary: { total: number; captured_amount: string | number; refunds: number; disputes: number };
  transactions: BillingTransaction[];
};

function money(amount: number | string, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(Number(amount) / 100);
}

export function AdminBilling() {
  const [data, setData] = useState<BillingData | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ q: query.trim(), status, limit: String(limit) });
      const response = await fetch(`/api/admin/billing?${params}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load billing records");
      setData(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load billing records"); }
    finally { setBusy(false); }
  }, [limit, query, status]);

  useEffect(() => { void load(); }, [load]);

  return <>
    <div className="admin-heading"><span className="section-label">Commercial operations</span><h1>Billing ledger</h1><p>Reconcile verified purchases and workspace entitlements without exposing provider credentials.</p></div>
    {error ? <div className="alert-banner"><span>{error}</span></div> : null}
    <section className="admin-metrics billing-metrics">
      <article className="content-card"><span><CircleDollarSign /></span><div><small>Recorded payments</small><strong>{data?.summary.total ?? 0}</strong></div></article>
      <article className="content-card"><div><small>Captured value</small><strong>{money(data?.summary.captured_amount ?? 0)}</strong></div></article>
      <article className="content-card"><div><small>Refund records</small><strong>{data?.summary.refunds ?? 0}</strong></div></article>
      <article className="content-card"><div><small>Disputes</small><strong>{data?.summary.disputes ?? 0}</strong></div></article>
    </section>
    <form className="billing-search" onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Workspace, order, or payment ID" /></label>
      <select aria-label="Payment status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="captured">Captured</option><option value="partially_refunded">Partially refunded</option><option value="refunded">Refunded</option><option value="disputed">Disputed</option></select>
      <select aria-label="Rows per page" value={limit} onChange={(event) => setLimit(Number(event.target.value))}>{[25, 50, 75, 100].map((value) => <option value={value} key={value}>{value} rows</option>)}</select>
      <button className="icon-button" title="Refresh billing records" disabled={busy}><RefreshCw className={busy ? "spin" : ""} size={17} /></button>
    </form>
    <section className="content-card billing-ledger">
      <header><span>Workspace</span><span>Payment</span><span>Plan</span><span>Amount</span><span>Status</span><span>Paid</span><span>Entitlement</span></header>
      {busy && !data ? <div className="admin-loading"><LoaderCircle className="spin" size={18} /> Loading billing ledger</div> : data?.transactions.length ? data.transactions.map((item) => <article key={item.id}>
        <div><strong>{item.workspace_name}</strong><small>{item.workspace_slug}</small></div>
        <div><code>{item.provider_payment_id}</code><small>{item.provider} · {item.provider_order_id}</small></div>
        <span>{item.plan}</span><strong>{money(item.amount, item.currency)}</strong>
        <i className={`billing-status ${item.status}`}>{item.status.replaceAll("_", " ")}</i>
        <time>{new Date(item.paid_at).toLocaleString()}</time>
        <div><strong>{item.entitlement_status || "Not linked"}</strong><small>{item.current_period_end ? `until ${new Date(item.current_period_end).toLocaleDateString()}` : "No active period"}</small></div>
      </article>) : <p className="support-empty">No verified purchases match these filters.</p>}
    </section>
  </>;
}
