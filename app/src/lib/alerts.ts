import { requireSql } from "@/lib/db";

type FailureNotice = { projectId: string; eventId: string; eventType: string; error: string };

export async function notifyFailure(notice: FailureNotice) {
  const sql = requireSql();
  const rules = await sql`select id, name, channel, destination, failure_threshold, window_minutes from alert_rules where project_id = ${notice.projectId} and is_active = true`;
  for (const rule of rules) {
    const [summary] = await sql`
      select count(*)::int as failures from webhook_events e
      join endpoints ep on ep.id = e.endpoint_id
      where ep.project_id = ${notice.projectId} and e.status in ('failed', 'retrying')
        and e.received_at >= now() - (${rule.window_minutes} * interval '1 minute')
    `;
    if (Number(summary.failures || 0) < Number(rule.failure_threshold)) continue;
    const [notification] = await sql`insert into alert_notifications (rule_id, event_id) values (${rule.id}, ${notice.eventId}) on conflict do nothing returning id`;
    if (!notification) continue;
    try {
      let response: Response;
      const payload = { source: "HookIn", alert: String(rule.name), eventId: notice.eventId, eventType: notice.eventType, error: notice.error, failuresInWindow: Number(summary.failures), occurredAt: new Date().toISOString() };
      if (rule.channel === "email") {
        const apiKey = process.env.RESEND_API_KEY; const from = process.env.HOOKIN_ALERT_FROM;
        if (!apiKey || !from) throw new Error("RESEND_API_KEY and HOOKIN_ALERT_FROM are required for email alerts");
        response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ from, to: [rule.destination], subject: `[HookIn] ${rule.name}: ${notice.eventType}`, text: `HookIn delivery alert\n\n${notice.eventType} failed delivery.\n${notice.error}\n\nEvent: ${notice.eventId}` }) });
      } else {
        const body = rule.channel === "slack" ? { text: `HookIn alert: *${rule.name}*\n${notice.eventType} failed: ${notice.error}\nEvent ${notice.eventId}` } : payload;
        response = await fetch(String(rule.destination), { method: "POST", headers: { "content-type": "application/json", "user-agent": "HookIn-Alerts/1.0" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      }
      await sql`update alert_notifications set status = ${response.ok ? "sent" : "failed"}, response_status = ${response.status}, error = ${response.ok ? null : `Alert destination HTTP ${response.status}`} where id = ${notification.id}`;
    } catch (error) {
      await sql`update alert_notifications set status = 'failed', error = ${error instanceof Error ? error.message : "Alert failed"} where id = ${notification.id}`;
    }
  }
}