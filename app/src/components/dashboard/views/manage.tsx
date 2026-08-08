"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, BellRing, FileClock, GripVertical, KeyRound, LoaderCircle, Pause, Pencil, Play, Plus, Send, SlidersHorizontal, Trash2, Users, X } from "lucide-react";
import { Empty, SectionHead, timeAgo } from "@/components/dashboard/common";
import type { DashboardData, DashboardMutate, DashboardSubmit } from "@/components/dashboard/types";

type Transformation = DashboardData["transformations"][number];
type AlertRule = DashboardData["alerts"][number];
type AutomationSelection = { kind: "transformation"; item: Transformation } | { kind: "alert"; item: AlertRule };

export function ApiKeysView({ data, busy, submit, revoke, reveal }: { data: DashboardData; busy: string; submit: DashboardSubmit; revoke: (id: string) => void; reveal: (value: string) => void }) {
  return <><SectionHead eyebrow="Developer access" heading="API keys" copy="Keys authenticate server-to-server requests. PayloadGrid stores only a one-way hash." /><section className="split-layout"><form className="content-card form-card" onSubmit={(event) => submit(event, "/api/api-keys", (form) => ({ name: form.get("name") }), (payload) => reveal(String(payload.token || "")))}><h3>Create API key</h3><label>Key name<input name="name" required placeholder="Production server" /></label><button className="button primary" disabled={busy === "/api/api-keys"}><KeyRound size={16} /> Generate key</button></form><section className="content-card list-card">{data.apiKeys.length ? <div className="resource-list">{data.apiKeys.map((key) => <article key={key.id} className={key.revoked_at ? "disabled" : ""}><span className="resource-icon"><KeyRound size={18} /></span><div><strong>{key.name}</strong><code>{key.key_prefix}••••••••••••</code><small>Last used {timeAgo(key.last_used_at)}</small></div>{key.revoked_at ? <span>Revoked</span> : <button className="button danger small" onClick={() => revoke(key.id)}>Revoke</button>}</article>)}</div> : <Empty icon={<KeyRound size={22} />} title="No API keys" copy="Generate a key to send messages from your backend." />}</section></section></>;
}

