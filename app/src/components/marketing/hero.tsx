import Link from "next/link";
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Check, CircleCheck, Code2, KeyRound, LayoutDashboard, Radio, ShieldCheck } from "lucide-react";

export function MarketingHero({ signedIn = false }: { signedIn?: boolean }) {
  return <section className="future-hero">
    <div className="hero-signal-line" aria-hidden="true"><span>EVENT</span><i /><span>ROUTED</span><i /><span>DELIVERED</span></div>
    <div className="future-hero-copy" data-reveal>
      <span className="signal-label"><i /> Webhook service · Gateway · Delivery platform</span>
      <h1>Every webhook. One place to send, receive, and recover.</h1>
      <p>PayloadGrid is a webhook infrastructure platform for teams that need more than a POST request. Receive third-party callbacks, deliver events to customers, test integrations, recover failures, and give every team one searchable delivery history.</p>
      <div className="hero-actions">{signedIn ? <Link className="button primary large" href="/dashboard"><LayoutDashboard size={18} /> Open dashboard</Link> : <Link className="button primary large" href="/signup">Start building free <ArrowRight size={18} /></Link>}<Link className="button secondary large" href="/playground"><Code2 size={18} /> Open playground</Link></div>
      <div className="trust-line"><span><Check size={15} /> Free 10,000 events / month</span><span><Check size={15} /> No card to start</span><span><Check size={15} /> Inbound + outbound</span></div>
    </div>
    <div className="control-plane" data-reveal aria-label="PayloadGrid delivery control plane">
      <div className="plane-topbar"><div><span /><span /><span /></div><code>payloadgrid / production / live</code><i><Radio size={12} /> CONNECTED</i></div>
      <div className="plane-layout">
        <aside><strong>P</strong><span className="active" /><span /><span /><span /></aside>
        <div className="plane-main">
          <div className="plane-heading"><div><span>UNIFIED EVENT ROUTER</span><strong>Inbound + outbound</strong><small>production · live traffic</small></div><em><CircleCheck size={14} /> Healthy</em></div>
          <div className="direction-lanes" aria-label="Inbound and outbound webhook flows">
            <div className="direction-lane inbound-lane"><span><ArrowDownToLine size={13} /> Inbound</span><strong>Provider</strong><i className="lane-connector"><b /><ArrowRight size={13} /></i><em>PayloadGrid</em><i className="lane-connector delayed"><b /><ArrowRight size={13} /></i><strong>Your handler</strong><small>verified · stored · forwarded</small></div>
            <div className="direction-lane outbound-lane"><span><ArrowUpFromLine size={13} /> Outbound</span><strong>Your API</strong><i className="lane-connector"><b /><ArrowRight size={13} /></i><em>PayloadGrid</em><i className="lane-connector delayed"><b /><ArrowRight size={13} /></i><strong>Customer</strong><small>signed · delivered · recorded</small></div>
          </div>
          <div className="live-deliveries"><div className="live-head"><span>DELIVERY ATTEMPTS</span><span>STATUS</span><span>LATENCY</span></div><div className="delivery-attempt success"><span><i>03</i><b>Automatic recovery</b><small>Retried after destination recovered</small></span><em>200 OK</em><code>184ms</code></div><div className="delivery-attempt"><span><i>02</i><b>Service unavailable</b><small>Retry scheduled in 5 minutes</small></span><em>503</em><code>912ms</code></div><div className="delivery-attempt"><span><i>01</i><b>Connection timeout</b><small>Attempt exceeded delivery window</small></span><em>TIMEOUT</em><code>15.0s</code></div></div>
          <div className="plane-security"><KeyRound size={15} /><code>payloadgrid-signature: v1,pxj8...kP2</code><ShieldCheck size={16} /><span>verified</span></div>
        </div>
      </div>
    </div>
  </section>;
}
