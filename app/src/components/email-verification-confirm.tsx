"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/brand";

export function EmailVerificationConfirm() {
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get("token") || "";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? "" : "This verification link is incomplete. Request a new link below.");

  async function confirm() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/verify-email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setLoading(false);
      setError(payload.error || "This verification link is invalid, expired, or already used. Request a new link below.");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="recovery-shell">
      <Link href="/"><Brand /></Link>
      <section className="recovery-card">
        <span className="section-label">Email verification</span>
        <h1>Confirm your email</h1>
        <p>Confirming activates your PayloadGrid workspace and signs you in.</p>
        {error ? <div className="form-error">{error}</div> : null}
        {error
          ? <Link className="button primary wide" href="/verify-email">Request a new link<ArrowRight size={17} /></Link>
          : <button className="button primary wide" onClick={confirm} disabled={loading || !token}>
              {loading ? <LoaderCircle className="spin" size={18} /> : <CheckCircle2 size={18} />}
              Confirm email
              <ArrowRight size={17} />
            </button>}
      </section>
    </main>
  );
}
