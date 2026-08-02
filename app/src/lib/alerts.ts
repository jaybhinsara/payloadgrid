import { assertSafeDestinationUrl } from "@/lib/destination-security";
import { requireSql } from "@/lib/db";

type FailureNotice = { projectId: string; eventId: string; eventType: string; error: string };
type AlertRule = { name?: unknown; channel?: unknown; destination?: unknown };
type AlertPayload = { source: string; alert: string; eventId: string; eventType: string; error: string; failuresInWindow: number; occurredAt: string };

export async function deliverAlert(rule: AlertRule, payload: AlertPayload) {
  if (rule.channel === "email") {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.PAYLOADGRID_ALERT_FROM;
    if (!apiKey || !from) throw new Error("RESEND_API_KEY and PAYLOADGRID_ALERT_FROM are required for email alerts");
    return fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [String(rule.destination)],
        subject: `[PayloadGrid] ${rule.name}: ${payload.eventType}`,
        text: `PayloadGrid delivery alert\n\n${payload.eventType} failed delivery.\n${payload.error}\n\nEvent: ${payload.eventId}`
      })
    });
  }
  const destination = await assertSafeDestinationUrl(String(rule.destination));
  const body = rule.channel === "slack"
    ? { text: `PayloadGrid alert: *${rule.name}*\n${payload.eventType} failed: ${payload.error}\nEvent ${payload.eventId}` }
    : payload;
  return fetch(destination, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "PayloadGrid-Alerts/1.0" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  });
}

export async function notifyFailure(notice: FailureNotice) {
  const sql = requireSql();
  const rules = await sql`select id, name, channel, destination, failure_threshold, window_minutes from alert_rules where project_id = ${notice.projectId} and is_active = true`;
  for (const rule of rules) {
    const [summary] = await sql`
      select count(*)::int as failures from webhook_events e
      join endpoints ep on ep.id = e.endpoint_id
      where ep.project_id = ${notice.projectId} and e.status in ('failed', 'retrying', 'dead_letter')
        and e.received_at >= now() - (${rule.window_minutes} * interval '1 minute')
    `;
    if (Number(summary.failures || 0) < Number(rule.failure_threshold)) continue;
    const [notification] = await sql`insert into alert_notifications (rule_id, event_id) values (${rule.id}, ${notice.eventId}) on conflict do nothing returning id`;
    if (!notification) continue;
    try {
      const payload = { source: "PayloadGrid", alert: String(rule.name), eventId: notice.eventId, eventType: notice.eventType, error: notice.error, failuresInWindow: Number(summary.failures), occurredAt: new Date().toISOString() };
      const response = await deliverAlert(rule, payload);
      await sql`update alert_notifications set status = ${response.ok ? "sent" : "failed"}, response_status = ${response.status}, error = ${response.ok ? null : `Alert destination HTTP ${response.status}`} where id = ${notification.id}`;
    } catch (error) {
      await sql`update alert_notifications set status = 'failed', error = ${error instanceof Error ? error.message : "Alert failed"} where id = ${notification.id}`;
    }
  }
}