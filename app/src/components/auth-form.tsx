"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/brand";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import type { OAuthProvider } from "@/lib/oauth";

const authErrors: Record<string, string> = {
  "missing-verification-token": "This verification link is incomplete. Request a new link from sign in.",
  "invalid-verification-link": "This verification link is invalid, expired, or already used. Sign in to request a new one.",
  oauth_cancelled: "Provider sign-in was cancelled.",
  oauth_not_configured: "That sign-in provider is not available yet.",
  oauth_state_invalid: "This sign-in attempt expired. Please try again.",
  oauth_callback_invalid: "The provider returned an incomplete sign-in response.",
  oauth_exchange_failed: "The provider could not complete sign-in. Please try again.",
  oauth_profile_invalid: "We could not verify the provider account.",
  oauth_email_required: "A verified email address is required to continue.",
  oauth_invitation_invalid: "This invitation is invalid, expired, or belongs to another email.",
  oauth_account_conflict: "That provider account is already linked to another user.",
  oauth_provider_invalid: "That sign-in provider is not supported.",
  oauth_failed: "Provider sign-in failed. Please try again."
};

function ProviderIcon({ provider }: { provider: OAuthProvider }) {
  if (provider === "google") return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.4a4.7 4.7 0 0 1-2 3v2.8h3.3c1.9-1.8 2.9-4.4 2.9-7.9Z"/><path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.8c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.6-4.1H3v2.9A10 10 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.4 13.7a6 6 0 0 1 0-3.8V7H3a10 10 0 0 0 0 9.6l3.4-2.9Z"/><path fill="#ea4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3 7l3.4 2.9A5.9 5.9 0 0 1 12 5.9Z"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 2.9.9.1-.7.4-1.1.7-1.3-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .9-.3 2.8 1a9.8 9.8 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1.1 2.7c0 3.9-2.4 4.7-4.7 5 .4.3.7 1 .7 2V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z"/></svg>;
}

