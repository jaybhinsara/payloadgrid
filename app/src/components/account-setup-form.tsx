"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";

type InitialProfile = {
  name: string;
  accountType: "individual" | "company";
  organizationName: string;
  legalName: string;
  website: string;
  countryCode: string;
};

export function AccountSetupForm({ initial }: { initial: InitialProfile }) {
  const router = useRouter();
  const [accountType, setAccountType] = useState(initial.accountType);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setLoading(true);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch("/api/auth/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...values, acceptTerms: values.acceptTerms === "on" }) });
    const payload = await response.json().catch(() => ({})); setLoading(false);
    if (!response.ok) { setError(payload.error || "Could not save account details"); return; }
    setNotice("Account details saved.");
    router.refresh();
  }

  return <div className="account-setup-card">
    <header><span className="section-label">Account identity</span><h1>Complete your PayloadGrid profile</h1><p>These details identify the account owner and the workspace operating webhook traffic.</p></header>
    <form onSubmit={save}>
      <fieldset className="account-type-field"><legend>Account type</legend><div className="account-type-options"><label><input type="radio" name="accountType" value="company" checked={accountType === "company"} onChange={() => setAccountType("company")} /><span><strong>Company</strong><small>Registered business or team</small></span></label><label><input type="radio" name="accountType" value="individual" checked={accountType === "individual"} onChange={() => setAccountType("individual")} /><span><strong>Individual</strong><small>Personal projects or evaluation</small></span></label></div></fieldset>
      <div className="account-setup-grid"><label>Full name<input name="name" defaultValue={initial.name} autoComplete="name" required minLength={2} /></label><label>Workspace name<input name="organizationName" defaultValue={initial.organizationName} autoComplete="organization" required minLength={2} /></label></div>
      {accountType === "company" ? <div className="account-setup-grid"><label>Registered company name<input name="legalName" defaultValue={initial.legalName} autoComplete="organization" required minLength={2} /></label><label>Company website <span className="optional-label">Optional</span><input name="website" defaultValue={initial.website} type="url" autoComplete="url" placeholder="https://company.com" /></label></div> : <input name="legalName" type="hidden" value="" />}
      <label>Country code<input name="countryCode" defaultValue={initial.countryCode} autoComplete="country" required pattern="[A-Za-z]{2}" maxLength={2} placeholder="US" /></label>
      <label className="auth-consent"><input name="acceptTerms" type="checkbox" required /><span>I agree to the current <Link href="/terms" target="_blank">Terms</Link> and acknowledge the <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span></label>
      {error ? <div className="form-error">{error}</div> : null}{notice ? <div className="setup-notice"><CheckCircle2 size={17} /> {notice}</div> : null}
      <button className="button primary" disabled={loading}>{loading ? <LoaderCircle className="spin" size={17} /> : <ShieldCheck size={17} />} Save account details <ArrowRight size={16} /></button>
    </form>
    <footer><button className="button ghost" type="button" onClick={() => router.push("/dashboard")}>Continue to dashboard <ArrowRight size={16} /></button></footer>
  </div>;
}