export function TeamView({ data, busy, submit, reveal, mutate }: { data: DashboardData; busy: string; submit: DashboardSubmit; reveal: (value: string) => void; mutate: DashboardMutate }) {
  const actorRole = data.context.organization.role;
  const canInvite = ["owner", "admin"].includes(actorRole);
  function canManage(member: DashboardData["members"][number]) {
    if (member.role === "owner" || member.id === data.context.user.id) return false;
    return actorRole === "owner" || (actorRole === "admin" && member.role !== "admin");
  }
  async function changeRole(memberId: string, role: string) {
    await mutate(`/api/team/${memberId}`, { role }, "PATCH");
  }
  async function removeMember(member: DashboardData["members"][number]) {
    if (!window.confirm(`Remove ${member.name} from ${data.context.organization.name}? They will immediately lose access to this workspace.`)) return;
    await mutate(`/api/team/${member.id}`, undefined, "DELETE");
  }
  return <><SectionHead eyebrow="Organization" heading="Team access" copy="Roles keep operational access predictable across your workspace." /><section className="split-layout">{canInvite ? <form className="content-card form-card" onSubmit={(event) => submit(event, "/api/team", (form) => ({ email: form.get("email"), role: form.get("role") }), (payload) => { if (payload.inviteUrl) reveal(String(payload.inviteUrl)); })}><h3>Add teammate</h3><label>Email<input name="email" type="email" required placeholder="developer@company.com" /></label><label>Role<select name="role"><option value="developer">Developer</option><option value="viewer">Viewer</option>{actorRole === "owner" ? <option value="admin">Admin</option> : null}</select></label><button className="button primary" disabled={busy === "/api/team"}><Users size={16} /> Add or invite</button></form> : <div className="read-only-note">Your role cannot invite or manage workspace members.</div>}<section className="content-card list-card"><div className="card-head"><h3>{data.members.length} team members</h3></div><div className="resource-list team-member-list">{data.members.map((member) => <article key={member.id}><span className="member-avatar">{member.name.slice(0, 1).toUpperCase()}</span><div><strong>{member.name}{member.id === data.context.user.id ? " (you)" : ""}</strong><small>{member.email}</small></div>{canManage(member) ? <div className="member-actions"><select aria-label={`Role for ${member.name}`} value={member.role} disabled={busy === `/api/team/${member.id}`} onChange={(event) => void changeRole(member.id, event.target.value)}>{actorRole === "owner" ? <option value="admin">Admin</option> : null}<option value="developer">Developer</option><option value="viewer">Viewer</option></select><button className="icon-button danger-icon" disabled={busy === `/api/team/${member.id}`} onClick={() => void removeMember(member)} title={`Remove ${member.name}`}><Trash2 size={15} /></button></div> : <span className="role-pill">{member.role}</span>}</article>)}</div></section></section></>;
}
export function AutomationsView({ data, busy, submit, mutate }: { data: DashboardData; busy: string; submit: DashboardSubmit; mutate: DashboardMutate }) {
  const [editing, setEditing] = useState<AutomationSelection | null>(null);
  const [testResult, setTestResult] = useState("");
  const canManage = ["owner", "admin", "developer"].includes(data.context.organization.role);
  const canDelete = ["owner", "admin"].includes(data.context.organization.role);

  async function updateTransformation(item: Transformation, isActive: boolean) {
    await mutate(`/api/settings/${item.id}`, { kind: "transformation", name: item.name, eventType: item.event_type, config: item.config, isActive }, "PATCH");
  }
  async function updateAlert(item: AlertRule, isActive: boolean) {
    await mutate(`/api/settings/${item.id}`, { kind: "alert", name: item.name, channel: item.channel, destination: item.destination, failureThreshold: item.failure_threshold, windowMinutes: item.window_minutes, isActive }, "PATCH");
  }
  async function remove(kind: "transformation" | "alert", id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    await mutate(`/api/settings/${id}?kind=${kind}`, undefined, "DELETE");
  }
  async function testAlert(item: AlertRule) {
    setTestResult("Sending test alert...");
    const result = await mutate(`/api/settings/${item.id}/test`);
    setTestResult(result ? `Test delivered with HTTP ${result.responseStatus}.` : "Test delivery failed. Review the error above.");
  }

  return <>
    <SectionHead eyebrow="Delivery controls" heading="Automations" copy="Transform payloads before delivery and notify your team when delivery health crosses a threshold." />
    {canManage ? <section className="automation-grid">
      <form className="content-card form-card" onSubmit={(event) => submit(event, "/api/settings", (form) => ({ kind: "transformation", name: form.get("name"), eventType: form.get("eventType") || undefined, config: { addFields: JSON.parse(String(form.get("addFields") || "{}")), removeFields: String(form.get("removeFields") || "").split(",").map((value) => value.trim()).filter(Boolean) } }))}><span className="resource-icon"><SlidersHorizontal size={18} /></span><h3>Payload transformation</h3><label>Name<input name="name" required placeholder="Add API version" /></label><label>Event type <small>Empty applies to all</small><input name="eventType" placeholder="order.created" /></label><label>Fields to add <small>JSON object</small><textarea className="code-input small" name="addFields" defaultValue="{}" /></label><label>Fields to remove <small>Comma separated</small><input name="removeFields" placeholder="internal_note, debug" /></label><button className="button primary" disabled={busy === "/api/settings"}><Plus size={16} /> Add transformation</button></form>
      <form className="content-card form-card" onSubmit={(event) => submit(event, "/api/settings", (form) => ({ kind: "alert", name: form.get("name"), channel: form.get("channel"), destination: form.get("destination"), failureThreshold: Number(form.get("failureThreshold")), windowMinutes: Number(form.get("windowMinutes")) }))}><span className="resource-icon"><BellRing size={18} /></span><h3>Failure alert</h3><label>Name<input name="name" required placeholder="Production failures" /></label><label>Channel<select name="channel"><option value="email">Email</option><option value="slack">Slack webhook</option><option value="webhook">Custom webhook</option></select></label><label>Destination<input name="destination" required placeholder="ops@company.com or https://..." /></label><div className="form-row"><label>Failures<input name="failureThreshold" type="number" min="1" max="100" defaultValue="3" /></label><label>Window (minutes)<input name="windowMinutes" type="number" min="1" max="1440" defaultValue="15" /></label></div><button className="button primary" disabled={busy === "/api/settings"}><Plus size={16} /> Add alert</button></form>
    </section> : <div className="read-only-note">Viewer access is read-only. An owner, admin, or developer can manage automations.</div>}
    {canManage ? <SchemaMapper submit={submit} busy={busy} /> : null}

    <section className="overview-grid automation-lists">
      <AutomationList title="Transformations" count={data.transformations.length} icon={<SlidersHorizontal size={17} />} empty="Messages are delivered exactly as sent.">
        {data.transformations.map((item) => <AutomationRow key={item.id} name={item.name} copy={`${item.event_type || "All events"} · ${(item.config.mappings || []).length} mapped · ${Object.keys(item.config.addFields || {}).length} added · ${(item.config.removeFields || []).length} removed`} active={item.is_active} icon={<SlidersHorizontal size={17} />} actions={canManage ? <><button className="icon-button" onClick={() => void updateTransformation(item, !item.is_active)} title={item.is_active ? "Pause transformation" : "Enable transformation"}>{item.is_active ? <Pause size={14} /> : <Play size={14} />}</button><button className="icon-button" onClick={() => setEditing({ kind: "transformation", item })} title="Edit transformation"><Pencil size={14} /></button>{canDelete ? <button className="icon-button danger-icon" onClick={() => void remove("transformation", item.id, item.name)} title="Delete transformation"><Trash2 size={14} /></button> : null}</> : null} />)}
      </AutomationList>
      <AutomationList title="Alert rules" count={data.alerts.length} icon={<BellRing size={17} />} empty="Add a destination to receive failure notifications.">
        {data.alerts.map((item) => <AutomationRow key={item.id} name={item.name} copy={`${item.channel} · ${item.failure_threshold} failures in ${item.window_minutes}m`} active={item.is_active} icon={<BellRing size={17} />} actions={canManage ? <><button className="icon-button" onClick={() => void testAlert(item)} title="Send test alert"><Send size={14} /></button><button className="icon-button" onClick={() => void updateAlert(item, !item.is_active)} title={item.is_active ? "Pause alert" : "Enable alert"}>{item.is_active ? <Pause size={14} /> : <Play size={14} />}</button><button className="icon-button" onClick={() => setEditing({ kind: "alert", item })} title="Edit alert"><Pencil size={14} /></button>{canDelete ? <button className="icon-button danger-icon" onClick={() => void remove("alert", item.id, item.name)} title="Delete alert"><Trash2 size={14} /></button> : null}</> : null} />)}
      </AutomationList>
    </section>
    {testResult ? <div className="automation-result"><BellRing size={15} />{testResult}<button onClick={() => setTestResult("")} aria-label="Dismiss test result"><X size={14} /></button></div> : null}
    <NotificationHistory data={data} />
    <section className="content-card audit-card"><div className="card-head"><div><span className="section-label">Security history</span><h3>Audit log</h3></div></div>{data.auditLogs.length ? <div className="audit-list">{data.auditLogs.map((log) => <div key={log.id}><span className="audit-dot" /><strong>{log.action.replaceAll(".", " ")}</strong><small>{log.resource_type}{log.resource_id ? ` · ${log.resource_id.slice(0, 12)}` : ""}</small><time>{timeAgo(log.created_at)}</time></div>)}</div> : <Empty icon={<FileClock size={21} />} title="No audit activity" copy="Organization changes will be recorded here." />}</section>
    {editing ? <AutomationEditor selection={editing} mutate={mutate} close={() => setEditing(null)} /> : null}
  </>;
}

