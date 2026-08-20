import { neon } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const mode = process.argv[2];
const databaseUrl = process.env.RECOVERY_DATABASE_URL;
const evidencePath = process.env.RECOVERY_EVIDENCE_FILE || "recovery-evidence.json";

if (!['capture', 'verify'].includes(mode)) throw new Error("Use capture or verify mode.");
if (!databaseUrl) throw new Error("RECOVERY_DATABASE_URL is required. Use a read-only credential where possible.");
if (process.env.RECOVERY_APPROVAL !== "I_APPROVE_READ_ONLY_RECOVERY_CHECK") {
  throw new Error("Set RECOVERY_APPROVAL=I_APPROVE_READ_ONLY_RECOVERY_CHECK after confirming the target database.");
}

const sql = neon(databaseUrl);
const tableNames = [
  "users", "organizations", "organization_members", "projects", "applications", "endpoints",
  "messages", "webhook_events", "delivery_attempts", "dispatch_jobs", "api_keys", "audit_logs"
];

async function snapshot() {
  const identity = await sql`select current_database() as database_name, current_user as database_user, now() as captured_at`;
  const tables = {};
  for (const table of tableNames) {
    const exists = await sql`select to_regclass(${`public.${table}`}) is not null as present`;
    if (!exists[0]?.present) { tables[table] = { present: false, count: 0 }; continue; }
    const rows = await sql.query(`select count(*)::bigint as count from ${table}`, []);
    tables[table] = { present: true, count: Number(rows[0]?.count || 0) };
  }
  const integrity = await sql`
    select
      (select count(*)::int from projects p left join organizations o on o.id=p.organization_id where o.id is null) as orphan_projects,
      (select count(*)::int from endpoints ep left join projects p on p.id=ep.project_id where p.id is null) as orphan_endpoints,
      (select count(*)::int from webhook_events e left join endpoints ep on ep.id=e.endpoint_id where ep.id is null) as orphan_events,
      (select count(*)::int from dispatch_jobs j left join webhook_events e on e.id=j.event_id where e.id is null) as orphan_dispatch_jobs,
      (select count(*)::int from delivery_attempts a left join webhook_events e on e.id=a.event_id where e.id is null) as orphan_attempts
  `;
  const latest = await sql`
    select
      (select max(created_at) from messages) as latest_message,
      (select max(received_at) from webhook_events) as latest_event,
      (select max(created_at) from delivery_attempts) as latest_attempt,
      (select min(created_at) from dispatch_jobs where status in ('pending','publishing')) as oldest_open_dispatch
  `;
  return { version: 1, identity: identity[0], tables, integrity: integrity[0], latest: latest[0] };
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

const current = await snapshot();
if (mode === "capture") {
  const evidence = { ...current, digest: digest(current) };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
  console.log(`Recovery baseline written to ${evidencePath}. No database data was modified.`);
} else {
  const expected = JSON.parse(await readFile(evidencePath, "utf8"));
  const failures = [];
  for (const table of tableNames) {
    const before = Number(expected.tables?.[table]?.count || 0);
    const restored = Number(current.tables?.[table]?.count || 0);
    if (restored < before) failures.push(`${table}: restored ${restored}, expected at least ${before}`);
  }
  for (const [name, count] of Object.entries(current.integrity || {})) {
    if (Number(count) !== 0) failures.push(`${name}: ${count}`);
  }
  const report = { checkedAt: new Date().toISOString(), baselineCapturedAt: expected.identity?.captured_at, restoredDatabase: current.identity?.database_name, failures, current };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}
