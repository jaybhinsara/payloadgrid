import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Brand } from "@/components/brand";
import { CatalogTestButton } from "@/components/catalog-test-button";
import { requireSql } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Event catalog", description: "Generated webhook event contracts and integration examples.", robots: { index: false, follow: false } };

export default async function EventCatalog({ params }: { params: Promise<{ applicationUid: string }> }) {
  const { applicationUid } = await params;
  const sql = requireSql();
  const [application] = await sql`select id, name, uid, description, project_id from applications where uid=${applicationUid} limit 1`;
  if (!application) notFound();
  const contracts = await sql`
    select et.id, et.name, et.description, ec.version, ec.schema, ec.example
    from event_types et join lateral (select version, schema, example from event_contract_versions where event_type_id=et.id and status='published' order by version desc limit 1) ec on true
    where et.project_id=${application.project_id} and (et.application_id=${application.id} or et.application_id is null) order by et.name
  `;
  return <main className="catalog-shell"><header className="catalog-nav"><Brand /><span>Generated event catalog</span></header><section className="catalog-hero"><span>APPLICATION CONTRACTS</span><h1>{String(application.name)}</h1><p>{String(application.description || "Versioned webhook events, payload schemas, and integration examples.")}</p><code>{String(application.uid)}</code></section><div className="catalog-layout"><aside><strong>Events</strong>{contracts.map((contract) => <a key={String(contract.id)} href={`#${String(contract.name)}`}>{String(contract.name)} <small>v{Number(contract.version)}</small></a>)}</aside><section className="catalog-events">{contracts.length ? contracts.map((contract) => {
    const example = contract.example ?? {};
    const body = JSON.stringify({ applicationId: application.id, eventType: contract.name, payload: example }, null, 2);
    return <article id={String(contract.name)} key={String(contract.id)}><header><div><span>EVENT CONTRACT · V{Number(contract.version)}</span><h2>{String(contract.name)}</h2><p>{String(contract.description || "No description provided.")}</p></div><CatalogTestButton applicationId={String(application.id)} eventType={String(contract.name)} payload={example} /></header><h3>Example payload</h3><pre>{JSON.stringify(example, null, 2)}</pre><h3>JSON Schema 2020-12</h3><details><summary>View schema</summary><pre>{JSON.stringify(contract.schema, null, 2)}</pre></details><h3>Send with cURL</h3><pre>{`curl -X POST ${SITE_URL}/api/v1/messages \\\n  -H "Authorization: Bearer $PAYLOADGRID_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body.replaceAll("'", "'\\''")}'`}</pre><div className="catalog-snippets"><div><h3>TypeScript</h3><pre>{`await payloadgrid.messages.send({\n  applicationId: "${application.id}",\n  eventType: "${contract.name}",\n  payload\n});`}</pre></div><div><h3>Python</h3><pre>{`client.send_message(\n    application_id="${application.id}",\n    event_type="${contract.name}",\n    payload=payload,\n)`}</pre></div></div></article>;
  }) : <div className="catalog-empty"><h2>No published contracts</h2><p>Publish an event contract from the PayloadGrid dashboard.</p></div>}</section></div></main>;
}