function SchemaMapper({ submit, busy }: { submit: DashboardSubmit; busy: string }) {
  const [rows, setRows] = useState([{ from: "data.order_id", to: "order.id" }]);
  return <form className="content-card schema-mapper" onSubmit={(event) => submit(event, "/api/settings", (form) => ({ kind: "transformation", name: form.get("name"), eventType: form.get("eventType") || undefined, config: { mappings: rows.filter((row) => row.from.trim() && row.to.trim()) } }))}>
    <div className="card-head"><div><span className="section-label">Visual node mapper</span><h3>Map source fields to your delivery schema</h3></div><SlidersHorizontal size={18} /></div>
    <p>Connect nested JSON paths without writing a custom parser. Source values are copied into their destination paths before delivery.</p>
    <div className="mapper-meta"><label>Name<input name="name" required placeholder="Normalize Shopify orders" /></label><label>Event type <small>Optional</small><input name="eventType" placeholder="order.created" /></label></div>
    <div className="mapper-labels"><span>Inbound source path</span><span>Outbound destination path</span></div>
    <div className="mapper-rows">{rows.map((row, index) => <div className="mapper-row" key={index}><GripVertical size={15} /><input aria-label={`Source path ${index + 1}`} value={row.from} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, from: event.target.value } : item))} /><ArrowRight size={16} /><input aria-label={`Destination path ${index + 1}`} value={row.to} onChange={(event) => setRows((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, to: event.target.value } : item))} /><button className="icon-button danger-icon" type="button" onClick={() => setRows((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={rows.length === 1} title="Remove mapping"><Trash2 size={14} /></button></div>)}</div>
    <footer><button className="button secondary small" type="button" onClick={() => setRows((current) => [...current, { from: "", to: "" }])}><Plus size={14} /> Add mapping</button><button className="button primary" disabled={busy === "/api/settings"}><SlidersHorizontal size={15} /> Save mapper</button></footer>
  </form>;
}

