"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Laptop, LoaderCircle, LogOut, RefreshCw, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { SectionHead } from "@/components/dashboard/common";

type Session = { id: string; created_at: string; last_seen_at: string; expires_at: string; user_agent: string | null; ip_address: string | null; is_current: boolean };
type History = { id: string; action: string; metadata: Record<string, unknown>; created_at: string };

const actionLabels: Record<string, string> = {
  "account.login_succeeded": "Signed in",
  "account.email_verified": "Email verified",
  "account.verification_email_sent": "Verification email sent",
  "account.password_reset": "Password reset",
  "account.session_revoked": "Device session revoked",
  "account.other_sessions_revoked": "Other device sessions revoked",
  "account.all_sessions_revoked": "All device sessions revoked",
  "account.oauth_login_succeeded": "Provider sign-in completed"
};

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return "Unknown device";
  const browser = userAgent.includes("Edg/") ? "Edge" : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Firefox/") ? "Firefox" : userAgent.includes("Safari/") ? "Safari" : "Browser";
  const system = userAgent.includes("Windows") ? "Windows" : userAgent.includes("Android") ? "Android" : userAgent.includes("iPhone") || userAgent.includes("iPad") ? "iOS" : userAgent.includes("Mac OS") ? "macOS" : userAgent.includes("Linux") ? "Linux" : "Unknown OS";
  return `${browser} on ${system}`;
}
function isMobile(userAgent: string | null) { return Boolean(userAgent && /Android|iPhone|iPad/i.test(userAgent)); }

export function AccountSecurityView() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const response = await fetch("/api/auth/sessions", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) setError(payload.error || "Could not load account security");
    else { setSessions(payload.sessions || []); setHistory(payload.history || []); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function revoke(body: { sessionId?: string; scope?: "others" | "all" }, key: string) {
    const confirmation = body.scope === "all" ? "Sign out every device, including this one?" : body.scope === "others" ? "Sign out all other devices?" : "Revoke this device session?";
    if (!window.confirm(confirmation)) return;
    setBusy(key); setError("");
    const response = await fetch("/api/auth/sessions", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) { setError(payload.error || "Could not revoke session"); return; }
    if (payload.signedOut) { window.location.href = "/login"; return; }
    await load();
  }

  return <><SectionHead eyebrow="Personal security" heading="Account security" copy="Review signed-in devices, revoke access, and inspect your private account security history." action={<button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={15} /> Refresh</button>} />
    {error ? <div className="operations-error"><TriangleAlert size={17} />{error}</div> : null}
    {loading ? <section className="content-card operations-loading"><LoaderCircle className="spin" size={22} /><span>Loading account security</span></section> : <>
      <section className="content-card account-security-card"><div className="card-head"><div><span className="section-label">Signed-in devices</span><h3>Active sessions</h3></div><div className="account-security-actions"><button className="button secondary small" disabled={sessions.length < 2 || Boolean(busy)} onClick={() => void revoke({ scope: "others" }, "others")}><LogOut size={14} /> Sign out other devices</button><button className="button danger small" disabled={Boolean(busy)} onClick={() => void revoke({ scope: "all" }, "all")}><LogOut size={14} /> Sign out everywhere</button></div></div>
        <div className="session-list">{sessions.map((session) => <article key={session.id}><span className="session-device">{isMobile(session.user_agent) ? <Smartphone size={19} /> : <Laptop size={19} />}</span><div><strong>{deviceLabel(session.user_agent)} {session.is_current ? <em>Current</em> : null}</strong><p>{session.ip_address || "IP unavailable"} · Last active {new Date(session.last_seen_at).toLocaleString()}</p><small>Session expires {new Date(session.expires_at).toLocaleString()}</small></div>{session.is_current ? <span className="session-current"><CheckCircle2 size={14} /> Active now</span> : <button className="button secondary small" disabled={Boolean(busy)} onClick={() => void revoke({ sessionId: session.id }, session.id)}>Revoke</button>}</article>)}</div>
      </section>
      <section className="content-card account-security-card"><div className="card-head"><div><span className="section-label">Private history</span><h3>Recent security activity</h3></div><ShieldCheck size={20} /></div><div className="security-history">{history.length ? history.map((item) => <article key={item.id}><span><ShieldCheck size={15} /></span><div><strong>{actionLabels[item.action] || item.action}</strong><small>{new Date(item.created_at).toLocaleString()}</small></div></article>) : <p>No account security activity has been recorded yet.</p>}</div></section>
    </>}
  </>;
}
