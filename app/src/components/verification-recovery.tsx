"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/brand";

const errors: Record<string, string> = {
  "missing-verification-token": "This verification link is incomplete. Request a new link below.",
  "invalid-verification-link": "This verification link is invalid, expired, or already used. Request a new link below."
};

export function VerificationRecovery() {
  const search = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(errors[search.get("error") || ""] || "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email") }) });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || "Could not send a verification email"); return; }
    setMessage(payload.message);
  }

  return <main className="recovery-shell"><Link href="/"><Brand /></Link><section className="recovery-card"><span className="section-label">Email verification</span><h1>Request a new link</h1><p>Verification links expire after 24 hours and can only be used once.</p>{message ? <div className="auth-notice"><CheckCircle2 size={20} /><strong>{message}</strong><Link href="/login">Return to sign in</Link></div> : <form onSubmit={submit}><label>Email address<input name="email" type="email" required autoComplete="email" /></label>{error ? <div className="form-error">{error}</div> : null}<button className="button primary wide" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : null}Send verification link<ArrowRight size={17} /></button></form>}</section></main>;
}
