import Link from "next/link";
import { ArrowRight, Check, CircleCheck, CloudCog, Code2, Globe2, KeyRound, Radio, ShieldCheck, Webhook } from "lucide-react";

export function MarketingHero() {
  return <section className="future-hero">
    <div className="hero-signal-line" aria-hidden="true"><span>EVENT_01</span><i /><span>ROUTED</span><i /><span>DELIVERED</span></div>
    <div className="future-hero-copy" data-reveal>
      <span className="signal-label"><i /> Webhook infrastructure for product teams</span>
      <h1>Reliable webhook infrastructure</h1>
      <p>Send events to customers and receive callbacks from providers through one secure control plane. PayloadGrid handles fan-out, signatures, retries, replay, and the evidence your team needs when delivery fails.</p>
      <div className="hero-actions"><Link className="button primary large" href="/signup">Start building free <ArrowRight size={18} /></Link><a className="button secondary large" href="#developers"><Code2 size={18} /> See the API</a></div>
      <div className="trust-line"><span><Check size={15} /> No card required</span><span><Check size={15} /> Outbound + inbound</span><span><Check size={15} /> Multi-tenant workspace</span></div>
    </div>
    <div className="control-plane" data-reveal aria-label="PayloadGrid delivery control plane">
      <div className="plane-topbar"><div><span /><span /><span /></div><code>payloadgrid / production / live</code><i><Radio size={12} /> CONNECTED</i></div>
      <div className="plane-layout">
        <aside><strong>P</strong><span className="active" /><span /><span /><span /></aside>
        <div className="plane-main">
          <div className="plane-heading"><div><span>MESSAGE</span><strong>order.completed</strong><small>msg_01JHF8Q9</small></div><em><CircleCheck size={14} /> Delivered</em></div>
          <div className="delivery-network">
            <div className="network-node"><CloudCog size={18} /><strong>Your API</strong><small>POST /messages</small></div>
            <div className="flow-connector"><span className="flow-packet" /><i /><ArrowRight size={15} /></div>
            <div className="network-node payloadgrid-node"><img src="/icon.svg" alt="" /><strong>PayloadGrid</strong><small>signed + routed</small></div>
            <div className="flow-connector delay"><span className="flow-packet" /><i /><ArrowRight size={15} /></div>
            <div className="network-node"><Globe2 size={18} /><strong>Customer</strong><small>HTTP 200</small></div>
          </div>
          <div className="live-deliveries"><div className="live-head"><span>DELIVERY ATTEMPTS</span><span>STATUS</span><span>LATENCY</span></div><div className="delivery-attempt success"><span><i>03</i><b>Automatic recovery</b><small>Retried after destination recovered</small></span><em>200 OK</em><code>184ms</code></div><div className="delivery-attempt"><span><i>02</i><b>Service unavailable</b><small>Retry scheduled in 5 minutes</small></span><em>503</em><code>912ms</code></div><div className="delivery-attempt"><span><i>01</i><b>Connection timeout</b><small>Attempt exceeded delivery window</small></span><em>TIMEOUT</em><code>15.0s</code></div></div>
          <div className="plane-security"><KeyRound size={15} /><code>payloadgrid-signature: v1,pxj8...kP2</code><ShieldCheck size={16} /><span>verified</span></div>
        </div>
      </div>
    </div>
  </section>;
}