function AutomationList({ title, count, icon, empty, children }: { title: string; count: number; icon: React.ReactNode; empty: string; children: React.ReactNode[] }) {
  return <article className="content-card list-card automation-card"><div className="card-head"><h3>{title}</h3><span>{count}</span></div>{children.length ? <div className="automation-resource-list">{children}</div> : <Empty icon={icon} title={`No ${title.toLowerCase()}`} copy={empty} />}</article>;
}

function AutomationRow({ name, copy, active, icon, actions }: { name: string; copy: string; active: boolean; icon: React.ReactNode; actions: React.ReactNode }) {
  return <article className={active ? "" : "disabled"}><span className="resource-icon">{icon}</span><div><strong>{name}</strong><small>{copy}</small></div><span className={`automation-state ${active ? "active" : "paused"}`}><i />{active ? "Active" : "Paused"}</span>{actions ? <div className="automation-actions">{actions}</div> : null}</article>;
}

function NotificationHistory({ data }: { data: DashboardData }) {
  return <section className="content-card notification-card"><div className="card-head"><div><span className="section-label">Alert evidence</span><h3>Notification history</h3></div><span>{data.alertNotifications.length}</span></div>{data.alertNotifications.length ? <div className="notification-list">{data.alertNotifications.map((item) => <article key={item.id}><span className={`notification-status ${item.status}`}>{item.status}</span><div><strong>{item.rule_name}</strong><small>{item.event_type} · {item.channel}</small></div><span>{item.response_status ? `HTTP ${item.response_status}` : item.error || "No response"}</span><time>{timeAgo(item.created_at)}</time></article>)}</div> : <Empty icon={<BellRing size={21} />} title="No alert notifications" copy="Triggered alert attempts will appear here with their delivery result." />}</section>;
}

function AutomationEditor({ selection, mutate, close }: { selection: AutomationSelection; mutate: DashboardMutate; close: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const body = selection.kind === "transformation"
        ? { kind: "transformation", name: form.get("name"), eventType: form.get("eventType") || null, config: { addFields: JSON.parse(String(form.get("addFields") || "{}")), removeFields: String(form.get("removeFields") || "").split(",").map((value) => value.trim()).filter(Boolean), renameFields: selection.item.config.renameFields || {} }, isActive: form.get("isActive") === "on" }
        : { kind: "alert", name: form.get("name"), channel: form.get("channel"), destination: form.get("destination"), failureThreshold: Number(form.get("failureThreshold")), windowMinutes: Number(form.get("windowMinutes")), isActive: form.get("isActive") === "on" };
      const result = await mutate(`/api/settings/${selection.item.id}`, body, "PATCH");
      if (result) close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invalid automation configuration"); }
    finally { setSaving(false); }
  }
  return <div className="drawer-backdrop" onMouseDown={close}><aside className="endpoint-drawer automation-drawer" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="section-label">Automation settings</span><h2>{selection.item.name}</h2><p>{selection.kind === "alert" ? "Failure notification rule" : "Outbound payload transformation"}</p></div><button className="icon-button" onClick={close} aria-label="Close automation settings"><X size={19} /></button></header><form onSubmit={save}>
    <label>Name<input name="name" required defaultValue={selection.item.name} /></label>
    {selection.kind === "transformation" ? <><label>Event type<small>Empty applies to all event types.</small><input name="eventType" defaultValue={selection.item.event_type || ""} /></label><label>Fields to add<small>JSON object</small><textarea className="code-input" name="addFields" defaultValue={JSON.stringify(selection.item.config.addFields || {}, null, 2)} /></label><label>Fields to remove<small>Comma separated</small><input name="removeFields" defaultValue={(selection.item.config.removeFields || []).join(", ")} /></label></> : <><label>Channel<select name="channel" defaultValue={selection.item.channel}><option value="email">Email</option><option value="slack">Slack webhook</option><option value="webhook">Custom webhook</option></select></label><label>Destination<input name="destination" required defaultValue={selection.item.destination} /></label><div className="form-row"><label>Failures<input name="failureThreshold" type="number" min="1" max="100" defaultValue={selection.item.failure_threshold} /></label><label>Window (minutes)<input name="windowMinutes" type="number" min="1" max="1440" defaultValue={selection.item.window_minutes} /></label></div></>}
    <label className="check-control"><input name="isActive" type="checkbox" defaultChecked={selection.item.is_active} /><span><strong>Automation active</strong><small>Paused automations remain saved but do not run.</small></span></label>
    {error ? <div className="inline-error">{error}</div> : null}<button className="button primary" disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <Pencil size={16} />} Save changes</button>
  </form></aside></div>;
}
