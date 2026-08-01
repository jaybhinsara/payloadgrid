"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/brand";
export function PasswordRecovery({ mode }: { mode: "forgot" | "reset" }) {
  const search = useSearchParams(); const [loading, setLoading] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(""); const form = new FormData(event.currentTarget);
    const body = mode === "forgot" ? { email: form.get("email") } : { token: search.get("token"), password: form.get("password") };
    const response = await fetch(`/api/auth/${mode === "forgot" ? "forgot-password" : "reset-password"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})); setLoading(false);
    if (!response.ok) { setError(payload.error || "Could not continue"); return; }
    setMessage(mode === "forgot" ? payload.message : "Password updated. You can sign in with the new password.");
  }
  return <main className="recovery-shell"><Link href="/"><Brand /></Link><section className="recovery-card"><span className="section-label">Account recovery</span><h1>{mode === "forgot" ? "Reset your password" : "Choose a new password"}</h1><p>{mode === "forgot" ? "Enter your account email. The response is the same whether the address exists or not." : "The reset link expires after one hour and can only be used once."}</p>{message ? <div className="auth-notice"><CheckCircle2 size={20} /><strong>{message}</strong><Link href="/login">Return to sign in</Link></div> : <form onSubmit={submit}>{mode === "forgot" ? <label>Email address<input name="email" type="email" required autoComplete="email" /></label> : <label>New password<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" /></label>}{error ? <div className="form-error">{error}</div> : null}<button className="button primary wide" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : null}{mode === "forgot" ? "Send reset link" : "Update password"}<ArrowRight size={17} /></button></form>}</section></main>;
}