export function AuthForm({ mode, providers }: { mode: "login" | "signup"; providers: OAuthProvider[] }) {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState(() => authErrors[search.get("error") || ""] || "");
  const [notice, setNotice] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState<"company" | "individual">("company");
  const signup = mode === "signup";
  const inviteToken = search.get("invite") || "";
  const returnTo = search.get("next") || "";

  function oauthHref(provider: OAuthProvider) {
    const query = new URLSearchParams();
    if (inviteToken) query.set("invite", inviteToken);
    if (returnTo) query.set("next", returnTo);
    const suffix = query.toString();
    return `/api/auth/oauth/${provider}${suffix ? `?${suffix}` : ""}`;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(""); setVerificationRequired(false);
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form.entries());
    const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, inviteToken: inviteToken || undefined }) });
    const payload = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) { setError(payload.error || "Could not continue"); setVerificationRequired(payload.code === "EMAIL_VERIFICATION_REQUIRED"); return; }
    if (payload.requiresVerification) {
      setNotice(payload.emailSent ? "Check your inbox and verify your email before signing in." : "Your workspace was created, but the verification email could not be sent. Contact support.");
      return;
    }
    router.push(returnTo || "/dashboard");
    router.refresh();
  }

  const switchQuery = new URLSearchParams();
  if (inviteToken) switchQuery.set("invite", inviteToken);
  if (returnTo) switchQuery.set("next", returnTo);
  const switchPath = signup ? "/login" : "/signup";
  const switchHref = `${switchPath}${switchQuery.size ? `?${switchQuery}` : ""}`;

  return <main className="auth-shell">
    <section className="auth-aside">
      <Brand />
      <div className="auth-message"><span className="signal-label">Reliable by design</span><h1>Every event delivered. Every failure explained.</h1><p>One control plane for outbound webhooks, inbound provider callbacks, retries, signatures, and customer endpoints.</p></div>
      <div className="delivery-path" aria-hidden="true"><span>YOUR API</span><i /><span>PAYLOADGRID</span><i /><span>CUSTOMER</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        <div className="mobile-brand"><Brand /></div>
        <span className="section-label">{inviteToken ? "Workspace invitation" : signup ? "Start building" : "Welcome back"}</span>
        <h2>{inviteToken ? "Join your team on PayloadGrid" : signup ? "Create your PayloadGrid workspace" : "Sign in to PayloadGrid"}</h2>
        <p>{inviteToken ? "Use the invited email to join the existing workspace." : signup ? "Your first production project and application are created automatically." : "Manage your applications and webhook delivery."}</p>
        {notice ? <div className="auth-notice"><CheckCircle2 size={20} /><strong>{notice}</strong><Link href="/login">Go to sign in</Link></div> : <>
          {providers.length ? <div className="oauth-options">
            {providers.map((provider) => <a className="oauth-button" href={oauthHref(provider)} key={provider}><ProviderIcon provider={provider} /><span>Continue with {provider[0].toUpperCase() + provider.slice(1)}</span></a>)}
          </div> : null}
          {providers.length ? <div className="auth-divider"><span>or continue with email</span></div> : null}
          <form onSubmit={submit}>
            {signup ? <label>Full name<input name="name" autoComplete="name" required minLength={2} placeholder="Jane Smith" /></label> : null}
            {signup ? <fieldset className="account-type-field"><legend>Account type</legend><div className="account-type-options"><label><input type="radio" name="accountType" value="company" checked={accountType === "company"} onChange={() => setAccountType("company")} /><span><strong>Company</strong><small>For a registered business or team</small></span></label><label><input type="radio" name="accountType" value="individual" checked={accountType === "individual"} onChange={() => setAccountType("individual")} /><span><strong>Individual</strong><small>For personal projects and evaluation</small></span></label></div></fieldset> : null}
            {signup && !inviteToken ? <label>Workspace name<input name="organizationName" autoComplete="organization" required minLength={2} placeholder={accountType === "company" ? "Acme engineering" : "Jane's workspace"} /></label> : null}
            {signup && !inviteToken && accountType === "company" ? <label>Registered company name<input name="legalName" autoComplete="organization" required minLength={2} placeholder="Acme Technologies Ltd" /></label> : null}
            {signup && !inviteToken && accountType === "company" ? <label>Company website <span className="optional-label">Optional</span><input name="website" type="url" autoComplete="url" placeholder="https://acme.com" /></label> : null}
            <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@company.com" /></label>
            {signup ? <label>Country or region<select name="countryCode" autoComplete="country" required defaultValue=""><option value="" disabled>Select your country or region</option>{COUNTRY_OPTIONS.map((country) => <option key={country.code} value={country.code}>{country.name} ({country.code})</option>)}</select><small className="field-help">Used for account, billing, and regional defaults. You can change it later.</small></label> : null}
            <label>Password<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 10 : 1} placeholder={signup ? "At least 10 characters" : "Your password"} /></label>
            {signup ? <label className="auth-consent"><input name="acceptTerms" type="checkbox" required /><span>I agree to the <Link href="/terms" target="_blank">Terms</Link> and acknowledge the <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span></label> : null}
            {!signup ? <Link className="forgot-link" href="/forgot-password">Forgot password?</Link> : null}
            {error ? <div className="form-error">{error}{verificationRequired ? <Link href="/verify-email">Request another verification link</Link> : null}</div> : null}
            <button className="button primary wide" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18} /> : null}{inviteToken ? "Join workspace" : signup ? "Create workspace" : "Sign in"}<ArrowRight size={17} /></button>
          </form>
        </>}
        <p className="auth-switch">{signup ? "Already have an account?" : "New to PayloadGrid?"} <Link href={switchHref}>{signup ? "Sign in" : "Create a workspace"}</Link></p>
      </div>
    </section>
  </main>;
}
